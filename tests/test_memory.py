"""Testes do banco local e da organização pessoal."""
from __future__ import annotations

import time


def test_memorias(db):
    memory_id = db.add_memory("prefiro acordar às 7 horas", key="horario", category="preferencia")
    assert db.list_memories()
    assert db.search_memories("acordar")[0]["id"] == memory_id
    assert db.update_memory(memory_id, value="prefiro acordar às 6 horas")
    assert "6 horas" in db.list_memories()[0]["value"]
    assert db.delete_memory(memory_id)
    assert db.list_memories() == []


def test_tarefas_e_lembretes(db):
    task_id = db.add_task("estudar", priority=1)
    assert db.list_tasks()[0]["title"] == "estudar"
    assert db.complete_task(task_id)
    assert db.list_tasks() == []
    assert db.one("SELECT status FROM tasks WHERE id=?", (task_id,))["status"] == "concluida"

    due = time.time() - 10
    db.add_reminder("beber água", due)
    assert db.pending_reminders()
    assert db.due_reminders()


def test_notas_e_objetivos(db):
    note_id = db.add_note("comprar carregador")
    assert db.search_notes("carregador")[0]["id"] == note_id
    goal_id = db.add_goal("aprender inglês")
    db.set_goal_progress(goal_id, 100)
    assert db.one("SELECT status, progress FROM goals WHERE id=?", (goal_id,))["status"] == "concluido"


def test_rotinas(db):
    routine_id = db.upsert_routine("modo estudo", [{"text": "abre o navegador"}])
    assert db.get_routine("modo estudo")["name"] == "modo estudo"
    db.set_routine_enabled("modo estudo", False)
    assert db.get_routine("modo estudo")["enabled"] is False
    db.upsert_routine("modo estudo", [{"text": "abre o navegador"}, {"text": "abre a pasta"}])
    assert len(db.get_routine("modo estudo")["steps"]) == 2
    db.mark_routine_run(routine_id)
    assert db.list_routines()[0]["run_count"] == 1
    assert db.delete_routine("modo estudo")


def test_agendamentos_e_timers(db):
    schedule_id = db.add_schedule("desligar", "system.shutdown", when_at=time.time() - 1)
    assert db.due_schedules()
    db.mark_schedule_run(schedule_id)
    assert db.list_schedules(only_enabled=True) == []

    db.add_timer("pomodoro", time.time() - 1)
    assert db.due_timers()


def test_contagens(db):
    db.add_memory("x")
    db.add_task("y")
    counts = db.counts()
    assert counts["memories"] == 1 and counts["tasks"] == 1
