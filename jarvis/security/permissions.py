"""Política de segurança: três níveis de autorização + confirmações explícitas.

Nível 1 — ações simples (abrir programas, consultar dados, ajustar volume)
Nível 2 — ações que alteram informações (mover/copiar em massa, fechar programas)
Nível 3 — ações críticas (excluir, desligar, reiniciar, suspender, configs)
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from ..core.config import Config

LEVEL_NAMES = {0: "livre", 1: "simples", 2: "modifica dados", 3: "crítica"}


@dataclass
class PendingAction:
    id: str
    intent: str
    description: str
    level: int
    preview: dict[str, Any] = field(default_factory=dict)
    executor: Callable[[], Any] | None = None
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    rejected_executor: Callable[[], Any] | None = None

    def expired(self, now: float | None = None) -> bool:
        return (now or time.time()) > self.expires_at

    def public(self) -> dict:
        return {
            "id": self.id,
            "intent": self.intent,
            "description": self.description,
            "level": self.level,
            "level_name": LEVEL_NAMES.get(self.level, "?"),
            "preview": self.preview,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


class SecurityError(Exception):
    """Ação bloqueada pela política de segurança."""


class PermissionManager:
    def __init__(self, config: Config, audit=None) -> None:
        self.config = config
        self.audit = audit
        self.pending: dict[str, PendingAction] = {}
        self._last_pending_id: str | None = None
        self.ttl = 180  # segundos para confirmar

    # ----------------------------------------------------------------- policy
    @property
    def confirm_level(self) -> int:
        try:
            return int(self.config.get("security.confirm_level", 2))
        except Exception:
            return 2

    def requires_confirmation(self, level: int) -> bool:
        if not self.config.get("security.default_confirm", True):
            return level >= 3
        return level >= self.confirm_level

    def check_text(self, text: str) -> None:
        lowered = text.lower()
        for pattern in self.config.get("security.forbidden_patterns", []) or []:
            if pattern.lower() in lowered:
                if self.audit:
                    self.audit.record("security.block", f"padrão proibido: {pattern}",
                                      level=3, result="bloqueado")
                raise SecurityError(
                    f"não posso executar isso: o trecho \"{pattern}\" está na lista de comandos proibidos."
                )

    def allowed_roots(self) -> list[Path]:
        configured = self.config.get("security.allowed_roots") or []
        roots: list[Path] = []
        for item in configured:
            roots.append(self.config.resolve(item))
        if not roots:
            home = Path.home()
            roots = [home, home / "Downloads", home / "Documents", home / "Desktop",
                     home / "Pictures", home / "Music", home / "Videos"]
        unique, seen = [], set()
        for root in roots:
            try:
                resolved = root.expanduser().resolve()
            except Exception:
                continue
            if resolved not in seen:
                seen.add(resolved)
                unique.append(resolved)
        return unique

    def check_path(self, path: str | Path, write: bool = False) -> Path:
        candidate = Path(str(path)).expanduser()
        try:
            resolved = candidate.resolve()
        except Exception as exc:  # caminho inválido
            raise SecurityError(f"caminho inválido: {path}") from exc

        protected = []
        for item in self.config.get("security.protected_paths", []) or []:
            try:
                protected.append(Path(item).resolve())
            except Exception:
                continue
        for prot in protected:
            if resolved == prot or prot in resolved.parents:
                raise SecurityError(f"acesso negado a uma área protegida do sistema ({prot}).")

        if write:
            roots = self.allowed_roots()
            inside = any(resolved == root or root in resolved.parents for root in roots)
            if not inside:
                raise SecurityError(
                    "esse caminho está fora das pastas autorizadas. "
                    "Adicione-o em security.allowed_roots nas configurações para permitir."
                )
        return resolved

    # ------------------------------------------------------------ confirmação
    def create_pending(self, intent: str, description: str, level: int,
                       executor: Callable[[], Any], preview: dict | None = None,
                       rejected_executor: Callable[[], Any] | None = None) -> PendingAction:
        action = PendingAction(
            id=uuid.uuid4().hex[:8],
            intent=intent,
            description=description,
            level=level,
            preview=preview or {},
            executor=executor,
            expires_at=time.time() + self.ttl,
            rejected_executor=rejected_executor,
        )
        self.pending[action.id] = action
        self._last_pending_id = action.id
        self._prune()
        if self.audit:
            self.audit.record("security.confirm_request", description, level=level, result="aguardando")
        return action

    def latest_pending(self) -> PendingAction | None:
        if self._last_pending_id and self._last_pending_id in self.pending:
            return self.pending[self._last_pending_id]
        return next(iter(self.pending.values()), None)

    def resolve(self, pending_id: str, approved: bool) -> tuple[bool, Any, str]:
        action = self.pending.pop(pending_id, None)
        if not action:
            return False, None, "Não encontrei essa confirmação pendente."
        if action.expired():
            if self.audit:
                self.audit.record("security.confirm_expired", action.description,
                                  level=action.level, result="expirado")
            return False, None, "A confirmação expirou por segurança. Peça a ação novamente."
        if not approved:
            if action.rejected_executor:
                action.rejected_executor()
            if self.audit:
                self.audit.record("security.confirm_denied", action.description,
                                  level=action.level, result="cancelado")
            return True, None, "Entendido. Cancelei a ação."
        try:
            result = action.executor() if action.executor else None
            if self.audit:
                self.audit.record("security.confirm_approved", action.description,
                                  level=action.level, result="executado", confirmed=True)
            return True, result, ""
        except Exception as exc:  # falha na execução após confirmação
            if self.audit:
                self.audit.record("security.execution_error", f"{action.description}: {exc}",
                                  level=action.level, result="erro", confirmed=True)
            return False, None, f"Houve uma falha ao executar: {exc}"

    def _prune(self) -> None:
        now = time.time()
        for pid in [pid for pid, action in self.pending.items() if action.expired(now)]:
            self.pending.pop(pid, None)

    # -------------------------------------------------------------- utilidades
    def level_for(self, intent: str, default: int = 1) -> int:
        return default
