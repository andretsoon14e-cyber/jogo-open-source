"""Núcleo do J.A.R.V.I.S.: recebe a frase, interpreta, autoriza, executa e responde."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from .. import __version__
from ..advisor.advisor import Advisor
from ..memory.db import Database
from ..nlu import extract
from ..nlu.engine import Match, engine
from ..nlu.normalizer import normalize
from ..security.audit import AuditLog
from ..security.permissions import PermissionManager, SecurityError
from ..voice.manager import VoiceManager
from .bus import EventBus
from .config import Config, get_config
from .personality import Personality
from .response import Response
from .state import State, StateManager

logger = logging.getLogger("jarvis.core")

CONFIRM_YES = {"sim", "confirmo", "confirmado", "pode", "pode fazer", "autorizo", "claro",
               "isso", "positivo", "manda", "aceito", "aprovo", "com certeza", "beleza", "ok",
               "prosseguir", "continue", "executa", "faça", "faca"}
CONFIRM_NO = {"nao", "não", "cancela", "cancelar", "negativo", "aborta", "para", "pare",
              "deixa", "deixa pra la", "desisto", "melhor nao", "nao quero"}


class Assistant:
    def __init__(self, config: Config | None = None) -> None:
        self.config = config or get_config()
        self.root = self.config.root
        self.db = Database(self.root / "data" / "jarvis.db")
        self.bus = EventBus()
        self.state = StateManager()
        self.audit = AuditLog(
            self.db,
            self.config.resolve(self.config.get("logging.audit_file", "data/logs/audit.jsonl")),
            enabled=bool(self.config.get("logging.audit_enabled", True)),
        )
        self.permissions = PermissionManager(self.config, self.audit)
        self.personality = Personality(self.config)
        self.voice = VoiceManager(self.config)
        self.advisor = Advisor(self.config, self.db, self.personality)
        self.engine = engine
        self.started_at = time.time()
        self.last_response: Response | None = None
        self._loaded = False
        self._load_commands()
        from ..personal.scheduler import Scheduler

        self.scheduler = Scheduler(self)
        self.audit.record("core.start", "J.A.R.V.I.S. iniciado", level=1)
        self._set_state(State.IDLE)
        self.bus.emit("system", self.status())

    # ------------------------------------------------------------------ setup
    def _load_commands(self) -> None:
        if self._loaded:
            return
        self.engine = engine
        from ..nlu.engine import load_commands

        load_commands()  # importar os módulos registra os comandos no motor
        self._loaded = True

    # ----------------------------------------------------------------- estado
    def _set_state(self, state: State, error: str | None = None) -> None:
        snapshot = self.state.set(state, error)
        self.bus.emit("state", snapshot)

    def status(self) -> dict:
        from ..system import sysinfo

        data = sysinfo.snapshot()
        return {
            "assistant": {
                "name": self.config.get("assistant.name", "J.A.R.V.I.S."),
                "version": __version__,
                "started_at": self.started_at,
                "uptime_s": int(time.time() - self.started_at),
                "state": self.state.snapshot(),
                "user_title": self.personality.title(),
                "offline": True,
            },
            "system": data,
            "voice": self.voice.status(),
            "storage": self.db.counts(),
            "security": {
                "confirm_level": self.permissions.confirm_level,
                "pending": [action.public() for action in self.permissions.pending.values()],
                "audit_enabled": bool(self.config.get("logging.audit_enabled", True)),
            },
            "scheduler": self.scheduler.status(),
            "commands": len(self.engine.commands),
        }

    # --------------------------------------------------------------- interface
    async def handle_text(self, text: str, source: str = "web", speak: bool = True) -> Response:
        text = (text or "").strip()
        if not text:
            return Response(reply="", source=source, speak=False)

        self.bus.emit("user_message", {"text": text, "source": source})
        self.db.add_conversation("user", text)
        self._set_state(State.PROCESSING)

        # 1) confirmações pendentes
        norm = normalize(text).strip()
        pending = self.permissions.latest_pending()
        if pending and norm in {normalize(x) for x in CONFIRM_YES | CONFIRM_NO}:
            approved = norm in {normalize(x) for x in CONFIRM_YES}
            response = await self._resolve_confirmation(pending.id, approved)
            await self._finish(response, speak)
            return response

        # 2) palavra de ativação
        cleaned = text
        if self.voice.wake_detected(text):
            cleaned = self.voice.strip_wake(text) or ""
            if not cleaned:
                response = Response(reply=self.voice.greeting(), intent="wake",
                                    data={"wake": True}, source=source)
                await self._finish(response, speak)
                return response

        # 3) interpretação
        match = self.engine.match(cleaned)
        if match is None:
            response = await self._fallback(cleaned, source)
        else:
            response = await self._dispatch(cleaned, match, source)

        # 4) frases compostas ("abre o chrome e coloca música")
        if match is None and response.data.get("_try_compound"):
            compound = await self._compound(cleaned, source)
            if compound is not None:
                response = compound
        response.data.pop("_try_compound", None)

        await self._finish(response, speak)
        return response

    async def _dispatch(self, text: str, match: Match, source: str, dry_run: bool = False) -> Response:
        from ..commands.base import Context

        ctx = Context(
            assistant=self,
            text=text,
            clean=text,
            norm=match.normalized,
            slots=match.slots,
            match=match,
            source=source,
            dry_run=dry_run,
        )
        command = match.command
        try:
            self.permissions.check_text(text)   # bloqueia padrões destrutivos conhecidos
            if command.level >= self.permissions.confirm_level and getattr(command, "gate", True):
                preview_response = self._call_handler(command, ctx.with_dry_run(True))
                description = (preview_response.reply if preview_response and preview_response.reply
                               else f"executar “{text}”")
                description = description[:240]

                def executor():
                    return self._call_handler(command, ctx)

                pending = self.permissions.create_pending(
                    intent=command.intent,
                    description=description,
                    level=command.level,
                    executor=executor,
                    preview=(preview_response.data.get("preview") if preview_response else None),
                )
                self._set_state(State.CONFIRMING)
                return Response(
                    reply=self.personality.confirm_request(description, command.level),
                    intent=command.intent,
                    confidence=match.confidence,
                    pending=pending.public(),
                    data={"preview": pending.preview},
                    source=source,
                )
            if command.level >= 2:
                self._set_state(State.EXECUTING)
            return self._call_handler(command, ctx)
        except SecurityError as exc:
            self.audit.record("security.denied", str(exc), level=command.level, result="bloqueado")
            return Response(reply=self.personality.denied(str(exc)), intent=command.intent,
                            error=True, source=source)
        except Exception as exc:  # nenhuma falha deve derrubar o assistente
            logger.exception("falha no comando %s", command.intent)
            self.audit.record("command.error", f"{command.intent}: {exc}", level=command.level,
                              result="erro")
            return Response(reply=self.personality.error(f"falha interna ({exc})"),
                            intent=command.intent, error=True, source=source)

    def _call_handler(self, command, ctx) -> Response:
        result = command.handler(ctx)
        if isinstance(result, Response):
            if not result.intent:
                result.intent = command.intent
            return result
        return Response(reply=str(result), intent=command.intent, source=ctx.source)

    # ------------------------------------------------------------- confirmação
    async def _resolve_confirmation(self, pending_id: str, approved: bool) -> Response:
        ok, result, message = self.permissions.resolve(pending_id, approved)
        if not ok:
            return Response(reply=message or self.personality.cancelled(), error=True)
        if not approved:
            return Response(reply=message or self.personality.cancelled())
        if isinstance(result, Response):
            return result
        return Response(reply=self.personality.confirmed("Ação executada."))

    async def confirm(self, pending_id: str, approved: bool) -> Response:
        self._set_state(State.EXECUTING if approved else State.IDLE)
        response = await self._resolve_confirmation(pending_id, approved)
        await self._finish(response, True)
        return response

    # ---------------------------------------------------------------- fallback
    async def _fallback(self, text: str, source: str) -> Response:
        # rotinas por gatilho ("modo estudo")
        routine = self._match_routine(text)
        if routine:
            return await self.run_routine(routine, source=source)

        tokens = normalize(text).split()
        # frases longas provavelmente são conversa/conselho, não comando
        if len(tokens) >= 5 and re.search(r"(?i)\b(acho|penso|preciso|devo|vale|melhor|"
                                          r"problema|dificuldade|consigo|decidir|escolher|"
                                          r"planejar|organizar)\b", text):
            advice = self.advisor.decide(text) if re.search(r"(?i)\b(devo|vale|escolher|decidir)\b", text) \
                else self.advisor.reflect(text)
            return Response(reply=advice.text, intent="advice.fallback", confidence=0.4,
                            data={"questions": advice.questions}, source=source,
                            followups=advice.questions[:2])

        if len(tokens) >= 3:
            response = Response(reply=self.personality.unknown_intent(self.engine.suggest(text)),
                                intent="unknown", confidence=0.2, source=source)
            response.data["_try_compound"] = True
            return response

        return Response(reply=self.personality.unknown_intent(self.engine.suggest(text)),
                        intent="unknown", confidence=0.2, source=source)

    async def _compound(self, text: str, source: str) -> Response | None:
        parts = re.split(r"\s+e\s+(?=\w)|\s+depois\s+", text, maxsplit=2)
        parts = [part.strip() for part in parts if part.strip()]
        if len(parts) < 2:
            return None
        replies: list[str] = []
        intents: list[str] = []
        for part in parts:
            match = self.engine.match(part)
            if not match:
                replies.append(f"Não reconheci “{part}”.")
                continue
            sub = await self._dispatch(part, match, source)
            replies.append(sub.reply)
            intents.append(sub.intent)
            if sub.pending:
                # interrompe o encadeamento para não executar às cegas
                break
        return Response(reply=" ".join(replies), intent="+".join(intents) or "compound",
                        confidence=0.6, source=source)

    def _match_routine(self, text: str) -> dict | None:
        norm = normalize(text)
        for routine in self.db.list_routines(only_enabled=True):
            names = [routine["name"], *(routine.get("triggers") or [])]
            for name in names:
                norm_name = normalize(name)
                if norm_name and norm_name in norm:
                    return routine
        return None

    async def run_routine(self, routine: dict, source: str = "routine") -> Response:
        steps = routine.get("steps") or []
        if not steps:
            return Response(reply=f"A rotina “{routine['name']}” está vazia.", error=True,
                            source=source)
        self._set_state(State.EXECUTING)
        self.bus.emit("routine", {"name": routine["name"], "status": "iniciando",
                                  "total": len(steps)})
        replies: list[str] = []
        blocked: list[str] = []
        for index, step in enumerate(steps, start=1):
            step_text = step.get("text", "") if isinstance(step, dict) else str(step)
            match = self.engine.match(step_text)
            if not match:
                replies.append(f"passo {index} não reconhecido ({step_text})")
                continue
            if match.command.level >= self.permissions.confirm_level:
                blocked.append(step_text)
                continue
            sub = await self._dispatch(step_text, match, source="routine")
            replies.append(sub.reply)
            self.bus.emit("routine", {"name": routine["name"], "status": "passo",
                                      "step": index, "total": len(steps), "text": step_text,
                                      "reply": sub.reply})
            await asyncio.sleep(0.35)
        self.db.mark_routine_run(int(routine["id"]))
        self.audit.record("routine.run", f"{routine['name']} ({len(steps)} passos)", level=1)
        summary = f"Rotina “{routine['name']}” executada. " + " ".join(r for r in replies if r)
        if blocked:
            summary += (" Estes passos exigem confirmação e não foram executados: "
                        + "; ".join(blocked) + ".")
        self.bus.emit("routine", {"name": routine["name"], "status": "concluida"})
        return Response(reply=summary, intent="routine.run", data={"routine": routine["name"]},
                        source=source)

    # -------------------------------------------------------------- finalização
    async def _finish(self, response: Response, speak: bool = True) -> None:
        if not response:
            return
        self.last_response = response
        if response.reply:
            self.db.add_conversation("assistant", response.reply, intent=response.intent,
                                     meta={"pending": bool(response.pending)})
            self.bus.emit("assistant_message", {
                "text": response.reply,
                "intent": response.intent,
                "confidence": response.confidence,
                "pending": response.pending,
                "error": response.error,
                "followups": response.followups,
                "source": response.source,
            })
        if response.pending:
            self._set_state(State.CONFIRMING)
        elif response.error:
            self._set_state(State.ERROR, error=response.reply[:160])
        else:
            self._set_state(State.IDLE)

        should_speak = speak and response.speak and bool(response.reply)
        if should_speak and str(self.config.get("voice.tts.engine", "auto")) != "disabled":
            self._speak(response.reply)

    def _speak(self, text: str) -> None:
        audio_info = self.voice.synthesize(text)
        payload = {
            "text": text,
            "engine": audio_info.get("engine"),
            "use_browser": audio_info.get("use_browser", True),
        }
        if audio_info.get("audio"):
            import base64

            payload["audio_b64"] = base64.b64encode(audio_info["audio"]).decode("ascii")
            payload["mime"] = "audio/wav"
        self.voice.begin_speaking()
        self.bus.emit("speak", payload)

    def notify(self, title: str, message: str, speak: bool = True, **extra: Any) -> None:
        payload = {"title": title, "message": message, "ts": time.time(), **extra}
        self.bus.emit("notification", payload)
        self.db.add_conversation("assistant", f"[{title}] {message}", intent="notification")
        if speak:
            self._speak(message)

    # ------------------------------------------------------------------ métricas
    async def metrics_loop(self) -> None:
        from ..system import sysinfo

        interval = max(2, int(self.config.get("system.performance_interval_s", 3)))
        while True:
            try:
                if self.bus.subscriber_count:
                    snapshot = await asyncio.to_thread(sysinfo.snapshot)
                    self.bus.emit("metrics", snapshot)
            except Exception:
                pass
            await asyncio.sleep(interval)

    async def scheduler_loop(self) -> None:
        await self.scheduler.run_forever()

    def shutdown(self) -> None:
        self.audit.record("core.stop", "J.A.R.V.I.S. encerrado", level=1)
        self.db.close()
