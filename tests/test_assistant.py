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
