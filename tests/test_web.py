"""Internet: busca, Wikipédia, previsão do tempo e abertura de links.

Nenhum teste acessa a rede de verdade: `_get` é substituído por respostas fixas,
o que também documenta exatamente que formato de página é aceito.
"""
from __future__ import annotations

import pytest

from jarvis.system import web

DDG_HTML = """
<div class="result results_links">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fpt.wikipedia.org%2Fwiki%2FPython">Python &mdash; Wikipédia</a>
  </h2>
  <a class="result__snippet" href="#">Linguagem de programação de alto n&iacute;vel.</a>
</div>
<div class="result results_links">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="https://www.python.org/">Welcome to Python.org</a>
  </h2>
  <a class="result__snippet" href="#">The official home of the Python language.</a>
</div>
"""

WIKI_JSON = '{"query": {"pages": {"1": {"title": "Fotossíntese", "extract": "Processo usado por plantas para converter luz em energia química."}}}}'
GEO_JSON = '{"results": [{"name": "Curitiba", "country": "Brasil", "latitude": -25.4, "longitude": -49.2}]}'
FORECAST_JSON = """{
  "current": {"temperature_2m": 22.4, "relative_humidity_2m": 71, "apparent_temperature": 23.1,
              "precipitation": 0.0, "weather_code": 3, "wind_speed_10m": 9.0},
  "daily": {"weather_code": [3, 61], "temperature_2m_max": [26.8], "temperature_2m_min": [16.2],
            "precipitation_probability_max": [35]}
}"""


@pytest.fixture()
def fake_net(monkeypatch):
    responses: dict[str, str] = {}
    calls: list[str] = []

    def fake_get(url, config, timeout=None, accept=""):
        calls.append(url)
        for marker, body in responses.items():
            if marker in url:
                return body
        raise web.WebError("sem resposta simulada")

    monkeypatch.setattr(web, "_get", fake_get)
    return {"responses": responses, "calls": calls}


def test_busca_interpreta_resultados(fake_net, env):
    fake_net["responses"]["duckduckgo"] = DDG_HTML
    results = web.search("python", env["config"])
    assert [r.title for r in results] == ["Python — Wikipédia", "Welcome to Python.org"]
    assert results[0].url == "https://pt.wikipedia.org/wiki/Python"
    assert "Linguagem de programação" in results[0].snippet
    assert "kl=br-pt" in fake_net["calls"][0]


def test_busca_com_controle_desligado(env):
    env["config"].set("web.enabled", False)
    with pytest.raises(web.WebError):
        web.search("qualquer coisa", env["config"])


def test_resposta_factual_usa_wikipedia(fake_net, env):
    fake_net["responses"]["wikipedia.org"] = WIKI_JSON
    texto, results = web.answer("o que é fotossíntese", env["config"])
    assert "Fotossíntese" in texto and "energia química" in texto
    assert results[0].url.startswith("https://pt.wikipedia.org/wiki/")


def test_previsao_do_tempo(fake_net, env):
    fake_net["responses"]["geocoding-api"] = GEO_JSON
    fake_net["responses"]["api.open-meteo.com"] = FORECAST_JSON
    data = web.weather("Curitiba", env["config"])
    assert data["temperature"] == 22.4 and data["city"] == "Curitiba"
    texto = web.weather_text(data)
    assert "Curitiba" in texto and "22.4" in texto and "chuva" in texto
    assert "encoberto" in texto


def test_erro_de_rede_vira_mensagem_clara(monkeypatch, env):
    def explode(*_, **__):
        raise web.WebError("não consegui falar com a internet agora — verifique a conexão.")

    monkeypatch.setattr(web, "_get", explode)
    with pytest.raises(web.WebError) as info:
        web.search("teste", env["config"])
    assert "internet" in str(info.value)


def test_urls_aceitas_e_recusadas():
    assert web.normalize_url("exemplo.com.br") == "https://exemplo.com.br"
    assert web.normalize_url("http://exemplo.com") == "http://exemplo.com"
    with pytest.raises(web.WebError):
        web.normalize_url("javascript:alert(1)")
    with pytest.raises(web.WebError):
        web.normalize_url("file:///etc/passwd")


def test_atalhos_de_sites():
    assert web.site_url("GitHub") == "https://github.com"
    assert web.site_url("meusite.com.br") == "https://meusite.com.br"
    assert web.site_url("uma frase qualquer") is None
