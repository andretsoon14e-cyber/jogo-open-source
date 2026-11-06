"""Barramento de eventos interno (assíncrono, com histórico em memória)."""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, AsyncIterator, Callable

MAX_HISTORY = 400


class EventBus:
    """Publica eventos para todos os assinantes (WebSocket, CLI, logs)."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue] = []
        self._history: deque[dict] = deque(maxlen=MAX_HISTORY)
        self._sync_listeners: list[Callable[[dict], None]] = []

    # ---------------------------------------------------------------- publish
    def emit(self, kind: str, data: Any = None) -> dict:
        event = {"type": kind, "data": data, "ts": time.time()}
        self._history.append(event)
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass
        for listener in list(self._sync_listeners):
            try:
                listener(event)
            except Exception:
                pass
        return event

    # -------------------------------------------------------------- subscribe
    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    def on_event(self, listener: Callable[[dict], None]) -> None:
        self._sync_listeners.append(listener)

    async def stream(self, queue: asyncio.Queue) -> AsyncIterator[dict]:
        while True:
            event = await queue.get()
            yield event

    def recent(self, limit: int = 50) -> list[dict]:
        return list(self._history)[-limit:]

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)
