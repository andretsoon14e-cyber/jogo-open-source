"""Memória de longo prazo: guardar, consultar e esquecer informações autorizadas."""
from __future__ import annotations

import re

from ..nlu.engine import command
from .base import Context
from .helpers import human_list, ok

MARKERS = ["lembre-se de que", "lembre se de que", "lembre-se que", "lembre se que",
           "memorize que", "memorize", "guarde que", "guarde", "grave que", "grave",
           "salve que", "salve", "registre que", "registre", "memoriza que"]


def _extract_fact(text: str) -> str | None:
    pattern = r"(?i)(?:" + "|".join(re.escape(m) for m in MARKERS) + r")\s+(.+)"
    match = re.search(pattern, text)
    if not match:
        return None
    return match.group(1).strip(" .,!?\"'") or None


@command("memory.remember",
         must=[["memorizar"], ["que"]],
         extra_patterns=[{"must": [["lembrar"], ["que"]]},
                         {"must": [["lembre"], ["que"]]},
                         {"must": [["lembrar", "lembre"]]},
                         {"must": [["guardar", "guarde"], ["que"]]}],
         category="memoria",
         description="Guarda uma informação na memória local",
         examples=["Jarvis, lembre-se de que prefiro acordar às 7 horas"],
         priority=5)
def remember(ctx: Context):
    fact = _extract_fact(ctx.text)
    if not fact:
        return ok(ctx, "O que devo lembrar? Diga algo como “lembre-se de que prefiro reuniões pela manhã”.")
    category = "preferencia" if re.search(r"(?i)prefiro|gosto|odeio|detesto|preferência", fact) else "fato"
    key = None
    match = re.search(r"(?i)^(?:meu|minha)\s+([\wÀ-ÿ ]{2,30})\s+(?:é|e|são)\b", fact)
    if match:
        key = match.group(1).strip()
        category = "perfil"
    memory_id = ctx.db.add_memory(fact, key=key, category=category)
    ctx.assistant.audit.record("memory.add", fact, level=1)
    return ok(ctx, "Informação registrada. Vou considerá-la nas próximas organizações da sua rotina.",
              memory_id=memory_id, category=category)


@command("memory.recall",
         must=[["saber"], ["mim", "sobre", "preferencia"]],
         extra_patterns=[
             {"must": [["o"], ["que"], ["voce"], ["saber"]], "optional": [["mim"]]},
             {"must": [["minhas"], ["preferencia"]]},
             {"must": [["lembrar"], ["mim"]]},
             {"must": [["memoria"], ["sobre"]]},
         ],
         category="memoria",
         description="Mostra o que está guardado sobre o usuário",
         examples=["O que você sabe sobre mim?", "Quais são minhas preferências?"],
         priority=5)
def recall(ctx: Context):
    rows = ctx.db.list_memories(limit=25)
    if not rows:
        return ok(ctx, "Ainda não tenho nada registrado sobre o senhor. "
                       "Diga “lembre-se de que…” para começar a construir minha memória.")
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(row.get("category") or "fato", []).append(row["value"])
    parts = []
    for category, values in grouped.items():
        parts.append(f"{category}: {human_list(values, 4, 'e')}")
    text = "Está registrado na memória local — " + "; ".join(parts) + \
           ". O senhor pode consultar, editar ou apagar tudo na aba Memória da interface."
    return ok(ctx, text, memories=rows)


@command("memory.search",
         must=[["saber"], ["sobre"]],
         category="memoria",
         description="Procura um assunto na memória local",
         examples=["O que você sabe sobre meu projeto?"],
         priority=4)
def search_memory(ctx: Context):
    match = re.search(r"(?i)sobre\s+(.+)", ctx.text)
    term = (match.group(1) if match else "").strip(" ?.!")
    if not term:
        return ok(ctx, "Sobre qual assunto devo procurar?")
    rows = ctx.db.search_memories(term) + ctx.db.search_notes(term)
    if not rows:
        return ok(ctx, f"Não tenho nada registrado sobre “{term}”. "
                       "Se quiser que eu guarde, diga “lembre-se de que…”.")
    values = [row.get("value") or row.get("body") or "" for row in rows[:5]]
    return ok(ctx, f"Sobre “{term}” encontrei: {human_list(values, 4)}.", results=rows)


@command("memory.forget",
         must=[["esquecer"]],
         extra_patterns=[{"must": [["excluir"], ["memoria"]]}],
         level=3,
         category="memoria",
         description="Remove uma informação da memória",
         examples=["Esqueça que eu prefiro acordar cedo"],
         priority=4,
         gate=False)
def forget(ctx: Context):
    match = re.search(r"(?i)(?:esquecer|esqueça|esqueca)\s+(?:que\s+)?(.+)", ctx.text)
    term = (match.group(1) if match else ctx.residual()).strip(" .!?")
    if not term:
        return ok(ctx, "Qual informação devo apagar da memória?")
    from .helpers import ask_confirmation
    from ..core.response import Response

    rows = ctx.db.search_memories(term, limit=10)
    if not rows:
        return ok(ctx, f"Não encontrei nada parecido com “{term}” na memória.")

    def run():
        removed = sum(1 for row in rows if ctx.db.delete_memory(row["id"]))
        ctx.assistant.audit.record("memory.forget", f"{removed} registro(s): {term}", level=3,
                                   confirmed=True)
        return ok(ctx, f"{removed} registro(s) apagado(s) da memória local.", removed=removed)

    if ctx.dry_run:
        return Response(reply=f"Vou apagar {len(rows)} registro(s) sobre “{term}”.", intent=ctx.intent,
                        source=ctx.source)
    return ask_confirmation(
        ctx, f"apagar {len(rows)} registro(s) de memória sobre “{term}”", 3, run,
        preview={"registros": [row["value"] for row in rows[:6]]},
    )


@command("memory.clear",
         must=[["excluir"], ["memoria", "tudo"]],
         level=3,
         category="memoria",
         description="Apaga toda a memória de longo prazo",
         examples=["Apague toda a minha memória"],
         priority=3,
         gate=False)
def clear_memory(ctx: Context):
    rows = ctx.db.list_memories(limit=1000)
    if not rows:
        return ok(ctx, "A memória já está vazia.")
    from .helpers import ask_confirmation
    from ..core.response import Response

    def run():
        for row in rows:
            ctx.db.delete_memory(row["id"])
        ctx.assistant.audit.record("memory.clear", f"{len(rows)} registros", level=3, confirmed=True)
        return ok(ctx, "Memória apagada. Nenhum dado permanece no banco local.", removed=len(rows))

    if ctx.dry_run:
        return Response(reply=f"Vou apagar {len(rows)} registro(s) de memória.", intent=ctx.intent,
                        source=ctx.source)
    return ask_confirmation(ctx, f"apagar TODA a memória ({len(rows)} registros)", 3, run)
