"""Extração de entidades (slots) de comandos em português: horários, durações,
caminhos, aplicativos, quantidades e textos livres."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from . import normalizer as nz

WEEKDAYS = {
    "segunda": 0, "terca": 1, "quarta": 2, "quinta": 3, "sexta": 4, "sabado": 5, "domingo": 6,
    "segunda-feira": 0, "terca-feira": 1, "quarta-feira": 2, "quinta-feira": 3,
    "sexta-feira": 4, "sabado-feira": 5, "domingo-feira": 6,
}
MONTHS = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}


def _clean(text: str) -> str:
    return nz.words_to_numbers(nz.normalize(text))


# ------------------------------------------------------------------ duração --
def parse_duration(text: str) -> int | None:
    """'30 minutos', '1 hora e meia', '2h30', 'meia hora' -> segundos."""
    t = _clean(text)
    total = 0
    found = False
    if "meia hora" in t or "hora e meia" in t:
        total += 1800
        found = True
    m = re.search(r"(\d+)\s*horas?\s*(?:e\s*)?(\d+)\s*(?:min|minutos)?", t)
    if m and ("hora" in m.group(0) or ":" in m.group(0)):
        total += int(m.group(1)) * 3600
        if m.group(2):
            total += int(m.group(2)) * 60
        found = True
    else:
        m = re.search(r"(\d+)\s*(?:horas?|hrs?)\b", t)
        if m:
            total += int(m.group(1)) * 3600
            found = True
    m = re.search(r"(\d+)\s*(?:minutos?|mins?)\b", t)
    if m:
        total += int(m.group(1)) * 60
        found = True
    m = re.search(r"(\d+)\s*(?:segundos?|segs?)\b", t)
    if m:
        total += int(m.group(1))
        found = True
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", t)
    if m and not re.search(r"(\d+)\s*horas?\b", t):
        total = int(m.group(1)) * 3600 + int(m.group(2)) * 60
        found = True
    m = re.search(r"\b(\d)\s*(?:m|min)\b", t)
    if m and not found:
        total += int(m.group(1)) * 60
        found = True
    return total if found and total > 0 else None


def parse_relative(text: str, now: datetime | None = None) -> datetime | None:
    """'daqui a 30 minutos', 'em 2 horas', 'em 10 minutos'."""
    t = _clean(text)
    now = now or datetime.now()
    if not re.search(r"daqui\s+a|em\s+\d|dentro de|depois de", t):
        return None
    duration = parse_duration(t)
    return now + timedelta(seconds=duration) if duration else None


# ------------------------------------------------------------------ horário --
def parse_time_of_day(text: str) -> tuple[int, int] | None:
    """Devolve (hora, minuto) se o texto contiver um horário explícito."""
    t = _clean(text)
    if re.search(r"meio\s*dia", t):
        return (12, 0)
    if re.search(r"meia\s*noite", t):
        return (0, 0)
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", t)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return (hour, minute)
    m = re.search(r"\b(?:as|a|para|pelas?)\s+(\d{1,2})(?:\s*(?:horas?|hrs?))?\b", t)
    if not m:
        m = re.search(r"\b(\d{1,2})\s*horas?\b", t)
    if m:
        hour = int(m.group(1))
        minute = 0
        if 0 <= hour <= 23:
            if re.search(r"da\s+tarde|a\s+tarde", t) and hour < 12:
                hour += 12
            if re.search(r"da\s+noite|a\s+noite", t) and hour < 12:
                hour += 12
            if re.search(r"da\s+manha|a\s+manha", t) and hour == 12:
                hour = 0
            return (hour, minute)
    return None


def parse_when(text: str, now: datetime | None = None, default_hour: int = 9) -> datetime | None:
    """Interpreta 'hoje/amanhã/segunda às 14h' ou 'daqui a 30 minutos'. None se não há data."""
    t = _clean(text)
    now = now or datetime.now()

    relative = parse_relative(t, now)
    if relative:
        return relative

    has_date = any(word in t.split() for word in
                   ["hoje", "amanha", "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"])
    has_month = any(month in t for month in MONTHS)
    clock = parse_time_of_day(t)

    if not (has_date or has_month or clock):
        return None

    base = now
    if "depois de amanha" in t:
        base = now + timedelta(days=2)
    elif "amanha" in t:
        base = now + timedelta(days=1)
    elif has_date:
        found = None
        for token in t.split():
            if token in WEEKDAYS:
                found = WEEKDAYS[token]
                break
        if found is not None:
            delta = (found - now.weekday()) % 7
            if delta == 0:
                delta = 7
            base = now + timedelta(days=delta)

    m = re.search(r"\bdia\s+(\d{1,2})\b", t)
    if m:
        day = int(m.group(1))
        month = now.month
        for name, number in MONTHS.items():
            if name in t:
                month = number
                break
        year = now.year + (1 if month < now.month else 0)
        try:
            base = base.replace(year=year, month=month, day=day)
        except ValueError:
            return None

    hour, minute = clock if clock else (default_hour, 0)
    target = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if clock is None:
        target = base.replace(second=0, microsecond=0)
    # horário já passou hoje e não foi informado "amanhã" -> assume amanhã
    if target <= now and "hoje" not in t and not has_date and not has_month:
        target += timedelta(days=1)
    return target


# --------------------------------------------------------------- quantidades -
def parse_number(text: str) -> int | None:
    t = _clean(text)
    m = re.search(r"\b(\d+)\b", t)
    return int(m.group(1)) if m else None


LEVEL_WORDS = {
    "zero": 0, "dez": 10, "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50,
    "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90, "cem": 100,
}


def parse_volume_delta(text: str) -> int | None:
    t = _clean(text)
    m = re.search(r"(\d{1,3})\s*(?:%|por cento|porcento)?", t)
    if m:
        return max(0, min(100, int(m.group(1))))
    return None


# ------------------------------------------------------------------- textos --
def after_marker(text: str, markers: list[str]) -> str | None:
    """Devolve o texto após um marcador, preservando acentos e capitalização."""
    pattern = r"(?i)\b(?:" + "|".join(re.escape(m) for m in markers) + r")\b\s*[:,]?\s*(.+)"
    match = re.search(pattern, text)
    if not match:
        return None
    value = match.group(1).strip(" .,!?:;\"'")
    return value or None


def strip_wake_word(text: str, wake_words: list[str] | None = None) -> str:
    """Remove 'jarvis' (ou variações) do início/fim da frase."""
    words = wake_words or ["jarvis", "jarvis", "jarvis"]
    cleaned = text
    for word in words:
        cleaned = re.sub(rf"(?i)\b{re.escape(word)}\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.;!?")
    return cleaned or text.strip()


def quoted(text: str) -> str | None:
    m = re.search(r"[\"“']([^\"”']+)[\"”']", text)
    return m.group(1) if m else None


def path_like(text: str) -> str | None:
    """Extrai caminho absoluto, relativo com barra ou nome de arquivo com extensão."""
    m = re.search(r"([a-zA-Z]:\\[^\s\"']+|~?/[^\s\"']+|\.\.?/[^\s\"']+)", text)
    if m:
        return m.group(1)
    m = re.search(r"([\w \-]+\.(?:txt|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|mp3|mp4|mkv|zip|rar|exe|py|js|json|csv))", text, re.I)
    return m.group(1).strip() if m else None
