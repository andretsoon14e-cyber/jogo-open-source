"""Organização pessoal: tarefas, lembretes, notas, objetivos, agenda e timers."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from ..nlu import extract
from ..nlu.engine import command
from .base import Context
from .helpers import ask_confirmation, format_when, human_list, ok


def _clean_title(text: str) -> str:
    text = re.sub(r"(?i)^(?:jarvis[,\s]*)", "", text)
    text = re.sub(r"(?i)\b(por favor|pra mim|para mim|agora)\b", "", text)
    return " ".join(text.split()).strip(" .,!?")


ARTICLES = r"(?:o|a|os|as|um|uma|uns|umas|de|do|da|dos|das|para|pra|com|meu|minha)"
TRAILING = r"(?:de|do|da|dos|das|em|no|na|nos|nas|para|pra|com|e|a|o|as|os)"


def _tidy_title(text: str | None) -> str:
    """Remove artigos iniciais e preposições soltas no fim do título."""
    if not text:
        return ""
    text = _clean_title(text)
    text = re.sub(rf"^(?:{ARTICLES})\s+", "", text, flags=re.I)
    previous = None
    while previous != text:
        previous = text
        text = re.sub(rf"\s+{TRAILING}$", "", text, flags=re.I).strip(" .,-")
    return text


def _title_after(text: str, markers: list[str]) -> str:
    pattern = r"(?i)(?:" + "|".join(re.escape(m) for m in markers) + r")\s+(.+)"
    match = re.search(pattern, text)
    if not match:
        return ""
    return match.group(1).strip()


def _strip_time_expression(title: str) -> str:
    patterns = [
        r"(?i)\b(?:hoje|amanhã|amanha|depois de amanhã)\b",
        r"(?i)\b(?:às|as|pelas?)\s+\d{1,2}(?::\d{2})?(?:\s*(?:horas?|h))?\b",
        r"(?i)\bdaqui a\s+\d+\s*(?:minutos?|horars?|horas?|h|segundos?)\b",
        r"(?i)\b(?:em|dentro de)\s+\d+\s*(?:minutos?|horas?)\b",
        r"(?i)\b(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?\b",
    ]
    for pattern in patterns:
        title = re.sub(pattern, "", title)
    return " ".join(title.split()).strip(" .,-")


# --------------------------------------------------------------------- tarefas
@command("task.add",
         must=[["tarefa", "lembrar"], ["criar", "adicionar", "marcar", "novo", "nova", "agendar"]],
         optional=[["para", "de", "minha", "lista"]],
         extract_names=["when"],
         category="organizacao",
         description="Cria tarefa ou lembrete com data opcional",
         examples=["Crie um lembrete para estudar às 19 horas", "Adicionar tarefa: pagar a conta"],
         priority=3)
def add_task(ctx: Context):
    title = _title_after(ctx.text, ["tarefa", "lembrete", "lembrar", "adicionar", "criar", "novo", "nova",
                                    "para", "de", "que"])
    title = _strip_time_expression(_clean_title(title))
    when = ctx.slots.get("when") or extract.parse_when(ctx.text)
    if not title:
        return ok(ctx, "O que devo registrar? Exemplo: “crie um lembrete para estudar às 19 horas”.")
    is_task = "tarefa" in ctx.norm and "lembrete" not in ctx.norm and "lembrar" not in ctx.norm
    if when and is_task:
        task_id = ctx.db.add_task(title, due_at=when.timestamp())
        ctx.assistant.audit.record("task.add", f"{title} @ {when}", level=1)
        return ok(ctx, f"Tarefa “{title}” agendada para {format_when(when.timestamp())}.",
                  task_id=task_id, due_at=when.timestamp())
    if when:
        reminder_id = ctx.db.add_reminder(title, when.timestamp())
        ctx.assistant.audit.record("reminder.add", f"{title} @ {when}", level=1)
        return ok(ctx, f"Lembrete criado: “{title}” para {format_when(when.timestamp())}. "
                       "Vou avisar na hora.", reminder_id=reminder_id, when=when.timestamp())
    task_id = ctx.db.add_task(title)
    ctx.assistant.audit.record("task.add", title, level=1)
    return ok(ctx, f"Tarefa registrada: “{title}”, sem data definida. "
                   "Posso agendar um horário, se quiser.", task_id=task_id)


@command("task.add_remember",
         must=[["lembrar"], ["de", "que"]],
         optional=[["mim", "favor"]],
         extract_names=["when"],
         category="organizacao",
         description="Cria lembrete a partir de “me lembre de…”",
         examples=["Jarvis, me lembre de estudar amanhã"],
         priority=4)
def remember_task(ctx: Context):
    title = _title_after(ctx.text, ["me lembre de", "me lembra de", "me lembrar de", "lembre-me de",
                                    "lembre de", "lembrar de"])
    when = extract.parse_when(ctx.text)
    if not title:
        return ok(ctx, "Do que devo lembrá-lo?")
    clean_title = _strip_time_expression(_clean_title(title)) or title
    if when:
        reminder_id = ctx.db.add_reminder(clean_title, when.timestamp())
        return ok(ctx, f"Combinado: vou lembrá-lo de “{clean_title}” {format_when(when.timestamp())}.",
                  reminder_id=reminder_id, when=when.timestamp())
    task_id = ctx.db.add_task(clean_title)
    return ok(ctx, f"Anotado: “{clean_title}”. Como não informou horário, ficou como tarefa pendente. "
                   "Se quiser, posso agendar para amanhã.", task_id=task_id)


@command("task.list",
         must=[["tarefa"]],
         extra_patterns=[
             {"must": [["tenho"], ["fazer"]]},
             {"must": [["o"], ["que"], ["tenho"]]},
             {"must": [["pendente", "pendentes"]]},
             {"must": [["minhas"], ["tarefa"]]},
             {"must": [["quais"], ["tarefa"]]},
         ],
         optional=[["quais", "minhas", "pendentes", "hoje", "amanha", "tenho"]],
         category="organizacao",
         description="Lista tarefas pendentes",
         examples=["Quais são minhas tarefas?", "O que tenho para fazer hoje?"],
         priority=3)
def list_tasks(ctx: Context):
    day = None
    if "hoje" in ctx.norm:
        day = datetime.now()
    elif "amanha" in ctx.norm:
        day = datetime.now() + timedelta(days=1)
    tasks = ctx.db.list_tasks(status="pendente", day=day)
    reminders = [r for r in ctx.db.pending_reminders()
                 if day is None or datetime.fromtimestamp(r["due_at"]).date() == day.date()]
    if not tasks and not reminders:
        scope = "para hoje" if day and day.date() == datetime.now().date() else (
            "para amanhã" if day else "")
        return ok(ctx, f"Não há tarefas pendentes {scope}.".strip())
    lines = [f"{task['title']}"
             + (f" ({format_when(task['due_at'])})" if task["due_at"] else "")
             for task in tasks[:10]]
    lines += [f"lembrete: {r['message']} ({format_when(r['due_at'])})" for r in reminders[:10]]
    text = f"Você tem {len(tasks) + len(reminders)} pendência(s): {human_list(lines, 8)}."
    return ok(ctx, text, tasks=tasks, reminders=reminders)


@command("task.done",
         must=[["concluir", "concluida", "terminei", "finalizar"], ["tarefa"]],
         extra_patterns=[{"must": [["terminei"], ["tarefa"]]},
                         {"must": [["concluir"], ["tarefa"]]}],
         optional=[["marcar", "como", "ja"]],
         category="organizacao",
         description="Marca tarefa como concluída",
         examples=["Marca a tarefa estudar como concluída", "Terminei a tarefa de revisar o código"],
         priority=4)
def complete_task(ctx: Context):
    term = _title_after(ctx.text, ["tarefa", "concluir", "concluída", "concluida", "terminei",
                                   "finalizar", "como"])
    term = re.sub(r"(?i)\b(como|concluída|concluida|de|a|o|foi|está|esta)\b", "", term).strip()
    if not term:
        return ok(ctx, "Qual tarefa devo marcar como concluída?")
    task = ctx.db.complete_task_by_title(term)
    if not task:
        return ok(ctx, f"Não encontrei uma tarefa pendente parecida com “{term}”.")
    ctx.assistant.audit.record("task.done", task["title"], level=1)
    return ok(ctx, f"Concluída: “{task['title']}”. Bom trabalho.", task_id=task["id"])


# ---------------------------------------------------------------------- notas
@command("note.add",
         must=[["anotar"], ["que"]],
         extra_patterns=[{"must": [["anotar"], ["isso", "isto", "aqui", "uma", "um"]]},
                         {"must": [["anotar"], ["anotacao"]], "optional": [["nova"]]}],
         optional=[["que", "isto", "isso", "aqui"]],
         category="organizacao",
         description="Cria uma anotação",
         examples=["Jarvis, anote que preciso comprar um carregador"],
         priority=4)
def add_note(ctx: Context):
    body = _title_after(ctx.text, ["anote isso:", "anota isso:", "anote isso", "anota isso",
                                   "anote isto", "anota isto", "anote que", "anota que",
                                   "anotar que", "anote", "anota"])
    if not body:
        return ok(ctx, "O que devo anotar?")
    body = _tidy_title(body.strip(" .,!?\"'")) or body.strip(" .,!?\"'")
    note_id = ctx.db.add_note(body)
    ctx.assistant.audit.record("note.add", body, level=1)
    return ok(ctx, f"Anotado: “{body}”. Está na sua lista de anotações.", note_id=note_id)


@command("note.list",
         must=[["mostrar", "listar", "ver", "quais", "minhas"], ["anotacao", "nota"]],
         category="organizacao",
         description="Lista anotações",
         examples=["Mostre minhas anotações"],
         priority=3)
def list_notes(ctx: Context):
    notes = ctx.db.list_notes(limit=10)
    if not notes:
        return ok(ctx, "Você ainda não tem anotações.")
    values = [note["body"][:80] for note in notes]
    return ok(ctx, f"Suas últimas anotações: {human_list(values, 5)}.", notes=notes)


# ------------------------------------------------------------------ objetivos
@command("goal.add",
         must=[["objetivo"], ["criar", "novo", "nova", "adicionar", "quero", "definir"]],
         optional=[["meu", "minha", "de"]],
         category="organizacao",
         description="Cria um objetivo",
         examples=["Crie um objetivo de aprender inglês", "Quero definir um objetivo: correr 5 km"],
         priority=4)
def add_goal(ctx: Context):
    title = _title_after(ctx.text, ["objetivo de", "objetivo:", "objetivo", "meta de", "meta"])
    title = _strip_time_expression(_clean_title(title))
    if not title:
        return ok(ctx, "Qual objetivo devo registrar?")
    goal_id = ctx.db.add_goal(title)
    ctx.assistant.audit.record("goal.add", title, level=1)
    advice = ctx.advisor.plan(title)
    return ok(ctx, f"Objetivo criado: “{title}”. {advice.text}", goal_id=goal_id)


@command("goal.progress",
         must=[["objetivo"], ["progresso", "porcentagem", "atualizar"]],
         extract_names=["number"],
         category="organizacao",
         description="Atualiza o progresso de um objetivo",
         examples=["Atualize o progresso do objetivo estudar para 50%"])
def update_goal(ctx: Context):
    goals = ctx.db.list_goals(status="ativo")
    if not goals:
        return ok(ctx, "Você não tem objetivos ativos.")
    number = ctx.slots.get("number")
    match = re.search(r"(?i)objetivo\s+(?:de\s+)?(.+?)\s+(?:para|em)\s+(\d{1,3})", ctx.text)
    term = match.group(1).strip() if match else ctx.residual()
    percent = int(match.group(2)) if match else number
    if percent is None:
        return ok(ctx, "Qual é a porcentagem atual? Exemplo: “objetivo estudar para 50%”.")
    target = next((g for g in goals if term and term.lower() in g["title"].lower()), goals[0])
    ctx.db.set_goal_progress(target["id"], percent)
    ctx.assistant.audit.record("goal.progress", f"{target['title']} -> {percent}%", level=1)
    return ok(ctx, f"Progresso de “{target['title']}” atualizado para {percent}%.",
              goal_id=target["id"], progress=percent)


@command("goal.list",
         must=[["objetivo"], ["meus", "quais", "listar"]],
         category="organizacao",
         description="Lista objetivos e progresso",
         examples=["Quais são meus objetivos?"],
         priority=4)
def list_goals(ctx: Context):
    goals = ctx.db.list_goals(status=None)
    if not goals:
        return ok(ctx, "Nenhum objetivo registrado ainda.")
    lines = [f"{goal['title']} ({goal['progress']}%)" for goal in goals[:8]]
    return ok(ctx, f"Seus objetivos: {human_list(lines, 6)}.", goals=goals)


# --------------------------------------------------------------------- agenda
@command("agenda.show",
         must=[["agenda"]],
         extra_patterns=[{"must": [["compromisso"]]}],
         optional=[["hoje", "amanha", "minha", "semana"]],
         category="organizacao",
         description="Mostra a agenda do dia",
         examples=["Qual é minha agenda de amanhã?"],
         priority=2)
def agenda(ctx: Context):
    day = datetime.now() + timedelta(days=1) if "amanha" in ctx.norm else datetime.now()
    tasks = ctx.db.list_tasks(status="pendente", day=day)
    reminders = [r for r in ctx.db.pending_reminders()
                 if datetime.fromtimestamp(r["due_at"]).date() == day.date()]
    label = "amanhã" if day.date() != datetime.now().date() else "hoje"
    if not tasks and not reminders:
        return ok(ctx, f"Sua agenda de {label} está livre.")
    items = [f"{datetime.fromtimestamp(r['due_at']):%H:%M} — {r['message']}" for r in reminders]
    items += [f"{datetime.fromtimestamp(t['due_at']):%H:%M} — {t['title']}"
              for t in tasks if t["due_at"]]
    items += [t["title"] for t in tasks if not t["due_at"]]
    if not items:
        return ok(ctx, f"Sua agenda de {label} está livre.")
    return ok(ctx, f"Agenda de {label}: " + "; ".join(items[:10]) + ".", tasks=tasks,
              reminders=reminders)


# --------------------------------------------------------------------- timers
@command("timer.set",
         must=[["minutos", "tempo", "segundos"], ["avise", "avisar", "timer", "temporizador",
                                                 "lembrar", "marcar", "contar", "colocar"]],
         extra_patterns=[{"must": [["timer", "temporizador"]], "optional": [["de", "por"]]}],
         extract_names=["duration"],
         category="organizacao",
         description="Cria uma contagem regressiva com aviso",
         examples=["Jarvis, me avise em 10 minutos", "Timer de 30 minutos"],
         priority=4)
def set_timer(ctx: Context):
    duration = extract.parse_duration(ctx.text)
    if not duration:
        return ok(ctx, "Por quanto tempo? Exemplo: “me avise em 10 minutos”.")
    fire_at = (datetime.now() + timedelta(seconds=duration)).timestamp()
    label = _strip_time_expression(_clean_title(ctx.clean)) or "temporizador"
    timer_id = ctx.db.add_timer(label, fire_at)
    minutes = duration // 60 if duration >= 60 else 0
    human = f"{minutes} minuto(s)" if minutes else f"{duration} segundo(s)"
    ctx.assistant.audit.record("timer.add", f"{label} @ {human}", level=1)
    return ok(ctx, f"Temporizador de {human} iniciado. Aviso {format_when(fire_at)}.",
              timer_id=timer_id, fire_at=fire_at)


@command("reminder.list",
         must=[["lembrar"], ["meus", "quais", "listar", "tenho"]],
         category="organizacao",
         description="Lista lembretes pendentes",
         examples=["Quais são meus lembretes?"],
         priority=3)
def list_reminders(ctx: Context):
    reminders = ctx.db.pending_reminders()
    if not reminders:
        return ok(ctx, "Nenhum lembrete pendente.")
    lines = [f"{r['message']} ({format_when(r['due_at'])})" for r in reminders[:8]]
    return ok(ctx, f"Seus lembretes: {human_list(lines, 6)}.", reminders=reminders)


# ------------------------------------------------------- compromissos
@command("appointment.add",
         must=[["marcar", "marca", "agendar", "agenda", "criar", "anotar"],
               ["consulta", "compromisso", "reuniao"]],
         extra_patterns=[{"must": [["consulta"], ["dentista", "medico", "medica"]]}],
         category="organizacao",
         description="Registra um compromisso na agenda",
         examples=["Marca uma consulta com o dentista na sexta às 15h"],
         priority=4)
def add_appointment(ctx: Context):
    title = _title_after(ctx.text, ["consulta com", "consulta", "compromisso com", "compromisso",
                                    "reuniao com", "reuniao", "dentista"]) or ""
    due = extract.parse_when(ctx.clean)
    title = _strip_time_expression(_tidy_title(title)) if title else ""
    title = _tidy_title(title) or "compromisso"
    prefixo = "consulta" if "consulta" in ctx.norm else (
        "reunião" if "reuniao" in ctx.norm else "compromisso")
    if not title.lower().startswith(prefixo[:5]):
        title = f"{prefixo} com {title}"
    task_id = ctx.db.add_task(title, due_at=due.timestamp() if due else None, priority=1)
    ctx.assistant.audit.record("appointment.add", title, level=1)
    if due:
        return ok(ctx, f"Agendado: {title}, {format_when(due.timestamp())}. "
                       "Vou lembrá-lo na agenda.", task_id=task_id, due_at=due.timestamp())
    return ok(ctx, f"Anotei “{title}” na agenda, sem horário definido. "
                   "Diga “me lembra de … às 15 horas” para eu avisá-lo na hora.",
              task_id=task_id)


# ------------------------------------------------------- log e configurações
@command("audit.recent",
         must=[["ultimas"], ["acoes"]],
         extra_patterns=[{"must": [["registrou"]]},
                         {"must": [["historico"], ["acoes"]]},
                         {"must": [["registrar"], ["acoes"]]},
                         {"must": [["o"], ["que"], ["fez"]]}],
         category="privacidade",
         description="Mostra as últimas ações registradas no log local",
         examples=["O que você registrou nas últimas ações?"],
         priority=5)
def recent_audit(ctx: Context):
    rows = ctx.db.list_audit(limit=8)
    if not rows:
        return ok(ctx, "Ainda não há ações registradas no log local.", entries=[])
    linhas = []
    for row in rows:
        quando = datetime.fromtimestamp(row["ts"]).strftime("%H:%M")
        linhas.append(f"{quando} — {row['action']}: {row['detail'] or 'sem detalhe'} "
                      f"({row['result']})")
    return ok(ctx, "Últimas ações registradas neste computador:\n" + "\n".join(linhas),
              entries=rows)


@command("settings.show",
         must=[["configuracoes"]],
         extra_patterns=[{"must": [["ajustes"]]},
                         {"must": [["como"], ["configurado"]]}],
         category="privacidade",
         description="Resume as configurações de privacidade e segurança ativas",
         examples=["Quais são as configurações de segurança?"],
         priority=4)
def show_settings(ctx: Context):
    level = ctx.config.get("security.confirm_level", 2)
    mic = ctx.config.get("voice.microphone_enabled", True)
    wake = (ctx.config.get("voice.wake_word.enabled", True))
    llm = ctx.config.get("llm.enabled", False)
    tts = ctx.config.get("voice.tts.engine", "auto")
    rotulo_voz = {"disabled": "desativada", "auto": "automática (motor local disponível)",
                  "browser": "vozes locais do navegador"}.get(tts, str(tts))
    linhas = [
        f"Confirmação: nível {level} de 3.",
        f"Microfone: {'ativado' if mic else 'desativado'}; palavra de ativação: "
        f"{'ativa' if wake else 'inativa'}.",
        f"Voz: {rotulo_voz}.",
        "Modelo de linguagem local: " + ("ativado por sua escolha." if llm
                                         else "desligado — nenhuma conversa sai deste computador."),
        "Nenhuma informação é enviada para a internet.",
    ]
    return ok(ctx, " ".join(linhas), confirm_level=level, microphone_enabled=bool(mic),
              llm_enabled=bool(llm))


@command("settings.data_location",
         must=[["onde"], ["dados"]],
         extra_patterns=[{"must": [["onde"], ["salvos", "guardados"]]},
                         {"must": [["onde"], ["arquivos"]]}],
         category="privacidade",
         description="Mostra onde ficam os dados locais",
         examples=["Onde ficam meus dados?"],
         priority=4)
def data_location(ctx: Context):
    base = ctx.db.path.parent
    return ok(ctx, f"Tudo fica em {base}: banco {ctx.db.path.name} com memória, tarefas e notas; "
                   f"logs em {base / 'logs'}. Nada é enviado para fora.",
              data_dir=str(base), db=str(ctx.db.path))


@command("history.clear",
         must=[["excluir", "apagar", "limpar"], ["historico", "conversas"]],
         level=2,
         category="privacidade",
         gate=False,
         description="Apaga o histórico de conversas (mantém a memória de longo prazo)",
         examples=["Apaga o histórico de conversas"],
         priority=6)
def clear_history(ctx: Context):
    from ..core.response import Response

    total = ctx.db.one("SELECT COUNT(*) AS c FROM conversations")["c"]
    if not total:
        return ok(ctx, "O histórico de conversas já está vazio.")
    if ctx.dry_run:
        return Response(reply=f"Vou apagar {total} mensagem(ns) do histórico.", intent=ctx.intent,
                        source=ctx.source)

    def run():
        ctx.db.execute("DELETE FROM conversations")
        ctx.assistant.audit.record("history.clear", f"{total} mensagens", level=2, confirmed=True)
        return ok(ctx, f"Histórico apagado ({total} mensagens). A memória de longo prazo continua intacta.",
                  removed=total)

    return ask_confirmation(ctx, f"apagar o histórico de conversas ({total} mensagens)", 2, run)
