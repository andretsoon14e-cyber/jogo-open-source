"""Banco de dados local (SQLite). Nada sai deste arquivo: tudo é gravado em disco.

Tabelas
-------
settings      preferências chave/valor
memories      memória de longo prazo (fatos, preferências, projetos)
conversations histórico de diálogo
tasks         tarefas e listas
reminders     lembretes avulsos
notes         anotações
goals         objetivos com progresso
routines      rotinas/automações por voz
schedules     agendamentos (desligar às 23h, etc.)
timers        contagens regressivas
audit         registro de ações executadas
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    value TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'fato',
    source TEXT NOT NULL DEFAULT 'usuario',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_cat ON memories(category);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    intent TEXT,
    meta TEXT,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_time ON conversations(created_at);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    due_at REAL,
    priority INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'pendente',
    tags TEXT,
    created_at REAL NOT NULL,
    completed_at REAL
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    due_at REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    repeat TEXT,
    created_at REAL NOT NULL,
    fired_at REAL
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT NOT NULL,
    tags TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    target_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    steps TEXT NOT NULL,
    triggers TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    last_run REAL,
    run_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT,
    when_at REAL,
    cron TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    last_run REAL
);

CREATE TABLE IF NOT EXISTS timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    fire_at REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    result TEXT NOT NULL DEFAULT 'ok',
    confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
"""


def now() -> float:
    return time.time()


def _json(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False)


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ------------------------------------------------------------- primitives
    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cur

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(sql, tuple(params)).fetchall()
        return [dict(row) for row in rows]

    def one(self, sql: str, params: Iterable[Any] = ()) -> dict | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    # --------------------------------------------------------------- settings
    def set_setting(self, key: str, value: Any) -> None:
        self.execute(
            "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, json.dumps(value, ensure_ascii=False), now()),
        )

    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self.one("SELECT value FROM settings WHERE key=?", (key,))
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except Exception:
            return default

    # --------------------------------------------------------------- memories
    def add_memory(self, value: str, key: str | None = None, category: str = "fato",
                   source: str = "usuario") -> int:
        ts = now()
        cur = self.execute(
            "INSERT INTO memories(key, value, category, source, created_at, updated_at) VALUES(?,?,?,?,?,?)",
            (key, value, category, source, ts, ts),
        )
        return int(cur.lastrowid)

    def list_memories(self, category: str | None = None, limit: int = 200) -> list[dict]:
        if category:
            return self.query(
                "SELECT * FROM memories WHERE category=? ORDER BY updated_at DESC LIMIT ?",
                (category, limit),
            )
        return self.query("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", (limit,))

    def search_memories(self, term: str, limit: int = 30) -> list[dict]:
        like = f"%{term.lower()}%"
        return self.query(
            "SELECT * FROM memories WHERE lower(value) LIKE ? OR lower(coalesce(key,'')) LIKE ? "
            "ORDER BY updated_at DESC LIMIT ?",
            (like, like, limit),
        )

    def update_memory(self, memory_id: int, value: str | None = None,
                      category: str | None = None) -> bool:
        fields, params = [], []
        if value is not None:
            fields.append("value=?")
            params.append(value)
        if category is not None:
            fields.append("category=?")
            params.append(category)
        if not fields:
            return False
        fields.append("updated_at=?")
        params.append(now())
        params.append(memory_id)
        cur = self.execute(f"UPDATE memories SET {', '.join(fields)} WHERE id=?", params)
        return cur.rowcount > 0

    def delete_memory(self, memory_id: int) -> bool:
        return self.execute("DELETE FROM memories WHERE id=?", (memory_id,)).rowcount > 0

    # ---------------------------------------------------------- conversations
    def add_conversation(self, role: str, text: str, intent: str | None = None,
                         meta: dict | None = None) -> int:
        cur = self.execute(
            "INSERT INTO conversations(role, text, intent, meta, created_at) VALUES(?,?,?,?,?)",
            (role, text, intent, _json(meta), now()),
        )
        return int(cur.lastrowid)

    def recent_conversations(self, limit: int = 50) -> list[dict]:
        rows = self.query(
            "SELECT * FROM conversations ORDER BY id DESC LIMIT ?", (limit,)
        )
        return list(reversed(rows))

    # ------------------------------------------------------------------ tasks
    def add_task(self, title: str, description: str | None = None, due_at: float | None = None,
                 priority: int = 2, tags: list[str] | None = None) -> int:
        cur = self.execute(
            "INSERT INTO tasks(title, description, due_at, priority, status, tags, created_at) "
            "VALUES(?,?,?,?, 'pendente', ?, ?)",
            (title, description, due_at, priority, _json(tags), now()),
        )
        return int(cur.lastrowid)

    def list_tasks(self, status: str | None = "pendente", day: datetime | None = None) -> list[dict]:
        sql = "SELECT * FROM tasks WHERE 1=1"
        params: list[Any] = []
        if status:
            sql += " AND status=?"
            params.append(status)
        if day:
            start = day.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
            sql += " AND due_at IS NOT NULL AND due_at>=? AND due_at<?"
            params.extend([start, start + 86400])
        sql += " ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, priority LIMIT 200"
        return self.query(sql, params)

    def complete_task(self, task_id: int) -> bool:
        return self.execute(
            "UPDATE tasks SET status='concluida', completed_at=? WHERE id=?", (now(), task_id)
        ).rowcount > 0

    def complete_task_by_title(self, term: str) -> dict | None:
        rows = self.query(
            "SELECT * FROM tasks WHERE status='pendente' AND lower(title) LIKE ? LIMIT 1",
            (f"%{term.lower()}%",),
        )
        if rows:
            self.complete_task(rows[0]["id"])
            return rows[0]
        return None

    def delete_task(self, task_id: int) -> bool:
        return self.execute("DELETE FROM tasks WHERE id=?", (task_id,)).rowcount > 0

    # -------------------------------------------------------------- reminders
    def add_reminder(self, message: str, due_at: float, repeat: str | None = None) -> int:
        cur = self.execute(
            "INSERT INTO reminders(message, due_at, status, repeat, created_at) VALUES(?,?,'pendente',?,?)",
            (message, due_at, repeat, now()),
        )
        return int(cur.lastrowid)

    def pending_reminders(self) -> list[dict]:
        return self.query(
            "SELECT * FROM reminders WHERE status='pendente' ORDER BY due_at LIMIT 200"
        )

    def due_reminders(self, ts: float | None = None) -> list[dict]:
        return self.query(
            "SELECT * FROM reminders WHERE status='pendente' AND due_at<=? ORDER BY due_at",
            (ts if ts is not None else now(),),
        )

    def mark_reminder_done(self, reminder_id: int) -> None:
        self.execute(
            "UPDATE reminders SET status='concluido', fired_at=? WHERE id=?", (now(), reminder_id)
        )

    def delete_reminder(self, reminder_id: int) -> bool:
        return self.execute("DELETE FROM reminders WHERE id=?", (reminder_id,)).rowcount > 0

    # ------------------------------------------------------------------ notes
    def add_note(self, body: str, title: str | None = None, tags: list[str] | None = None) -> int:
        ts = now()
        cur = self.execute(
            "INSERT INTO notes(title, body, tags, created_at, updated_at) VALUES(?,?,?,?,?)",
            (title, body, _json(tags), ts, ts),
        )
        return int(cur.lastrowid)

    def list_notes(self, limit: int = 100) -> list[dict]:
        return self.query("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?", (limit,))

    def search_notes(self, term: str, limit: int = 20) -> list[dict]:
        like = f"%{term.lower()}%"
        return self.query(
            "SELECT * FROM notes WHERE lower(body) LIKE ? OR lower(coalesce(title,'')) LIKE ? "
            "ORDER BY updated_at DESC LIMIT ?",
            (like, like, limit),
        )

    def delete_note(self, note_id: int) -> bool:
        return self.execute("DELETE FROM notes WHERE id=?", (note_id,)).rowcount > 0

    # ------------------------------------------------------------------ goals
    def add_goal(self, title: str, description: str | None = None,
                 target_date: str | None = None) -> int:
        ts = now()
        cur = self.execute(
            "INSERT INTO goals(title, description, target_date, progress, status, created_at, updated_at) "
            "VALUES(?,?,?,0,'ativo',?,?)",
            (title, description, target_date, ts, ts),
        )
        return int(cur.lastrowid)

    def list_goals(self, status: str | None = "ativo") -> list[dict]:
        if status:
            return self.query("SELECT * FROM goals WHERE status=? ORDER BY created_at DESC", (status,))
        return self.query("SELECT * FROM goals ORDER BY created_at DESC")

    def set_goal_progress(self, goal_id: int, progress: int) -> None:
        progress = max(0, min(100, progress))
        status = "concluido" if progress >= 100 else "ativo"
        self.execute(
            "UPDATE goals SET progress=?, status=?, updated_at=? WHERE id=?",
            (progress, status, now(), goal_id),
        )

    # --------------------------------------------------------------- routines
    def upsert_routine(self, name: str, steps: list[dict], description: str | None = None,
                       triggers: list[str] | None = None, enabled: bool = True) -> int:
        existing = self.one("SELECT id FROM routines WHERE name=?", (name,))
        if existing:
            self.execute(
                "UPDATE routines SET steps=?, description=?, triggers=?, enabled=? WHERE id=?",
                (_json(steps), description, _json(triggers or []), int(enabled), existing["id"]),
            )
            return int(existing["id"])
        cur = self.execute(
            "INSERT INTO routines(name, description, steps, triggers, enabled, created_at) "
            "VALUES(?,?,?,?,?,?)",
            (name, description, _json(steps), _json(triggers or []), int(enabled), now()),
        )
        return int(cur.lastrowid)

    def list_routines(self, only_enabled: bool = False) -> list[dict]:
        sql = "SELECT * FROM routines"
        if only_enabled:
            sql += " WHERE enabled=1"
        sql += " ORDER BY name"
        rows = self.query(sql)
        for row in rows:
            row["steps"] = json.loads(row["steps"]) if row.get("steps") else []
            row["triggers"] = json.loads(row["triggers"]) if row.get("triggers") else []
            row["enabled"] = bool(row["enabled"])
        return rows

    def get_routine(self, name: str) -> dict | None:
        rows = [r for r in self.list_routines() if r["name"].lower() == name.lower()]
        return rows[0] if rows else None

    def set_routine_enabled(self, name: str, enabled: bool) -> bool:
        return self.execute(
            "UPDATE routines SET enabled=? WHERE lower(name)=?", (int(enabled), name.lower())
        ).rowcount > 0

    def delete_routine(self, name: str) -> bool:
        return self.execute("DELETE FROM routines WHERE lower(name)=?", (name.lower(),)).rowcount > 0

    def mark_routine_run(self, routine_id: int) -> None:
        self.execute(
            "UPDATE routines SET last_run=?, run_count=run_count+1 WHERE id=?", (now(), routine_id)
        )

    # -------------------------------------------------------------- schedules
    def add_schedule(self, label: str, action: str, when_at: float | None = None,
                     payload: dict | None = None, cron: str | None = None) -> int:
        cur = self.execute(
            "INSERT INTO schedules(label, action, payload, when_at, cron, enabled, created_at) "
            "VALUES(?,?,?,?,?,1,?)",
            (label, action, _json(payload), when_at, cron, now()),
        )
        return int(cur.lastrowid)

    def list_schedules(self, only_enabled: bool = False) -> list[dict]:
        sql = "SELECT * FROM schedules"
        if only_enabled:
            sql += " WHERE enabled=1"
        sql += " ORDER BY id"
        return self.query(sql)

    def due_schedules(self, ts: float | None = None) -> list[dict]:
        return self.query(
            "SELECT * FROM schedules WHERE enabled=1 AND when_at IS NOT NULL AND when_at<=?",
            (ts if ts is not None else now(),),
        )

    def mark_schedule_run(self, schedule_id: int, one_shot: bool = True) -> None:
        if one_shot:
            self.execute(
                "UPDATE schedules SET enabled=0, last_run=? WHERE id=?", (now(), schedule_id)
            )
        else:
            self.execute("UPDATE schedules SET last_run=? WHERE id=?", (now(), schedule_id))

    def delete_schedule(self, schedule_id: int) -> bool:
        return self.execute("DELETE FROM schedules WHERE id=?", (schedule_id,)).rowcount > 0

    # ----------------------------------------------------------------- timers
    def add_timer(self, label: str, fire_at: float) -> int:
        cur = self.execute(
            "INSERT INTO timers(label, fire_at, status, created_at) VALUES(?,?,'ativo',?)",
            (label, fire_at, now()),
        )
        return int(cur.lastrowid)

    def due_timers(self, ts: float | None = None) -> list[dict]:
        return self.query(
            "SELECT * FROM timers WHERE status='ativo' AND fire_at<=?",
            (ts if ts is not None else now(),),
        )

    def finish_timer(self, timer_id: int) -> None:
        self.execute("UPDATE timers SET status='concluido' WHERE id=?", (timer_id,))

    # ------------------------------------------------------------------ audit
    def add_audit(self, action: str, detail: str = "", level: int = 1, result: str = "ok",
                  confirmed: bool = False) -> int:
        cur = self.execute(
            "INSERT INTO audit(ts, action, detail, level, result, confirmed) VALUES(?,?,?,?,?,?)",
            (now(), action, detail, level, result, int(confirmed)),
        )
        return int(cur.lastrowid)

    def list_audit(self, limit: int = 100) -> list[dict]:
        return self.query("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))

    # ------------------------------------------------------------------ stats
    def counts(self) -> dict:
        tables = ["memories", "tasks", "reminders", "notes", "goals", "routines", "conversations"]
        return {
            table: self.one(f"SELECT COUNT(*) AS c FROM {table}")["c"]  # noqa: S608 (tabela fixa)
            for table in tables
        }
