"""Automações personalizadas: rotinas criadas por voz e agendamentos."""
from __future__ import annotations

import re

from ..nlu.engine import command
from ..nlu.normalizer import normalize
from .base import Context
from .helpers import human_list, ok

STEP_SEPARATORS = r"\s*(?:,|;|\be\b|\bdepois\b|\bem seguida\b|\bentão\b|\bentao\b)\s*"


def _normalize_step(step: str) -> str:
    step = step.strip(" .")
    step = re.sub(r"(?i)^(?:jarvis[,\s]*)", "", step)
    return step


@command("routine.create",
         must=[["quando"], ["disser", "diga", "falar"]],
         extra_patterns=[{"must": [["rotina"], ["criar", "nova", "crie"]]},
                         {"must": [["rotina"], ["quando"]]}],
         optional=[["criar", "nova", "personalizada", "eu"]],
         category="automacao",
         description="Cria uma rotina a partir de uma frase falada",
         examples=["Quando eu disser modo estudo, abra o navegador e abra a pasta de estudos"],
         priority=8)
def create_routine(ctx: Context):
    text = ctx.text
    match = re.search(r"(?i)(?:quando eu (?:disser|falar|diga)|se eu (?:disser|falar)|ao (?:dizer|falar))"
                      r"\s+[\"“']?([^\"”',]+)[\"”']?\s*[,:]?\s*(.+)", text)
    if not match:
        match = re.search(r"(?i)(?:criar|crie|nova)\s+(?:uma\s+)?rotina\s+(?:chamada\s+)?[\"“']?"
                          r"([^\"”',]+)[\"”']?\s*(?:que|para|:)\s*(.+)", text)
    if not match:
        return ok(ctx, "Para criar uma rotina, use: “quando eu disser modo estudo, abre o navegador "
                       "e abre a pasta de estudos”.")
    name = _normalize_step(match.group(1)).lower()
    steps_text = match.group(2)
    steps = [_normalize_step(step) for step in re.split(STEP_SEPARATORS, steps_text) if step.strip()]
    steps = [step for step in steps if len(step.split()) >= 1]
    if not steps:
        return ok(ctx, "Entendi o nome da rotina, mas não identifiquei as ações. "
                       "Diga, por exemplo: “quando eu disser modo estudo, abre o navegador e "
                       "abre a pasta de documentos”.")

    # valida cada passo contra o interpretador antes de salvar
    valid, invalid = [], []
    for step in steps:
        if ctx.assistant.engine.match(step):
            valid.append(step)
        else:
            invalid.append(step)
    if not valid:
        return ok(ctx, "Não consegui reconhecer nenhuma das ações dessa rotina. "
                       "Tente usar comandos que eu já conheço, como “abre o navegador”.")

    routine_id = ctx.db.upsert_routine(
        name=name,
        steps=[{"text": step} for step in valid],
        description=f"Rotina criada por voz com {len(valid)} passo(s).",
    )
    ctx.assistant.audit.record("routine.create", f"{name}: {valid}", level=1)
    text_reply = (f"Rotina “{name}” registrada com {len(valid)} passo(s): "
                  f"{human_list(valid, 5)}. Para executar, diga “ativar {name}”.")
    if invalid:
        text_reply += f" Não reconheci e deixei de fora: {human_list(invalid, 3)}."
    return ok(ctx, text_reply, routine_id=routine_id, name=name, steps=valid)


@command("routine.run",
         must=[["rotina"]],
         optional=[["ativar", "executar", "rodar", "iniciar"]],
         category="automacao",
         description="Executa uma rotina salva",
         examples=["Ativar rotina modo estudo", "Executar a rotina de trabalho"],
         priority=2)
def run_routine(ctx: Context):
    routines = ctx.db.list_routines(only_enabled=True)
    if not routines:
        return ok(ctx, "Você ainda não tem rotinas. Crie uma dizendo, por exemplo: "
                       "“quando eu disser modo estudo, abre o navegador e abre a pasta de documentos”.")
    term = ctx.residual().replace("rotina", "").strip()
    target = _find_routine(routines, term) or (routines[0] if len(routines) == 1 else None)
    if not target:
        names = [r["name"] for r in routines]
        return ok(ctx, f"Qual rotina devo executar? Tenho: {human_list(names, 6)}.")
    return ctx.assistant.run_routine(target, source=ctx.source)


def _find_routine(routines: list[dict], term: str) -> dict | None:
    if not term:
        return None
    norm_term = normalize(term)
    best, best_score = None, 0.0
    from ..nlu.normalizer import similarity

    for routine in routines:
        candidates = [routine["name"], *(routine.get("triggers") or [])]
        for candidate in candidates:
            norm_candidate = normalize(candidate)
            if not norm_candidate:
                continue
            if norm_candidate in norm_term or norm_term in norm_candidate:
                return routine
            score = similarity(norm_candidate, norm_term)
            if score > best_score and score >= 0.7:
                best, best_score = routine, score
    return best


@command("routine.list",
         must=[["rotina"], ["minhas", "quais", "listar"]],
         category="automacao",
         description="Lista as rotinas cadastradas",
         examples=["Quais rotinas eu tenho?"],
         priority=4)
def list_routines(ctx: Context):
    routines = ctx.db.list_routines()
    if not routines:
        return ok(ctx, "Nenhuma rotina cadastrada.")
    lines = [f"{r['name']} ({len(r['steps'])} passos, {'ativa' if r['enabled'] else 'inativa'})"
             for r in routines]
    return ok(ctx, "Rotinas: " + human_list(lines, 8) + ".", routines=routines)


@command("routine.toggle",
         must=[["desativar", "ativar"], ["rotina"]],
         optional=[["modo"]],
         category="automacao",
         description="Ativa ou desativa uma rotina",
         examples=["Desativa a rotina modo estudo"],
         priority=5)
def toggle_routine(ctx: Context):
    routines = ctx.db.list_routines()
    term = ctx.residual().replace("rotina", "").strip()
    target = _find_routine(routines, term)
    if not target:
        return ok(ctx, "Qual rotina? Diga o nome exatamente como cadastrei.")
    enable = not any(word.startswith(("desativ", "deslig", "parar"))
                     for word in ctx.norm.split())
    ctx.db.set_routine_enabled(target["name"], enable)
    ctx.assistant.audit.record("routine.toggle", f"{target['name']} -> {enable}", level=1)
    return ok(ctx, f"Rotina “{target['name']}” {'ativada' if enable else 'desativada'}.")


@command("routine.delete",
         must=[["rotina"], ["remover", "excluir"]],
         level=3,
         category="automacao",
         description="Remove uma rotina",
         examples=["Apaga a rotina modo estudo"],
         priority=5,
         gate=False)
def delete_routine(ctx: Context):
    routines = ctx.db.list_routines()
    target = _find_routine(routines, ctx.residual().replace("rotina", "").strip())
    if not target:
        return ok(ctx, "Qual rotina devo remover?")
    from .helpers import ask_confirmation
    from ..core.response import Response

    def run():
        ctx.db.delete_routine(target["name"])
        ctx.assistant.audit.record("routine.delete", target["name"], level=3, confirmed=True)
        return ok(ctx, f"Rotina “{target['name']}” removida.")

    if ctx.dry_run:
        return Response(reply=f"Vou remover a rotina {target['name']}.", intent=ctx.intent,
                        source=ctx.source)
    return ask_confirmation(ctx, f"remover a rotina “{target['name']}”", 3, run,
                            preview={"rotina": target["name"], "passos": target["steps"]})


@command("schedule.list",
         must=[["agenda"], ["agendamento", "agenda", "programado"]],
         category="automacao",
         description="Lista agendamentos programados",
         examples=["Quais agendamentos eu tenho?"],
         priority=3)
def list_schedules(ctx: Context):
    from .helpers import format_when

    rows = ctx.db.list_schedules()
    if not rows:
        return ok(ctx, "Nenhum agendamento programado.")
    lines = [f"{row['label']} ({format_when(row['when_at'])}, "
             f"{'ativo' if row['enabled'] else 'concluído'})" for row in rows]
    return ok(ctx, "Agendamentos: " + human_list(lines, 6) + ".", schedules=rows)
