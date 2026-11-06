"""Registro local de tudo que o assistente executou (auditoria em banco + JSONL)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from ..memory.db import Database


class AuditLog:
    def __init__(self, db: Database, file_path: Path | None = None, enabled: bool = True) -> None:
        self.db = db
        self.enabled = enabled
        self.file_path = file_path
        self.logger = logging.getLogger("jarvis.audit")

    def record(self, action: str, detail: str = "", level: int = 1, result: str = "ok",
               confirmed: bool = False) -> None:
        entry = {
            "ts": time.time(),
            "action": action,
            "detail": detail,
            "level": level,
            "result": result,
            "confirmed": confirmed,
        }
        if not self.enabled:
            return
        try:
            self.db.add_audit(action, detail, level, result, confirmed)
        except Exception as exc:  # nunca deixar a auditoria derrubar o assistente
            self.logger.warning("falha ao gravar auditoria no banco: %s", exc)
        if self.file_path:
            try:
                self.file_path.parent.mkdir(parents=True, exist_ok=True)
                with self.file_path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            except Exception as exc:
                self.logger.warning("falha ao gravar auditoria em arquivo: %s", exc)
        self.logger.info("[%s] %s — %s (%s)", "confirmado" if confirmed else "auto",
                         action, detail, result)

    def recent(self, limit: int = 100) -> list[dict]:
        return self.db.list_audit(limit)
