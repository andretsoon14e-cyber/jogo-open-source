"""Acesso à internet: busca, resumos e previsão do tempo.

Regras de privacidade aplicadas aqui:

* nada é acessado sem você pedir — não há telemetria nem chamadas de fundo;
* só a sua consulta (e nada da memória pessoal) é enviada ao serviço escolhido;
* todo acesso é registrado na auditoria local com o texto da consulta;
* a opção ``web.enabled: false`` desliga completamente qualquer saída de rede.

Como o interpretador continua local (regras + sinônimos), a internet é usada
apenas como fonte de dados, quando a sua fala pede explicitamente uma pesquisa.
"""
from __future__ import annotations

import html
import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass

from ..core.config import Config

DEFAULT_UA = "Mozilla/5.0 (compatible; JarvisLocal/1.0)"
WIKI_API = "https://pt.wikipedia.org/w/api.php"
DDG_HTML = "https://html.duckduckgo.com/html/"
GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_API = "https://api.open-meteo.com/v1/forecast"

# códigos WMO usados pela Open-Meteo
WMO = {
    0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "encoberto",
    45: "neblina", 48: "neblina com geada", 51: "garoa leve", 53: "garoa", 55: "garoa forte",
    56: "garoa congelante", 57: "garoa congelante forte", 61: "chuva leve", 63: "chuva",
    65: "chuva forte", 66: "chuva congelante", 67: "chuva congelante forte",
    71: "neve leve", 73: "neve", 75: "neve forte", 77: "grãos de neve",
    80: "pancadas de chuva leves", 81: "pancadas de chuva", 82: "pancadas de chuva fortes",
    85: "pancadas de neve", 86: "pancadas de neve fortes",
    95: "tempestade", 96: "tempestade com granizo", 99: "tempestade com granizo forte",
}

SITES = {
    "youtube": "https://www.youtube.com", "google": "https://www.google.com",
    "gmail": "https://mail.google.com", "github": "https://github.com",
    "whatsapp": "https://web.whatsapp.com", "wikipedia": "https://pt.wikipedia.org",
    "netflix": "https://www.netflix.com", "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com", "twitter": "https://twitter.com", "x": "https://x.com",
    "spotify": "https://open.spotify.com", "mercado livre": "https://www.mercadolivre.com.br",
    "amazon": "https://www.amazon.com.br", "correios": "https://www.correios.com.br",
    "globo": "https://www.globo.com", "uol": "https://www.uol.com.br",
}


class WebError(RuntimeError):
    """Falha de rede ou de configuração, sempre com mensagem apresentável."""


@dataclass
class Result:
    title: str
    url: str
    snippet: str = ""

    def as_dict(self) -> dict:
        return {"title": self.title, "url": self.url, "snippet": self.snippet}


# ------------------------------------------------------------------ utilidades
def enabled(config: Config) -> bool:
    return bool(config.get("web.enabled", True))


def _require(config: Config) -> None:
    if not enabled(config):
        raise WebError("o acesso à internet está desativado nas configurações.")


def _get(url: str, config: Config, timeout: float | None = None,
         accept: str = "text/html,application/json") -> str:
    timeout = float(timeout or config.get("web.timeout_s", 8) or 8)
    request = urllib.request.Request(url, headers={
        "User-Agent": str(config.get("web.user_agent", DEFAULT_UA)),
        "Accept": accept,
        "Accept-Language": "pt-BR,pt;q=0.9",
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        raise WebError(f"o serviço respondeu com erro {exc.code}.") from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
        raise WebError("não consegui falar com a internet agora — verifique a conexão.") from exc
    except Exception as exc:  # noqa: BLE001
        raise WebError(f"falha inesperada ao acessar a rede ({type(exc).__name__}).") from exc


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return " ".join(html.unescape(text).split())


def _ddg_url(href: str) -> str:
    if href.startswith("//"):
        href = "https:" + href
    if "duckduckgo.com/l/" in href:
        query = urllib.parse.urlparse(href).query
        target = urllib.parse.parse_qs(query).get("uddg")
        if target:
            return urllib.parse.unquote(target[0])
    return href


# --------------------------------------------------------------------- busca
def search(query: str, config: Config, limit: int | None = None) -> list[Result]:
    """Busca na web (DuckDuckGo HTML) e devolve título, link e trecho."""
    _require(config)
    limit = int(limit or config.get("web.max_results", 5) or 5)
    url = f"{DDG_HTML}?{urllib.parse.urlencode({'q': query, 'kl': 'br-pt'})}"
    body = _get(url, config, accept="text/html")

    results: list[Result] = []
    pattern = re.compile(
        r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?'
        r'class="result__snippet"[^>]*>(.*?)</a>',
        re.S,
    )
    for href, title, snippet in pattern.findall(body):
        results.append(Result(_clean(title), _ddg_url(href), _clean(snippet)))
        if len(results) >= limit:
            break

    if not results:  # estrutura alternativa da página
        for href, title in re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S):
            results.append(Result(_clean(title), _ddg_url(href)))
            if len(results) >= limit:
                break

    if not results:
        raise WebError("não encontrei resultados para essa busca.")
    return results


def wiki_summary(term: str, config: Config) -> Result | None:
    """Resumo curto da Wikipédia em português para 'o que é / quem é'."""
    _require(config)
    params = {
        "action": "query", "format": "json", "prop": "extracts", "exintro": 1,
        "explaintext": 1, "redirects": 1, "generator": "search", "gsrlimit": 1,
        "gsrsearch": term, "utf8": 1,
    }
    body = _get(f"{WIKI_API}?{urllib.parse.urlencode(params)}", config, accept="application/json")
    try:
        pages = json.loads(body).get("query", {}).get("pages", {})
    except json.JSONDecodeError as exc:
        raise WebError("a enciclopédia devolveu algo inesperado.") from exc
    if not pages:
        return None
    page = next(iter(pages.values()))
    extract = (page.get("extract") or "").strip()
    if not extract:
        return None
    return Result(page.get("title", term),
                  f"https://pt.wikipedia.org/wiki/{urllib.parse.quote(page.get('title', term))}",
                  extract)


def answer(question: str, config: Config) -> tuple[str, list[Result]]:
    """Resposta para perguntas factuais: Wikipédia primeiro, busca depois."""
    term = re.sub(r"(?i)^(?:o que (?:e|é|significa)|quem (?:e|é)|defina|definicao de|"
                  r"definição de|significado de|me (?:explica|explique) o que (?:e|é))\s+",
                  "", question).strip(" ?.!")
    results: list[Result] = []
    summary = None
    if term:
        try:
            summary = wiki_summary(term, config)
        except WebError as exc:
            error = exc
        else:
            error = None
    else:
        error = None

    if summary:
        results.append(summary)
        text = summary.snippet
        if len(text) > 700:
            text = text[:700].rsplit(" ", 1)[0] + "…"
        return f"{summary.title}: {text}", results

    try:
        results = search(question if not term else term, config, limit=3)
    except WebError:
        if error:
            raise error
        raise
    spoken = "; ".join(f"{r.title} — {r.snippet[:160]}" for r in results[:3])
    return f"Encontrei isto: {spoken}", results


# ------------------------------------------------------------ previsão do tempo
def _geocode(city: str, config: Config) -> dict:
    params = {"name": city, "count": 1, "language": "pt", "format": "json"}
    body = _get(f"{GEOCODE_API}?{urllib.parse.urlencode(params)}", config, accept="application/json")
    try:
        results = json.loads(body).get("results") or []
    except json.JSONDecodeError as exc:
        raise WebError("não consegui localizar essa cidade.") from exc
    if not results:
        raise WebError(f"não encontrei a cidade “{city}”.")
    return results[0]


def weather(city: str, config: Config) -> dict:
    """Previsão atual e do dia, via Open-Meteo (sem chave de API)."""
    _require(config)
    place = _geocode(city, config)
    params = {
        "latitude": place["latitude"], "longitude": place["longitude"],
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
                   "weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "auto", "forecast_days": 2,
    }
    body = _get(f"{FORECAST_API}?{urllib.parse.urlencode(params)}", config, accept="application/json")
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise WebError("o serviço de meteorologia devolveu algo inesperado.") from exc

    current = data.get("current") or {}
    daily = data.get("daily") or {}

    def first(key: str):
        values = daily.get(key) or []
        return values[0] if values else None

    code = current.get("weather_code")
    tomorrow_code = (daily.get("weather_code") or [None, None])
    return {
        "city": place.get("name") or city,
        "country": place.get("country", ""),
        "temperature": current.get("temperature_2m"),
        "feels_like": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "wind": current.get("wind_speed_10m"),
        "description": WMO.get(code, "condição desconhecida") if code is not None else "",
        "max": first("temperature_2m_max"),
        "min": first("temperature_2m_min"),
        "rain_chance": first("precipitation_probability_max"),
        "tomorrow_description": (WMO.get(tomorrow_code[1]) if len(tomorrow_code) > 1
                                 and tomorrow_code[1] is not None else ""),
        "updated": int(time.time()),
    }


def weather_text(data: dict) -> str:
    place = data.get("city") or "sua cidade"
    description = data.get("description") or ""
    temp = data.get("temperature")
    parts = [f"Em {place} agora: {temp} °C" if temp is not None else f"Em {place} agora"]
    if description:
        parts.append(description)
    if data.get("feels_like") is not None and temp is not None and abs(data["feels_like"] - temp) >= 2:
        parts.append(f"sensação de {data['feels_like']} °C")
    if data.get("humidity") is not None:
        parts.append(f"umidade em {data['humidity']}%")
    sentence = ", ".join(parts) + "."
    if data.get("max") is not None and data.get("min") is not None:
        sentence += (f" Hoje, máxima de {data['max']} °C e mínima de {data['min']} °C")
        if data.get("rain_chance") is not None:
            sentence += f", com {data['rain_chance']}% de chance de chuva"
        sentence += "."
    if data.get("tomorrow_description"):
        sentence += f" Amanhã: {data['tomorrow_description']}."
    return sentence


# ------------------------------------------------------------- abrir páginas
def is_url(text: str) -> bool:
    return bool(re.match(r"(?i)^(?:https?://)?[\w.-]+\.[a-z]{2,}(?:/\S*)?$", text.strip()))


def normalize_url(text: str) -> str:
    text = text.strip()
    if re.match(r"(?i)^[a-z][a-z0-9+.-]*:", text) and not re.match(r"(?i)^https?://", text):
        raise WebError("só abro endereços http e https.")
    if not re.match(r"(?i)^https?://", text):
        text = "https://" + text
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or "." not in parsed.netloc:
        raise WebError("esse endereço não parece válido.")
    return text


def site_url(name: str) -> str | None:
    key = name.strip().lower()
    if key in SITES:
        return SITES[key]
    if is_url(key):
        return normalize_url(key)
    return None


def open_url(url: str) -> None:
    webbrowser.open(normalize_url(url))
