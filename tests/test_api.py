"""Testes da API local (HTTP) usada pela interface."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from jarvis.core.assistant import Assistant
from jarvis.server.app import create_app


@pytest.fixture()
def client(env):
    assistant = Assistant(env["config"])
    app = create_app(assistant)
    with TestClient(app) as test_client:
        yield test_client
    assistant.shutdown()


def test_status_inicial(client):
    data = client.get("/api/status").json()
    assert data["assistant"]["offline"] is True
    assert data["commands"] >= 60
    assert data["voice"]["offline"] is True
    assert data["security"]["confirm_level"] in (1, 2, 3)


def test_interface_servida(client):
    home = client.get("/")
    assert home.status_code == 200
    assert "J.A.R.V.I.S." in home.text
    assert client.get("/css/hud.css").status_code == 200
    assert client.get("/js/app.js").status_code == 200
    assert client.get("/favicon.ico").status_code in (200, 204)


def test_comando_e_historico(client):
    response = client.post("/api/command", json={"text": "que horas são"}).json()
    assert response["intent"] == "conversation.time"
    history = client.get("/api/history?limit=10").json()["messages"]
    assert any(item["role"] == "assistant" for item in history)


def test_comando_vazio_retorna_400(client):
    assert client.post("/api/command", json={"text": "  "}).status_code == 400


def test_memoria_http(client):
    created = client.post("/api/memory", json={"value": "prefiro café sem açúcar", "category": "preferencia"})
    assert created.status_code == 200
    memory_id = created.json()["id"]
    listed = client.get("/api/memory").json()["memories"]
    assert any(item["id"] == memory_id for item in listed)
    assert client.delete(f"/api/memory/{memory_id}").status_code == 200
    assert client.delete("/api/memory/999999").status_code == 404


def test_tarefas_http(client):
    task_id = client.post("/api/tasks", json={"title": "revisar o projeto"}).json()["id"]
    assert client.post(f"/api/tasks/{task_id}/complete").status_code == 200
    assert client.get("/api/tasks").json()["tasks"] == []


def test_remover_tarefa_inexistente(client):
    assert client.delete("/api/tasks/123456").status_code == 404


def test_rotinas_http(client):
    response = client.post("/api/routines", json={
        "name": "modo foco", "steps": ["abre a pasta de documentos"],
    })
    assert response.status_code == 200
    routines = client.get("/api/routines").json()["routines"]
    assert any(r["name"] == "modo foco" for r in routines)
    assert client.delete("/api/routines/modo%20foco").status_code == 200


def test_confirmacao_http(client):
    pending = client.post("/api/command", json={"text": "desliga o computador"}).json()["pending"]
    assert pending and pending["level"] == 3
    denied = client.post("/api/confirm", json={"id": pending["id"], "approved": False}).json()
    assert "ancel" in denied["reply"]


def test_ajustes_whitelist(client):
    ok = client.patch("/api/settings", json={"personality.humor": 0.2}).json()
    assert ok["applied"] == {"personality.humor": 0.2}
    blocked = client.patch("/api/settings", json={"security.forbidden_patterns": []}).json()
    assert blocked["rejected"] == ["security.forbidden_patterns"]


def test_auditoria_e_logs(client):
    client.post("/api/command", json={"text": "anote que a interface foi testada"})
    entries = client.get("/api/audit").json()["entries"]
    assert any(entry["action"] == "note.add" for entry in entries)
    assert "lines" in client.get("/api/logs").json()


def test_voz_status(client):
    data = client.get("/api/voice/status").json()
    assert "stt" in data and "tts" in data
    assert data["wake_word"]["enabled"] in (True, False)


def test_websocket_envia_snapshot(client):
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "snapshot"
        second = ws.receive_json()
        assert second["type"] == "state"


def test_websocket_desconexao_abrupta_nao_derruba_o_servidor(client):
    """Fechar a aba do navegador no meio do stream não deve gerar erro no servidor."""
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        ws.receive_json()  # state
    # uma nova conexão depois da desconexão abrupta continua funcionando
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
    assert client.get("/api/status").status_code == 200
