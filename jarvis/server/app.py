"""Servidor local do J.A.R.V.I.S. (FastAPI). Escuta apenas a sua máquina/rede local.

Não há telemetria, nem chamadas externas: o servidor serve a interface e conversa
com o núcleo via HTTP/WebSocket em localhost.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response as RawResponse
from fastapi.staticfiles import StaticFiles

from ..core.assistant import Assistant
from ..core.config import get_config
from ..core.logging_setup import setup_logging

logger = logging.getLogger("jarvis.server")
WEB_DIR = Path(__file__).resolve().parents[2] / "web"

SETTINGS_WHITELIST = {
    "assistant.user_name", "assistant.user_title", "assistant.name",
    "personality.formality", "personality.humor", "personality.verbosity",
    "personality.use_honorific", "personality.proactive_suggestions",
    "voice.wake_word.enabled", "voice.wake_word.sensitivity", "voice.wake_word.greeting",
    "voice.tts.engine", "voice.tts.prefer_browser", "voice.tts.rate", "voice.tts.volume",
    "voice.stt.engine", "voice.barge_in.enabled",
    "security.confirm_level", "security.default_confirm", "security.microphone_enabled",
    "security.audit_enabled",
    "interface.show_performance", "interface.theme", "interface.history_limit",
    "llm.enabled", "llm.endpoint", "llm.model", "llm.provider",
    "automation.scheduler_tick_s", "system.performance_interval_s",
}


def create_app(assistant: Assistant | None = None) -> FastAPI:
    assistant = assistant or Assistant(get_config())
    config = assistant.config
    setup_logging(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        tasks = [
            asyncio.create_task(assistant.metrics_loop()),
            asyncio.create_task(assistant.scheduler_loop()),
        ]
        logger.info("J.A.R.V.I.S. pronto em http://%s:%s", config.get("interface.host", "0.0.0.0"),
                    config.get("interface.port", 8765))
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            assistant.shutdown()

    app = FastAPI(title="J.A.R.V.I.S.", version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", redoc_url=None)
    app.state.assistant = assistant

    # ------------------------------------------------------------- interface
    if WEB_DIR.exists():
        app.mount("/js", StaticFiles(directory=WEB_DIR / "js"), name="js")
        app.mount("/css", StaticFiles(directory=WEB_DIR / "css"), name="css")
        if (WEB_DIR / "assets").exists():
            app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    async def index():
        index_file = WEB_DIR / "index.html"
        if not index_file.exists():
            return JSONResponse({"error": "interface não encontrada"}, status_code=404)
        return FileResponse(index_file, headers={"Cache-Control": "no-store"})

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        icon = WEB_DIR / "assets" / "favicon.svg"
        if icon.exists():
            return FileResponse(icon, media_type="image/svg+xml")
        return RawResponse(status_code=204)

    # ------------------------------------------------------------------ estado
    @app.get("/api/status")
    async def status():
        return assistant.status()

    @app.get("/api/system")
    async def system():
        from ..system import sysinfo

        return sysinfo.snapshot()

    @app.get("/api/commands")
    async def commands():
        return {"commands": assistant.engine.describe()}

    @app.get("/api/settings")
    async def get_settings():
        return {"settings": config.public_dict(), "editable": sorted(SETTINGS_WHITELIST)}

    @app.patch("/api/settings")
    async def patch_settings(payload: dict[str, Any] = Body(...)):
        applied, rejected = {}, []
        for key, value in payload.items():
            if key not in SETTINGS_WHITELIST:
                rejected.append(key)
                continue
            config.set(key, value)
            applied[key] = value
        assistant.personality = type(assistant.personality)(config)
        assistant.advisor.personality = assistant.personality
        assistant.voice.reload()
        assistant.bus.emit("settings", {"applied": applied, "rejected": rejected})
        assistant.bus.emit("system", assistant.status())
        return {"applied": applied, "rejected": rejected, "settings": config.public_dict()}

    # ----------------------------------------------------------------- conversa
    @app.post("/api/command")
    async def command(payload: dict[str, Any] = Body(...)):
        text = str(payload.get("text", "")).strip()
        if not text:
            raise HTTPException(status_code=400, detail="texto vazio")
        response = await assistant.handle_text(
            text,
            source=str(payload.get("source", "web")),
            speak=bool(payload.get("speak", True)),
        )
        return response.to_dict()

    @app.post("/api/confirm")
    async def confirm(payload: dict[str, Any] = Body(...)):
        pending_id = str(payload.get("id", ""))
        approved = bool(payload.get("approved", False))
        if not pending_id:
            raise HTTPException(status_code=400, detail="id obrigatório")
        response = await assistant.confirm(pending_id, approved)
        return response.to_dict()

    @app.get("/api/history")
    async def history(limit: int = Query(60, ge=1, le=400)):
        return {"messages": assistant.db.recent_conversations(limit)}

    @app.delete("/api/history")
    async def clear_history():
        assistant.db.execute("DELETE FROM conversations")
        return {"ok": True}

    # -------------------------------------------------------------------- voz
    @app.get("/api/voice/status")
    async def voice_status():
        return assistant.voice.status()

    @app.post("/api/voice/transcribe")
    async def transcribe(request: Request, wake_only: bool = Query(False),
                        require_wake: bool = Query(False)):
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="áudio vazio")
        if len(body) > 12 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="áudio muito grande")
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, assistant.voice.transcribe, body, request.headers.get("content-type", "audio/wav")
        )
        wake = assistant.voice.wake_detected(result.text) if result.text else False
        payload = result.to_dict()
        payload.update({"wake": wake, "microphone_enabled": assistant.voice.microphone_enabled})
        if require_wake and result.text and not wake:
            payload["ignored"] = "aguardando a palavra de ativação"
            return payload
        if not result.text and not assistant.voice.stt.available:
            payload["message"] = assistant.voice.stt.reason
        if wake_only:
            return payload
        if not result.text:
            return payload
        text = assistant.voice.strip_wake(result.text) if wake else result.text
        if not text:
            return {**payload, "reply": assistant.voice.greeting(), "intent": "wake"}
        command_response = await assistant.handle_text(text, source="voice")
        return {**payload, "result": command_response.to_dict()}

    @app.post("/api/voice/tts")
    async def tts(payload: dict[str, Any] = Body(...)):
        text = str(payload.get("text", "")).strip()
        if not text:
            raise HTTPException(status_code=400, detail="texto vazio")
        if len(text) > 1200:
            text = text[:1200]
        info = await asyncio.get_running_loop().run_in_executor(
            None, assistant.voice.synthesize, text
        )
        if not info.get("audio"):
            return RawResponse(status_code=204,
                               headers={"X-Voice-Engine": str(info.get("engine") or "browser"),
                                        "X-Use-Browser": "1"})
        return RawResponse(content=info["audio"], media_type="audio/wav",
                           headers={"X-Voice-Engine": str(info.get("engine"))})

    @app.post("/api/voice/stop")
    async def stop_speaking():
        assistant.voice.stop_speaking()
        assistant.bus.emit("stop", {"reason": "api"})
        return {"ok": True}

    @app.get("/api/voice/greeting")
    async def greeting():
        return {"text": assistant.voice.greeting()}

    # ----------------------------------------------------------------- memória
    @app.get("/api/memory")
    async def list_memory(category: str | None = None, q: str | None = None):
        rows = assistant.db.search_memories(q) if q else assistant.db.list_memories(category=category)
        return {"memories": rows}

    @app.post("/api/memory")
    async def add_memory(payload: dict[str, Any] = Body(...)):
        value = str(payload.get("value", "")).strip()
        if not value:
            raise HTTPException(status_code=400, detail="valor obrigatório")
        memory_id = assistant.db.add_memory(
            value,
            key=payload.get("key"),
            category=str(payload.get("category", "fato")),
            source="interface",
        )
        assistant.audit.record("memory.add.ui", value, level=1)
        return {"id": memory_id, "memory": assistant.db.one("SELECT * FROM memories WHERE id=?",
                                                           (memory_id,))}

    @app.patch("/api/memory/{memory_id}")
    async def edit_memory(memory_id: int, payload: dict[str, Any] = Body(...)):
        updated = assistant.db.update_memory(memory_id, payload.get("value"), payload.get("category"))
        if not updated:
            raise HTTPException(status_code=404, detail="registro não encontrado")
        return {"ok": True}

    @app.delete("/api/memory/{memory_id}")
    async def delete_memory(memory_id: int):
        if not assistant.db.delete_memory(memory_id):
            raise HTTPException(status_code=404, detail="registro não encontrado")
        assistant.audit.record("memory.delete.ui", f"id={memory_id}", level=2, confirmed=True)
        return {"ok": True}

    # -------------------------------------------------------------- organização
    @app.get("/api/tasks")
    async def tasks(status: str | None = "pendente"):
        return {"tasks": assistant.db.list_tasks(status=status),
                "reminders": assistant.db.pending_reminders()}

    @app.post("/api/tasks")
    async def add_task(payload: dict[str, Any] = Body(...)):
        title = str(payload.get("title", "")).strip()
        if not title:
            raise HTTPException(status_code=400, detail="título obrigatório")
        due = payload.get("due_at")
        priority = int(payload.get("priority", 2) or 2)
        task_id = assistant.db.add_task(title, payload.get("description"), due, priority)
        return {"id": task_id}

    @app.post("/api/tasks/{task_id}/complete")
    async def complete_task(task_id: int):
        if not assistant.db.complete_task(task_id):
            raise HTTPException(status_code=404, detail="tarefa não encontrada")
        return {"ok": True}

    @app.delete("/api/tasks/{task_id}")
    async def delete_task(task_id: int):
        if not assistant.db.delete_task(task_id):
            raise HTTPException(status_code=404, detail="tarefa não encontrada")
        return {"ok": True}

    @app.get("/api/reminders")
    async def reminders():
        return {"reminders": assistant.db.pending_reminders()}

    @app.post("/api/reminders")
    async def add_reminder(payload: dict[str, Any] = Body(...)):
        message = str(payload.get("message", "")).strip()
        due_at = payload.get("due_at")
        if not message or due_at is None:
            raise HTTPException(status_code=400, detail="mensagem e due_at são obrigatórios")
        return {"id": assistant.db.add_reminder(message, float(due_at))}

    @app.delete("/api/reminders/{reminder_id}")
    async def delete_reminder(reminder_id: int):
        if not assistant.db.delete_reminder(reminder_id):
            raise HTTPException(status_code=404, detail="lembrete não encontrado")
        return {"ok": True}

    @app.get("/api/notes")
    async def notes():
        return {"notes": assistant.db.list_notes()}

    @app.post("/api/notes")
    async def add_note(payload: dict[str, Any] = Body(...)):
        body = str(payload.get("body", "")).strip()
        if not body:
            raise HTTPException(status_code=400, detail="texto obrigatório")
        return {"id": assistant.db.add_note(body, payload.get("title"))}

    @app.delete("/api/notes/{note_id}")
    async def delete_note(note_id: int):
        if not assistant.db.delete_note(note_id):
            raise HTTPException(status_code=404, detail="anotação não encontrada")
        return {"ok": True}

    @app.get("/api/goals")
    async def goals():
        return {"goals": assistant.db.list_goals(status=None)}

    @app.post("/api/goals")
    async def add_goal(payload: dict[str, Any] = Body(...)):
        title = str(payload.get("title", "")).strip()
        if not title:
            raise HTTPException(status_code=400, detail="título obrigatório")
        return {"id": assistant.db.add_goal(title, payload.get("description"),
                                            payload.get("target_date"))}

    @app.patch("/api/goals/{goal_id}")
    async def update_goal(goal_id: int, payload: dict[str, Any] = Body(...)):
        progress = int(payload.get("progress", 0))
        assistant.db.set_goal_progress(goal_id, progress)
        return {"ok": True}

    # -------------------------------------------------------------- automações
    @app.get("/api/routines")
    async def routines():
        return {"routines": assistant.db.list_routines()}

    @app.post("/api/routines")
    async def add_routine(payload: dict[str, Any] = Body(...)):
        name = str(payload.get("name", "")).strip()
        steps = payload.get("steps") or []
        if not name or not steps:
            raise HTTPException(status_code=400, detail="nome e passos são obrigatórios")
        normalized = [{"text": step if isinstance(step, str) else step.get("text", "")}
                      for step in steps]
        routine_id = assistant.db.upsert_routine(name, normalized,
                                                 description=payload.get("description"),
                                                 triggers=payload.get("triggers"))
        assistant.audit.record("routine.create.ui", name, level=1)
        return {"id": routine_id}

    @app.patch("/api/routines/{name}")
    async def toggle_routine(name: str, payload: dict[str, Any] = Body(...)):
        if not assistant.db.set_routine_enabled(name, bool(payload.get("enabled", True))):
            raise HTTPException(status_code=404, detail="rotina não encontrada")
        return {"ok": True}

    @app.delete("/api/routines/{name}")
    async def delete_routine(name: str):
        if not assistant.db.delete_routine(name):
            raise HTTPException(status_code=404, detail="rotina não encontrada")
        return {"ok": True}

    @app.post("/api/routines/{name}/run")
    async def run_routine(name: str):
        routine = assistant.db.get_routine(name)
        if not routine:
            raise HTTPException(status_code=404, detail="rotina não encontrada")
        response = await assistant.run_routine(routine, source="interface")
        return response.to_dict()

    @app.get("/api/schedules")
    async def schedules():
        return {"schedules": assistant.db.list_schedules(),
                "upcoming": assistant.scheduler.status()["upcoming"]}

    @app.delete("/api/schedules/{schedule_id}")
    async def delete_schedule(schedule_id: int):
        if not assistant.db.delete_schedule(schedule_id):
            raise HTTPException(status_code=404, detail="agendamento não encontrado")
        return {"ok": True}

    # --------------------------------------------------------------- auditoria
    @app.get("/api/audit")
    async def audit(limit: int = Query(80, ge=1, le=400)):
        return {"entries": assistant.audit.recent(limit)}

    @app.get("/api/logs")
    async def logs(lines: int = Query(80, ge=1, le=500)):
        path = config.resolve(config.get("logging.file", "data/logs/jarvis.log"))
        if not path.exists():
            return {"lines": []}
        content = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        return {"lines": content[-lines:]}

    # ------------------------------------------------------------------ eventos
    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        await ws.accept()
        queue = assistant.bus.subscribe()
        try:
            await ws.send_text(json.dumps({"type": "snapshot",
                                           "data": assistant.status(),
                                           "ts": assistant.started_at}, ensure_ascii=False))
            await ws.send_text(json.dumps({"type": "state",
                                           "data": assistant.state.snapshot()}, ensure_ascii=False))

            async def sender():
                while True:
                    event = await queue.get()
                    await ws.send_text(json.dumps(event, ensure_ascii=False, default=str))

            async def receiver():
                while True:
                    raw = await ws.receive_text()
                    try:
                        message = json.loads(raw)
                    except Exception:
                        continue
                    if message.get("type") == "command":
                        await assistant.handle_text(str(message.get("text", "")), source="interface")
                    elif message.get("type") == "ping":
                        await ws.send_text(json.dumps({"type": "pong", "data": None}))

            tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # pragma: no cover
            logger.debug("websocket encerrado: %s", exc)
        finally:
            assistant.bus.unsubscribe(queue)

    return app


app = None


def serve(host: str | None = None, port: int | None = None, open_browser: bool = True) -> None:
    """Sobe o servidor local (usado pelo jarvis.py)."""
    import threading
    import time as _time
    import webbrowser

    import uvicorn

    config = get_config()
    host = host or str(config.get("interface.host", "0.0.0.0"))
    port = int(port or config.get("interface.port", 8765))
    application = create_app()

    display_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    url = f"http://{display_host}:{port}"

    if open_browser:
        def _open():
            _time.sleep(1.8)
            webbrowser.open(url)

        threading.Thread(target=_open, daemon=True).start()

    print(f"\n  J.A.R.V.I.S. — interface disponível em {url}")
    print("  Pressione Ctrl+C para encerrar.\n")
    uvicorn.run(application, host=host, port=port, log_level="info", access_log=False)
