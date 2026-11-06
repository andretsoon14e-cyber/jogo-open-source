"""Objeto de resposta devolvido por qualquer comando."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Response:
    reply: str = ""
    intent: str = ""
    confidence: float = 0.0
    data: dict[str, Any] = field(default_factory=dict)
    pending: dict[str, Any] | None = None      # confirmação aguardando o usuário
    actions: list[dict] = field(default_factory=list)
    followups: list[str] = field(default_factory=list)
    error: bool = False
    speak: bool = True
    source: str = "web"

    def to_dict(self) -> dict:
        return {
            "reply": self.reply,
            "intent": self.intent,
            "confidence": self.confidence,
            "data": self.data,
            "pending": self.pending,
            "actions": self.actions,
            "followups": self.followups,
            "error": self.error,
            "speak": self.speak,
            "source": self.source,
        }
