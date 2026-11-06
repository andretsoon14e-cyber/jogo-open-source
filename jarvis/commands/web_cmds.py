"""Internet: pesquisas, perguntas factuais, sites e previsão do tempo.

Tudo aqui é acionado por uma ordem explícita sua. O interpretador continua
local; a rede entra apenas como fonte de dados.
"""
from __future__ import annotations

import re

from ..nlu import extract
from ..nlu.engine import command
from ..system import web
from .base import Context
from .helpers import err, ok

SEARCH_MARKERS = ["pesquisar", "pesquise", "pesquisa", "procure", "procura", "busque", "busca",
                  "procure por", "pesquise por", "buscar por", "olhe", "procurar"]


def _query(ctx: Context) -> str:
    text = extract.after_marker(ctx.text, SEARCH_MARKERS) or ""
    text = re.sub(r"(?i)^(?:na|no)\s+(?:internet|google|navegador|web)\s*(?:sobre|por|a respeito de)?\s*",
                  "", text).strip()
    text = re.sub(r"(?i)^(?:sobre|por|a respeito de)\s+", "", text).strip(" .,!?")
    if text:
        return text
    residual = ctx.residual()
    for word in ("internet", "google", "web", "navegador", "online", "pesquisar", "procurar",
                 "buscar", "sobre"):
        residual = re.sub(rf"(?i)\b{word}\b", " ", residual)
    return " ".join(residual.split()) or ""


def _remember(ctx: Context, query: str, results: list[web.Result]) -> None:
    ctx.assistant.last_search = {
        "query": query,
        "results": [r.as_dict() for r in results],
    }


def _spoken_list(results: list[web.Result], limit: int = 3) -> str:
    linhas = []
    for index, item in enumerate(results[:limit], start=1):
        snippet = item.snippet[:180].rstrip()
        linhas.append(f"{index}. {item.title} — {snippet}" if snippet else f"{index}. {item.title}")
    return "\n".join(linhas)


@command("web.search",
         must=[["pesquisar", "procurar", "buscar"], ["internet", "google", "web", "online"]],
         extra_patterns=[
             {"must": [["pesquisar"], ["sobre"]]},
             {"must": [["procurar"], ["sobre"]]},
             {"must": [["buscar"], ["sobre"]]},
             {"must": [["google"]]},
             {"must": [["na"], ["internet"]]},
         ],
         category="internet",
         description="Pesquisa na internet e resume os primeiros resultados",
         examples=["Pesquisa na internet sobre DeepSeek", "Procura no Google passagens para o Rio"],
         priority=6)
def search_web(ctx: Context):
    if not ctx.config.get("web.enabled", True):
        return err(ctx, "O acesso à internet está desativado nas configurações.")
    query = _query(ctx)
    if len(query) < 2:
        return ok(ctx, "O que devo pesquisar? Diga algo como “pesquisa na internet sobre buracos negros”.")
    try:
        results = web.search(query, ctx.config, int(ctx.config.get("web.max_results", 5) or 5))
    except web.WebError as exc:
        ctx.assistant.audit.record("web.search", f"{query} (falhou: {exc})", level=1, result="erro")
        return err(ctx, f"Não consegui pesquisar agora — {exc}".capitalize() if False else f"Não consegui pesquisar agora — {exc}")
    _remember(ctx, query, results)
    ctx.assistant.audit.record("web.search", query, level=1)
    texto = (f"Resultados para “{query}”:\n{_spoken_list(results)}\n"
             "Diga “abre o primeiro resultado” para eu abrir no navegador.")
    return ok(ctx, texto, results=[r.as_dict() for r in results], query=query)


@command("web.define",
         must=[["o", "que"], ["e"]],
         extra_patterns=[
             {"must": [["quem"], ["e"]]},
             {"must": [["definicao", "significado"], ["de"]]},
             {"must": [["define", "definir"]]},
             {"must": [["explica", "explicar"], ["que"], ["e"]]},
         ],
         category="internet",
         description="Responde 'o que é / quem é' com um resumo da Wikipédia e busca de apoio",
         examples=["O que é computação quântica?", "Quem é Ada Lovelace?"],
         priority=1)
def define(ctx: Context):
    if not ctx.config.get("web.enabled", True):
        return err(ctx, "O acesso à internet está desativado nas configurações.")
    termo = re.sub(r"(?i)^(?:o que (?:e|é)|quem (?:e|é)|defina|definição de|definicao de|"
                   r"significado de|me (?:explica|explique)|explique|explica)\s+", "",
                   ctx.clean.strip()).strip(" ?.!")
    termo = re.sub(r"(?i)\b(?:o que e|quem e)\b", "", termo).strip(" ?.!")
    if len(termo) < 3 or termo.lower() in ("isso", "isto", "aquilo", "ele", "ela", "voce", "voce ai"):
        return ok(ctx, "Sobre o que exatamente? Diga o assunto que devo procurar.")
    try:
        texto, results = web.answer(ctx.clean, ctx.config)
    except web.WebError as exc:
        ctx.assistant.audit.record("web.define", f"{termo} (falhou: {exc})", level=1, result="erro")
        return err(ctx, f"Não consegui consultar agora: {exc}")
    _remember(ctx, termo, results)
    ctx.assistant.audit.record("web.define", termo, level=1)
    if len(texto) > 420:
        texto = texto[:420].rsplit(" ", 1)[0] + "…"
    return ok(ctx, texto, results=[r.as_dict() for r in results], query=termo)


@command("web.open_result",
         must=[["abrir"], ["resultado", "link"]],
         extra_patterns=[
             {"must": [["abrir"], ["primeiro", "segundo", "terceiro"]]},
             {"must": [["abrir"], ["numero", "item"]]},
         ],
         category="internet",
         description="Abre no navegador um dos resultados da última pesquisa",
         examples=["Abre o primeiro resultado", "Abre o link 2"],
         priority=6)
def open_result(ctx: Context):
    last = getattr(ctx.assistant, "last_search", None)
    if not last or not last.get("results"):
        return ok(ctx, "Ainda não tenho resultados de pesquisa. Peça uma pesquisa primeiro.")
    index = 1
    ordinal = {"primeiro": 1, "segundo": 2, "terceiro": 3, "quarto": 4, "quinto": 5}
    lowered = ctx.norm
    for word, number in ordinal.items():
        if word in lowered:
            index = number
            break
    else:
        digits = re.search(r"\d+", ctx.text)
        if digits:
            index = max(1, int(digits.group()))
    results = last["results"]
    if index > len(results):
        return ok(ctx, f"Só tenho {len(results)} resultado(s) para “{last['query']}”.")
    chosen = results[index - 1]
    try:
        web.open_url(chosen["url"])
    except web.WebError as exc:
        return err(ctx, str(exc))
    ctx.assistant.audit.record("web.open_result", chosen["url"], level=1)
    return ok(ctx, f"Abri o resultado {index}: {chosen['title']}.", url=chosen["url"])


@command("web.open_site",
         must=[["abrir"], ["site", "sítio", "pagina", "link"]],
         extra_patterns=[{"must": [["abrir"], ["endereco"]]}],
         category="internet",
         description="Abre um site ou endereço no navegador padrão",
         examples=["Abre o site do GitHub", "Abre o endereço wikipedia.org"],
         priority=5)
def open_site(ctx: Context):
    alvo = extract.after_marker(ctx.text, ["abrir", "abre", "acesse", "acessar", "entrar em"]) or ""
    alvo = re.sub(r"(?i)^(?:o|a|os|as|site|sítio|pagina|página|link|endereco|endereço)\s+", "", alvo)
    alvo = re.sub(r"(?i)\b(?:no|na)\s+(?:navegador|internet)\b", "", alvo).strip(" .,!?")
    if not alvo:
        return ok(ctx, "Qual endereço devo abrir? Exemplo: “abre o site da Wikipedia”.")
    url = web.site_url(alvo) or web.site_url(alvo.replace(" da ", " ").replace(" do ", " "))
    if not url:
        return ok(ctx, f"Não reconheci “{alvo}” como endereço. Diga o domínio, por exemplo "
                       f"“abre o site exemplo.com.br”.")
    try:
        web.open_url(url)
    except web.WebError as exc:
        return err(ctx, str(exc))
    ctx.assistant.audit.record("web.open_site", url, level=1)
    return ok(ctx, f"Abri {alvo} no navegador padrão.", url=url)


@command("settings.location",
         must=[["minha"], ["cidade"]],
         extra_patterns=[{"must": [["moro"], ["em"]]},
                         {"must": [["cidade"], ["mudar", "alterar", "definir", "configurar"]]}],
         category="configuracoes",
         description="Guarda a sua cidade para a previsão do tempo",
         examples=["Minha cidade é Curitiba", "Moro em São Paulo"],
         priority=5)
def set_location(ctx: Context):
    city = extract.after_marker(ctx.text, ["minha cidade é", "minha cidade e", "cidade é",
                                           "cidade e", "moro em", "moro no"]) or ""
    if not city:
        residual = re.sub(r"(?i)\b(?:minha|cidade|moro|em|no|e|é|mudar|alterar|definir|configurar)\b",
                          " ", ctx.clean)
        city = " ".join(residual.split())
    city = city.strip(" .,!?")
    if len(city) < 2:
        return ok(ctx, "Qual é a sua cidade? Exemplo: “minha cidade é Curitiba”.")
    ctx.config.set("web.location", city)
    ctx.assistant.audit.record("settings.location", city, level=1)
    return ok(ctx, f"Anotado: {city}. Já posso consultar a previsão quando você pedir.",
              city=city)
