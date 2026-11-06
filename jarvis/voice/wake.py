"""Detecção da palavra de ativação ("Jarvis") de forma local e tolerante a erros."""
from __future__ import annotations

import re

from ..nlu.normalizer import normalize, similarity

VARIANTS = {
    "jarvis", "jarves", "jarvez", "jervis", "jarvi", "jarvi", "jarvis.", "javis", "jarvis,",
    "jarbas", "charles", "jarv", "jar", "arvis",
}


def detect(text: str, sensitivity: float = 0.78) -> bool:
    if not text:
        return False
    norm = normalize(text)
    tokens = re.findall(r"[a-z]+", norm)
    for index, token in enumerate(tokens):
        if token in VARIANTS:
            return True
        if len(token) >= 4 and similarity(token, "jarvis") >= sensitivity:
            return True
        # reconhecedores às vezes separam: "jar vis"
        if token == "jar" and index + 1 < len(tokens) and tokens[index + 1].startswith("vis"):
            return True
    return False


def strip(text: str) -> str:
    """Remove a palavra de ativação mantendo o restante da frase."""
    cleaned = re.sub(r"(?i)\b(j[aá]r\s?vis|jarves|jervis|javis|jarbas)\b[,\s]*", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.;!?")
    return cleaned


def is_stop_command(text: str, stop_words: list[str]) -> bool:
    """Detecta ordens de interrupção: 'jarvis, pare'."""
    norm = normalize(text)
    tokens = set(norm.split())
    return any(word in tokens for word in (w.lower() for w in stop_words))


def is_confirmation(text: str) -> bool | None:
    """Interpreta resposta falada de confirmação. None = não é confirmação."""
    norm = normalize(text).strip()
    yes = {"sim", "confirmo", "confirmado", "pode", "pode fazer", "claro", "isso", "autorizo",
           "manda", "vai", "ok", "beleza", "positivo", "com certeza", "aceito", "aprovo"}
    no = {"nao", "não", "cancela", "cancelar", "negativo", "deixa", "deixa pra la", "para",
          "pare", "aborta", "desisto", "nao quero", "melhor nao"}
    if norm in yes:
        return True
    if norm in no:
        return False
    tokens = set(norm.split())
    if tokens & yes and not tokens & no:
        return True
    if tokens & no:
        return False
    return None
