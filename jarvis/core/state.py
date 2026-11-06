"""Máquina de estados do assistente (usada pela interface e pelo núcleo)."""
from __future__ import annotations

import time
from enum import Enum


class State(str, Enum):
    OFFLINE = "offline"        # desligado
    IDLE = "idle"              # aguardando (animação discreta)
    WAKE = "wake"              # palavra de ativação detectada
    LISTENING = "listening"    # gravando áudio
    PROCESSING = "processing"  # interpretando o comando
    EXECUTING = "executing"    # executando ação no sistema
    SPEAKING = "speaking"      # sintetizando/falando
    CONFIRMING = "confirming"  # aguardando autorização do usuário
    ERROR = "error"            # falha sinalizada


class StateManager:
    """Guarda o estado atual, o estado anterior e o último evento de erro."""

    def __init__(self) -> None:
        self._state = State.OFFLINE
        self._previous = State.OFFLINE
        self._since = time.time()
        self._error: str | None = None

    @property
    def current(self) -> State:
        return self._state

    def set(self, state: State, error: str | None = None) -> dict:
        if state == self._state:
            return self.snapshot()
        self._previous = self._state
        self._state = state
        self._since = time.time()
        self._error = error
        return self.snapshot()

    def snapshot(self) -> dict:
        return {
            "state": self._state.value,
            "previous": self._previous.value,
            "since": self._since,
            "error": self._error,
        }
