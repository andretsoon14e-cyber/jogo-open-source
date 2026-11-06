"""Testes de integração do núcleo (sem áudio e sem alterar o sistema)."""
from __future__ import annotations

import asyncio

import pytest


def run(coro):
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


def test_fluxo_basico(assistant):
    response = run(assistant.handle_text("que horas são", speak=False))
    assert response.intent == "conversation.time"
    assert ":" in response.reply


def test_memoria_persistente(assistant):
    run(assistant.handle_text("lembre-se de que prefiro reuniões pela manhã", speak=False))
    assert assistant.db.list_memories()
    response = run(assistant.handle_text("o que você sabe sobre mim", speak=False))
    assert "reuniões" in response.reply


def test_nota_e_listagem(assistant):
    run(assistant.handle_text("anote que preciso comprar um carregador", speak=False))
    response = run(assistant.handle_text("minhas anotações", speak=False))
    assert "carregador" in response.reply


def test_lembrete_com_data(assistant):
    response = run(assistant.handle_text("me lembre de estudar amanhã às 14 horas", speak=False))
    assert response.intent == "task.add_remember"
    assert assistant.db.pending_reminders()
    due = assistant.db.pending_reminders()[0]["due_at"]
    import datetime

    assert datetime.datetime.fromtimestamp(due).hour == 14


def test_confirmacao_de_acao_critica(assistant):
    response = run(assistant.handle_text("desliga o computador", speak=False))
    assert response.pending is not None
    assert response.pending["level"] == 3
    # recusa: nada é executado
    denied = run(assistant.confirm(response.pending["id"], False))
    assert "ancel" in denied.reply or "Entendido" in denied.reply
    assert assistant.permissions.pending == {}


def test_confirmacao_falada(assistant):
    response = run(assistant.handle_text("desliga o computador", speak=False))
    assert response.pending
    confirmation = run(assistant.handle_text("cancela", speak=False))
    assert "ancel" in confirmation.reply


def test_organizacao_de_pasta_com_confirmacao(assistant, sample_downloads):
    response = run(assistant.handle_text("organize a pasta de downloads", speak=False))
    assert response.pending, "deveria pedir confirmação"
    assert not (sample_downloads / "Imagens").exists(), "nada pode ser movido antes da confirmação"

    approved = run(assistant.confirm(response.pending["id"], True))
    assert "sucesso" in approved.reply
    assert (sample_downloads / "Imagens" / "foto.jpg").exists()
    assert (sample_downloads / "Documentos" / "nota.txt").exists()


def test_rotina_criada_e_executada(assistant):
    create = run(assistant.handle_text(
        "quando eu disser modo estudo, abre a pasta de downloads e abre a pasta de documentos",
        speak=False))
    assert create.intent == "routine.create"
    routine = assistant.db.get_routine("modo estudo")
    assert routine and len(routine["steps"]) == 2
    executed = run(assistant.handle_text("modo estudo", speak=False))
    assert "modo estudo" in executed.reply or executed.intent == "routine.run"


def test_routine_ignora_acoes_criticas(assistant):
    assistant.db.upsert_routine("perigosa", [{"text": "desliga o computador"}])
    response = run(assistant.run_routine(assistant.db.get_routine("perigosa")))
    assert "confirmação" in response.reply.lower() or "não foram executados" in response.reply


def test_comando_composto(assistant):
    response = run(assistant.handle_text(
        "anote que revisar o código é importante e quais são minhas tarefas", speak=False))
    assert "anotado" in response.reply.lower() or "Anotado" in response.reply


def test_desconhecido_admite_limitacao(assistant):
    response = run(assistant.handle_text("qual a capital da Mongólia", speak=False))
    assert response.intent in ("unknown", "advice.fallback")
    assert "não" in response.reply.lower()


def test_conselheiro_estrutura_decisao(assistant):
    response = run(assistant.handle_text(
        "estou pensando em comprar um computador novo, o que você acha?", speak=False))
    assert response.intent == "advice.decide"
    assert "critério" in response.reply.lower() or "Critérios" in response.reply


def test_honestidade_sobre_conhecimento(assistant):
    response = run(assistant.handle_text("explique a teoria das cordas", speak=False))
    assert "inventar" in response.reply.lower()


def test_auto_conhecimento(assistant):
    response = run(assistant.handle_text("explique como funciona a memória local", speak=False))
    assert "sqlite" in response.reply.lower()


def test_microfone_desligado_por_comando(assistant):
    response = run(assistant.handle_text("desativa o microfone", speak=False))
    assert response.intent == "voice.microphone"
    assert assistant.voice.microphone_enabled is False
    assert assistant.config.get("security.microphone_enabled") is False


def test_estado_final_idle(assistant):
    run(assistant.handle_text("bom dia", speak=False))
    assert assistant.state.current.value == "idle"


def test_historico_gravado(assistant):
    run(assistant.handle_text("que horas são", speak=False))
    history = assistant.db.recent_conversations(10)
    assert any(item["role"] == "user" for item in history)
    assert any(item["role"] == "assistant" for item in history)


def test_auditoria_de_acoes(assistant):
    run(assistant.handle_text("anote que auditar é necessário", speak=False))
    entries = assistant.audit.recent(20)
    assert any(entry["action"] == "note.add" for entry in entries)


# --------------------------------------------------- novos comandos (v1.0)
def test_uptime_responde(assistant):
    response = run(assistant.handle_text("quanto tempo o computador está ligado", speak=False))
    assert response.intent == "system.uptime"
    assert "ligado há" in response.reply


def test_configuracoes_de_seguranca(assistant):
    response = run(assistant.handle_text("quais são as configurações de segurança", speak=False))
    assert response.intent == "settings.show"
    assert "nível" in response.reply and "desligado" in response.reply


def test_local_dos_dados(assistant):
    response = run(assistant.handle_text("onde ficam meus dados", speak=False))
    assert response.intent == "settings.data_location"
    assert str(assistant.db.path.parent) in response.reply


def test_historico_exige_confirmacao(assistant):
    run(assistant.handle_text("bom dia", speak=False))
    response = run(assistant.handle_text("apaga o histórico de conversas", speak=False))
    assert response.pending is not None
    assert response.pending["level"] == 2
    cancelada = run(assistant.confirm(response.pending["id"], False))
    assert "Cancelei" in cancelada.reply or "cancel" in cancelada.reply.lower()
    assert assistant.db.recent_conversations(5), "histórico deve continuar existindo"


def test_historico_apagado_apos_confirmar(assistant):
    run(assistant.handle_text("bom dia", speak=False))
    antes = assistant.db.one("SELECT COUNT(*) AS c FROM conversations")["c"]
    assert antes > 0
    response = run(assistant.handle_text("apaga o histórico de conversas", speak=False))
    run(assistant.confirm(response.pending["id"], True))
    # o histórico antigo sai; a conversa recomeça a partir da própria confirmação
    assert assistant.db.one("SELECT COUNT(*) AS c FROM conversations")["c"] <= 2


def test_nota_com_dois_pontos(assistant):
    response = run(assistant.handle_text("anota isso: comprar leite", speak=False))
    assert response.intent == "note.add"
    assert any("comprar leite" in nota["body"] for nota in assistant.db.list_notes())


def test_compromisso_entra_na_agenda(assistant):
    response = run(assistant.handle_text("marca uma consulta com o dentista na sexta", speak=False))
    assert response.intent == "appointment.add"
    assert response.data.get("due_at")
    assert any("dentista" in tarefa["title"] for tarefa in assistant.db.list_tasks(status=None))


def test_modo_silencioso_desliga_voz(assistant):
    response = run(assistant.handle_text("modo silencioso", speak=False))
    assert response.intent == "voice.tts"
    assert assistant.config.get("voice.tts.engine") == "disabled"


def test_recentes_acoes_no_log(assistant):
    run(assistant.handle_text("anote que auditar importa", speak=False))
    response = run(assistant.handle_text("o que você registrou nas últimas ações", speak=False))
    assert response.intent == "audit.recent"
    assert "note.add" in response.reply


def test_texto_fora_do_escopo_nao_cria_nota(assistant):
    before = assistant.db.one("SELECT COUNT(*) AS c FROM notes")["c"]
    response = run(assistant.handle_text("escreve um poema sobre o mar", speak=False))
    assert response.intent == "unknown"
    assert "ajuda" in response.reply
    assert assistant.db.one("SELECT COUNT(*) AS c FROM notes")["c"] == before


# ----------------------------------------------------- internet e terminal (v1.1)
def test_pesquisa_na_internet(assistant, monkeypatch):
    from jarvis.system import web

    resultados = [web.Result("Python — Wikipédia", "https://pt.wikipedia.org/wiki/Python",
                             "Linguagem de alto nível.")]
    monkeypatch.setattr(web, "search", lambda *a, **k: resultados)
    response = run(assistant.handle_text("pesquisa na internet sobre python", speak=False))
    assert response.intent == "web.search"
    assert "Python — Wikipédia" in response.reply
    assert assistant.last_search["results"][0]["url"].startswith("https://pt.wikipedia.org")
    assert any(e["action"] == "web.search" for e in assistant.audit.recent(10))


def test_pesquisa_com_internet_desligada(assistant):
    assistant.config.set("web.enabled", False)
    response = run(assistant.handle_text("pesquisa na internet sobre python", speak=False))
    assert response.error is True
    assert "desativado" in response.reply.lower()


def test_pergunta_factual(assistant, monkeypatch):
    from jarvis.system import web

    monkeypatch.setattr(web, "answer", lambda *a, **k: (
        "Fotossíntese: processo usado por plantas para converter luz em energia química.",
        [web.Result("Fotossíntese", "https://pt.wikipedia.org/wiki/Fotossintese", "…")],
    ))
    response = run(assistant.handle_text("o que é fotossíntese", speak=False))
    assert response.intent == "web.define"
    assert "energia química" in response.reply


def test_abrir_primeiro_resultado(assistant, monkeypatch):
    from jarvis.commands import web_cmds

    aberto = {}
    monkeypatch.setattr(web_cmds.web, "open_url", lambda url: aberto.update(url=url))
    assistant.last_search = {"query": "python", "results": [
        {"title": "Python", "url": "https://python.org", "snippet": "site oficial"}]}
    response = run(assistant.handle_text("abre o primeiro resultado", speak=False))
    assert response.intent == "web.open_result"
    assert aberto["url"] == "https://python.org"


def test_previsao_do_tempo_com_cidade(assistant, monkeypatch):
    from jarvis.system import web

    monkeypatch.setattr(web, "weather", lambda city, config: {
        "city": city, "temperature": 21.5, "description": "chuva leve", "feels_like": 22.0,
        "humidity": 80, "max": 25.0, "min": 15.0, "rain_chance": 70,
        "tomorrow_description": "encoberto", "wind": 8,
    })
    assistant.config.set("web.location", "Curitiba")
    response = run(assistant.handle_text("como está o tempo hoje", speak=False))
    assert response.intent == "conversation.weather"
    assert "Curitiba" in response.reply and "21.5" in response.reply


def test_definir_cidade(assistant):
    response = run(assistant.handle_text("minha cidade é Curitiba", speak=False))
    assert response.intent == "settings.location"
    assert assistant.config.get("web.location") == "Curitiba"


def test_comando_de_terminal_exige_confirmacao(assistant):
    response = run(assistant.handle_text("executa o comando echo jarvis", speak=False))
    assert response.intent == "system.run"
    assert response.pending is not None and response.pending["level"] == 3
    assert "echo jarvis" in response.pending["description"]
    concluido = run(assistant.confirm(response.pending["id"], True))
    assert "jarvis" in concluido.reply.lower()
    assert any(e["action"] == "system.run" for e in assistant.audit.recent(10))


def test_terminal_bloqueado_por_configuracao(assistant):
    assistant.config.set("security.allow_shell", False)
    response = run(assistant.handle_text("executa o comando echo teste", speak=False))
    assert response.error is True
    assert "desativada" in response.reply.lower()


def test_rede_local(assistant):
    response = run(assistant.handle_text("qual é o meu ip", speak=False))
    assert response.intent == "system.network"
    assert "IP local" in response.reply


# ------------------------------------------------ voz natural e fluidez (v1.1)
def test_respostas_nao_expoem_meta_discurso(assistant):
    """O assistente fala como assistente: nada de “regra do projeto”, “nossa conversa”."""
    proibidos = ("regra do projeto", "nossa conversa", "diretriz do projeto",
                 "protocolo do projeto", "como combinamos no desenvolvimento",
                 "esta conversa de desenvolvimento", "senhor me desenvolveu")
    frases = ["bom dia", "quem é você", "como você está", "o que você pode fazer",
              "como está o tempo hoje", "quais são as configurações de segurança",
              "explique como funciona a memória", "quero um modelo local",
              "o que você sabe sobre mim", "qual é a capital da mongólia"]
    for frase in frases:
        resposta = run(assistant.handle_text(frase, speak=False))
        texto = resposta.reply.lower()
        for termo in proibidos:
            assert termo not in texto, f"{frase!r} expôs meta-discurso: {termo}"


def test_texto_do_tempo_nao_pede_configuracao_de_projeto(assistant, monkeypatch):
    from jarvis.system import web

    monkeypatch.setattr(web, "weather", lambda city, config: {
        "city": city, "temperature": 18.0, "description": "céu limpo", "feels_like": 18.0,
        "humidity": 60, "max": 24.0, "min": 12.0, "rain_chance": 5,
        "tomorrow_description": "parcialmente nublado", "wind": 5,
    })
    assistant.config.set("web.location", "Curitiba")
    response = run(assistant.handle_text("como está o tempo hoje", speak=False))
    assert "18.0" in response.reply and "céu limpo" in response.reply
    assert "regra" not in response.reply.lower()
    assert "serviço externo" not in response.reply.lower()
