"""Agendador local: lembretes, temporizadores e tarefas programadas.

Roda dentro do próprio assistente (asyncio), consultando o SQLite a cada ciclo.
Nada depende de internet ou de serviços externos.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger("jarvis.scheduler")


class Scheduler:
    def __init__(self, assistant) -> None:
        self.assistant = assistant
        self.db = assistant.db
        self.tick_seconds = max(5, int(assistant.config.get("automation.scheduler_tick_s", 20)))
        self.last_tick: float = 0.0
        self._running = False

    # ------------------------------------------------------------------ ciclo
    async def run_forever(self) -> None:
        self._running = True
        await asyncio.sleep(1.0)
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover
                logger.warning("falha no agendador: %s", exc)
            await asyncio.sleep(self.tick_seconds)

    async def tick(self) -> None:
        self.last_tick = time.time()
        await self._fire_reminders()
        await self._fire_timers()
        await self._fire_schedules()

    async def _fire_reminders(self) -> None:
        for reminder in self.db.due_reminders():
            self.db.mark_reminder_done(int(reminder["id"]))
            self.assistant.audit.record("reminder.fired", reminder["message"], level=1)
            self.assistant.notify(
                "Lembrete",
                f"{self.assistant.personality.title() or 'Senhor'}, o senhor me pediu para avisar: "
                f"{reminder['message']}.",
                reminder_id=reminder["id"],
            )
            repeat = (reminder.get("repeat") or "").lower()
            if repeat in ("diario", "diário", "daily"):
                next_at = reminder["due_at"] + 86400
                if next_at > time.time():
                    self.db.add_reminder(reminder["message"], next_at, repeat="diario")

    async def _fire_timers(self) -> None:
        for timer in self.db.due_timers():
            self.db.finish_timer(int(timer["id"]))
            self.assistant.audit.record("timer.fired", timer["label"], level=1)
            self.assistant.notify(
                "Temporizador",
                f"Tempo encerrado: {timer['label']}.",
                timer_id=timer["id"],
            )

    async def _fire_schedules(self) -> None:
        for schedule in self.db.due_schedules():
            action = schedule["action"]
            payload = {}
            if schedule.get("payload"):
                import json

                try:
                    payload = json.loads(schedule["payload"])
                except Exception:
                    payload = {}
            self.db.mark_schedule_run(int(schedule["id"]))
            try:
                await self._execute(action, payload, schedule)
            except Exception as exc:
                logger.warning("falha ao executar agendamento %s: %s", schedule["label"], exc)
                self.assistant.audit.record("schedule.error", f"{schedule['label']}: {exc}",
                                            level=3, result="erro")

    async def _execute(self, action: str, payload: dict[str, Any], schedule: dict) -> None:
        from ..system import power

        if action.startswith("system."):
            mode = action.split(".", 1)[1]
            fn = power.ACTIONS.get(mode)
            if not fn:
                raise ValueError(f"ação desconhecida: {action}")
            success, message = fn()
            self.assistant.audit.record("schedule.power", f"{schedule['label']}: {message}",
                                        level=3, result="ok" if success else "erro", confirmed=True)
            if not success:
                self.assistant.notify("Falha no agendamento", message)
            return

        if action == "routine":
            name = payload.get("name")
            routine = self.db.get_routine(name) if name else None
            if routine:
                await self.assistant.run_routine(routine, source="scheduler")
            return

        if action == "notify":
            self.assistant.notify(payload.get("title", "Aviso"), payload.get("message", ""))
            return

        if action == "command":
            text = payload.get("text", "")
            if text:
                await self.assistant.handle_text(text, source="scheduler")

    # ------------------------------------------------------------------ estado
    def upcoming(self, limit: int = 6) -> list[dict]:
        items: list[dict] = []
        now = time.time()
        for reminder in self.db.pending_reminders():
            items.append({
                "kind": "lembrete",
                "label": reminder["message"],
                "when": reminder["due_at"],
                "in_s": int(reminder["due_at"] - now),
            })
        for schedule in self.db.list_schedules(only_enabled=True):
            if schedule.get("when_at"):
                items.append({
                    "kind": "agendamento",
                    "label": schedule["label"],
                    "when": schedule["when_at"],
                    "in_s": int(schedule["when_at"] - now),
                })
        items.sort(key=lambda item: item["when"])
        return items[:limit]

    def status(self) -> dict:
        upcoming = self.upcoming()
        return {
            "tick_seconds": self.tick_seconds,
            "last_tick": self.last_tick,
            "running": self._running,
            "upcoming": [
                {
                    **item,
                    "when_iso": datetime.fromtimestamp(item["when"]).isoformat(timespec="minutes"),
                }
                for item in upcoming
            ],
        }
