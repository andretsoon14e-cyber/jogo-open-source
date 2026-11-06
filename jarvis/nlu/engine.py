"""Interpretador de intenções baseado em regras (sem IA externa, sem nuvem).

Como funciona
-------------
1. A frase é normalizada (acentos, abreviações, sinônimos canônicos).
2. Cada comando registrado possui um ou mais "padrões" formados por grupos de
   palavras obrigatórias (com alternativas) e grupos opcionais.
3. O casamento tolera variações e erros de reconhecimento (similaridade difusa).
4. Vence o padrão mais específico (mais grupos obrigatórios atendidos).
5. Se nada casar, o assistente admite que não entendeu — nunca inventa.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

from . import extract, normalizer as nz

FUZZY_THRESHOLD = 0.90
MIN_FUZZY_LEN = 5


def _as_groups(items: Iterable[str | Sequence[str]]) -> list[list[str]]:
    groups: list[list[str]] = []
    for item in items:
        if isinstance(item, str):
            groups.append([item])
        else:
            groups.append([str(x) for x in item])
    return groups


@dataclass
class Pattern:
    must: list[list[str]]
    optional: list[list[str]] = field(default_factory=list)
    extract: list[str] = field(default_factory=list)


@dataclass
class Command:
    intent: str
    patterns: list[Pattern]
    handler: Callable[..., Any]
    level: int = 1
    category: str = "geral"
    description: str = ""
    examples: list[str] = field(default_factory=list)
    priority: int = 0
    requires_app: bool = False
    gate: bool = True          # False quando o handler já pede confirmação internamente

    def to_public(self) -> dict:
        return {
            "intent": self.intent,
            "level": self.level,
            "category": self.category,
            "description": self.description,
            "examples": self.examples,
            "patterns": [" ".join(g[0] for g in p.must) for p in self.patterns],
        }


@dataclass
class Match:
    command: Command
    pattern: Pattern
    confidence: float
    score: float
    slots: dict
    normalized: str
    matched_spans: list[tuple[int, int]]


EXTRACTORS: dict[str, Callable[[str], Any]] = {
    "duration": extract.parse_duration,
    "when": extract.parse_when,
    "clock": extract.parse_time_of_day,
    "number": extract.parse_number,
    "path": extract.path_like,
    "quoted": extract.quoted,
}


class IntentEngine:
    def __init__(self) -> None:
        self.commands: dict[str, Command] = {}

    # --------------------------------------------------------------- register
    def register(self, command: Command) -> None:
        existing = self.commands.get(command.intent)
        if existing:
            existing.patterns.extend(command.patterns)
            existing.examples.extend(command.examples or [])
            return
        self.commands[command.intent] = command

    def add_pattern(self, intent: str, must, optional=(), extract_names=()) -> None:
        cmd = self.commands[intent]
        cmd.patterns.append(
            Pattern(_as_groups(must), _as_groups(optional), list(extract_names))
        )

    def get(self, intent: str) -> Command | None:
        return self.commands.get(intent)

    # ------------------------------------------------------------------ match
    def match(self, text: str) -> Match | None:
        norm = nz.normalize(text)
        if not norm:
            return None
        tokens = norm.split()
        best: Match | None = None

        for command in self.commands.values():
            for pattern in command.patterns:
                result = self._match_pattern(pattern, tokens)
                if result is None:
                    continue
                score, spans, optional_hits = result
                score += command.priority
                confidence = min(0.99, 0.55 + 0.07 * len(pattern.must) + 0.03 * optional_hits)
                if best is None or score > best.score + 1e-9:
                    best = Match(
                        command=command,
                        pattern=pattern,
                        confidence=round(confidence, 2),
                        score=score,
                        slots={},
                        normalized=norm,
                        matched_spans=spans,
                    )
        if best is None:
            return None

        # Texto residual (útil para nomes de apps, arquivos, rotinas, títulos).
        residual_tokens = [
            tok for i, tok in enumerate(tokens)
            if not any(start <= i < end for start, end in best.matched_spans)
            and tok not in nz.FILLERS
        ]
        best.slots["residual"] = " ".join(residual_tokens)
        for name in best.pattern.extract:
            fn = EXTRACTORS.get(name)
            if fn:
                try:
                    best.slots[name] = fn(text)
                except Exception:
                    best.slots[name] = None
        return best

    def _match_pattern(self, pattern: Pattern, tokens: list[str]) -> tuple[float, list[tuple[int, int]], int] | None:
        spans: list[tuple[int, int]] = []
        score = 0.0
        used: set[int] = set()

        def find_phrase(phrase_words: list[str]) -> tuple[int, int] | None:
            size = len(phrase_words)
            for start in range(len(tokens) - size + 1):
                if any(i in used for i in range(start, start + size)):
                    continue
                ok = True
                for offset, word in enumerate(phrase_words):
                    token = tokens[start + offset]
                    if token == word:
                        continue
                    # palavras curtas só casam por igualdade — evita falsos positivos
                    if len(token) < MIN_FUZZY_LEN or len(word) < MIN_FUZZY_LEN:
                        ok = False
                        break
                    if nz.similarity(token, word) < FUZZY_THRESHOLD:
                        ok = False
                        break
                if ok:
                    return (start, start + size)
            return None

        for group in pattern.must:
            found = None
            for alternative in group:
                span = find_phrase(nz.normalize(alternative).split())
                if span:
                    found = span
                    break
            if found is None:
                return None
            spans.append(found)
            used.update(range(*found))
            score += 10 + (len(found) * 0.5)

        optional_hits = 0
        for group in pattern.optional:
            for alternative in group:
                span = find_phrase(nz.normalize(alternative).split())
                if span:
                    spans.append(span)
                    used.update(range(*span))
                    score += 2.5
                    optional_hits += 1
                    break
        return score, spans, optional_hits

    # ------------------------------------------------------------------ misc
    def describe(self) -> list[dict]:
        return [cmd.to_public() for cmd in sorted(self.commands.values(),
                                                  key=lambda c: (c.category, c.intent))]

    DEFAULT_SUGGESTIONS = ["ajuda", "quais são minhas tarefas", "status do sistema"]

    def suggest(self, text: str, limit: int = 3) -> list[str]:
        """Sugere exemplos úteis quando o comando não é reconhecido.

        Só sugere uma intenção quando há pelo menos duas palavras relevantes em
        comum — uma única preposição ("sobre", "para") gerava sugestões absurdas.
        """
        tokens = {t for t in nz.normalize(text).split()
                  if t not in nz.FILLERS and len(t) >= 4}
        scored: list[tuple[int, str]] = []
        for command in self.commands.values():
            words = {
                w for pattern in command.patterns
                for group in pattern.must
                for alt in group
                for w in nz.normalize(alt).split()
                if w not in nz.FILLERS and len(w) >= 4
            }
            overlap = len(tokens & words)
            if overlap >= 2:
                scored.append((overlap, command.examples[0] if command.examples else command.intent))
        scored.sort(key=lambda item: item[0], reverse=True)
        seen, out = set(), []
        for _, example in scored:
            if example not in seen:
                seen.add(example)
                out.append(example)
            if len(out) >= limit:
                break
        for example in self.DEFAULT_SUGGESTIONS:
            if len(out) >= limit:
                break
            if example not in seen:
                seen.add(example)
                out.append(example)
        return out


engine = IntentEngine()


def load_commands() -> None:
    """Importa os módulos de comando, que se registram no motor via decorador."""
    from ..commands import (  # noqa: F401
        advisor_cmds, app_cmds, assistant_cmds, conversation_cmds, file_cmds,
        memory_cmds, routine_cmds, system_cmds, voice_cmds,
    )


def command(intent: str, must, optional=(), level: int = 1, category: str = "geral",
            description: str = "", examples: Iterable[str] = (), priority: int = 0,
            extract_names: Sequence[str] = (), extra_patterns: Sequence[dict] = (),
            gate: bool = True):
    """Decorador que registra um comando no motor global."""

    def decorator(fn):
        cmd = Command(
            intent=intent,
            patterns=[Pattern(_as_groups(must), _as_groups(optional), list(extract_names))],
            handler=fn,
            level=level,
            category=category,
            description=description,
            examples=list(examples),
            priority=priority,
            gate=gate,
        )
        for extra in extra_patterns:
            cmd.patterns.append(
                Pattern(
                    _as_groups(extra.get("must", [])),
                    _as_groups(extra.get("optional", [])),
                    list(extra.get("extract", [])),
                )
            )
        engine.register(cmd)
        return fn

    return decorator
