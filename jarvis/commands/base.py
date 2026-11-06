"""Contexto entregue a cada comando."""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from ..nlu.engine import Match


@dataclass
class Context:
    assistant: Any                     # jarvis.core.assistant.Assistant
    text: str                          # texto original do usuário
    clean: str                         # texto sem a palavra de ativação
    norm: str
    slots: dict[str, Any]
    match: Match | None = None
    source: str = "web"
    dry_run: bool = False

    # atalhos úteis
    @property
    def db(self):
        return self.assistant.db

    @property
    def config(self):
        return self.assistant.config

    @property
    def personality(self):
        return self.assistant.personality

    @property
    def permissions(self):
        return self.assistant.permissions

    @property
    def voice(self):
        return self.assistant.voice

    @property
    def advisor(self):
        return self.assistant.advisor

    @property
    def intent(self) -> str:
        return self.match.command.intent if self.match else ""

    def with_dry_run(self, dry_run: bool) -> "Context":
        return replace(self, dry_run=dry_run)

    def residual(self) -> str:
        return str(self.slots.get("residual") or "")
