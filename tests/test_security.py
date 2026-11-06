"""Testes do módulo de segurança: níveis, confirmações e proteção de caminhos."""
from __future__ import annotations

import time

import pytest

from jarvis.security.permissions import PermissionManager, SecurityError


def test_niveis_de_confirmacao(env):
    manager = PermissionManager(env["config"])
    manager.config.set("security.confirm_level", 2)
    assert manager.requires_confirmation(1) is False
    assert manager.requires_confirmation(2) is True
    assert manager.requires_confirmation(3) is True

    manager.config.set("security.confirm_level", 3)
    assert manager.requires_confirmation(2) is False
    assert manager.requires_confirmation(3) is True


def test_padrao_proibido_bloqueia(env):
    manager = PermissionManager(env["config"])
    with pytest.raises(SecurityError):
        manager.check_text("rm -rf /")


def test_caminho_fora_das_raizes_bloqueado(env, tmp_path):
    manager = PermissionManager(env["config"])
    manager.config.set("security.allowed_roots", [str(env["home"])])
    inside = env["home"] / "Downloads" / "arquivo.txt"
    assert manager.check_path(inside, write=True) == inside
    with pytest.raises(SecurityError):
        manager.check_path(tmp_path / "fora" / "arquivo.txt", write=True)


def test_caminho_protegido_bloqueado(env):
    manager = PermissionManager(env["config"])
    manager.config.set("security.protected_paths", [str(env["home"] / "Documentos")])
    with pytest.raises(SecurityError):
        manager.check_path(env["home"] / "Documentos" / "importante.txt", write=True)


def test_fluxo_de_confirmacao(env):
    manager = PermissionManager(env["config"])
    executed = {"count": 0}

    def executor():
        executed["count"] += 1
        return "feito"

    pending = manager.create_pending("teste", 'executar "algo"', 3, executor)
    assert manager.latest_pending().id == pending.id
    ok, result, message = manager.resolve(pending.id, approved=True)
    assert ok and result == "feito" and executed["count"] == 1

    pending2 = manager.create_pending("teste", "outra ação", 3, executor)
    ok2, result2, message2 = manager.resolve(pending2.id, approved=False)
    assert ok2 and result2 is None and "Cancelei" in message2
    assert executed["count"] == 1

    ok3, _, message3 = manager.resolve("inexistente", approved=True)
    assert ok3 is False and "não encontrei" in message3.lower()


def test_confirmacao_expira(env):
    manager = PermissionManager(env["config"])
    pending = manager.create_pending("teste", "ação lenta", 3, lambda: "ok")
    pending.expires_at = time.time() - 1
    ok, result, message = manager.resolve(pending.id, approved=True)
    assert ok is False and "expirou" in message


def test_auditoria_registra(env):
    from jarvis.memory.db import Database
    from jarvis.security.audit import AuditLog

    db = Database(env["tmp"] / "audit.db")
    log = AuditLog(db, env["tmp"] / "audit.jsonl")
    log.record("teste.acao", "detalhe", level=2, result="ok", confirmed=True)
    entries = log.recent(10)
    assert entries and entries[0]["action"] == "teste.acao"
    assert (env["tmp"] / "audit.jsonl").exists()
    db.close()


# ------------------------------------------------- bloqueio antes de executar
def test_padrao_proibido_e_bloqueado_antes_de_qualquer_execucao(assistant):
    import asyncio

    response = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        assistant.handle_text("executa rm -rf / agora", speak=False)
    )
    assert response.error is True
    assert "proibido" in response.reply.lower()
    assert any(entry["action"] == "security.block" for entry in assistant.audit.recent(20))
