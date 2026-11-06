"""Conselheiro pessoal: decisões, comparações, planos e revisão de raciocínio."""
from __future__ import annotations

import re

from ..nlu.engine import command
from .base import Context
from .helpers import ok


def _topic(ctx: Context) -> str:
    text = ctx.clean
    text = re.sub(r"(?i)^(?:jarvis[,\s]*)", "", text)
    return text.strip(" ?.!,")


@command("advice.decide",
         must=[["opiniao"]],
         extra_patterns=[
             {"must": [["pensando"], ["comprar", "mudar", "fazer", "escolher"]]},
             {"must": [["vale"], ["pena"]]},
             {"must": [["devo", "deveria"]], "optional": [["comprar", "aceitar", "mudar"]]},
         ],
         optional=[["comprar", "decisao", "sobre", "voce"]],
         category="conselheiro",
         description="Estrutura uma decisão em critérios e riscos",
         examples=["Jarvis, estou pensando em comprar um computador novo. O que acha?",
                   "Vale a pena trocar de emprego?"],
         priority=4)
def decide(ctx: Context):
    advice = ctx.advisor.decide(_topic(ctx))
    ctx.db.add_conversation("assistant_advice", advice.text, intent=ctx.intent)
    return ok(ctx, advice.text, criteria=advice.criteria, questions=advice.questions)


@command("advice.compare",
         must=[["comparar"]],
         extra_patterns=[{"must": [["qual"], ["melhor"]]},
                         {"must": [["diferenca"], ["entre"]]}],
         optional=[["melhor", "entre", "alternativas"]],
         category="conselheiro",
         description="Compara alternativas por critérios explícitos",
         examples=["Qual é melhor, notebook ou desktop?", "Compare aluguel e financiamento"],
         priority=4)
def compare(ctx: Context):
    advice = ctx.advisor.compare(_topic(ctx))
    return ok(ctx, advice.text, criteria=advice.criteria, questions=advice.questions)


@command("advice.plan",
         must=[["planejar"]],
         extra_patterns=[{"must": [["passo"], ["passo"]]}],
         optional=[["objetivo", "como", "meu"]],
         category="conselheiro",
         description="Divide um objetivo em próximos passos",
         examples=["Me ajude a planejar meus estudos", "Quero um passo a passo para emagrecer"],
         priority=7)
def plan(ctx: Context):
    advice = ctx.advisor.plan(_topic(ctx))
    return ok(ctx, advice.text, questions=advice.questions, actions=advice.actions)


@command("advice.check",
         must=[["certo", "correto", "concorda"]],
         extra_patterns=[{"must": [["analisar"], ["raciocinio"]]},
                         {"must": [["estou"], ["errado"]]}],
         optional=[["estou", "acho", "faz", "sentido", "voce"]],
         category="conselheiro",
         description="Revisa o raciocínio do usuário e aponta riscos",
         examples=["Jarvis, eu acho que estou certo. Concorda?"],
         priority=4)
def check(ctx: Context):
    advice = ctx.advisor.check_reasoning(ctx.clean)
    return ok(ctx, advice.text, questions=advice.questions)


@command("advice.explain",
         must=[["explicar"]],
         extra_patterns=[{"must": [["como"], ["funciona"]]}],
         optional=[["como", "funciona", "sobre", "me"]],
         category="conselheiro",
         description="Explica um assunto com base no que está registrado localmente",
         examples=["Explique como funciona a memória local"],
         priority=3)
def explain(ctx: Context):
    topic = _topic(ctx)
    topic = re.sub(r"(?i)^(?:explique|explica|explicar|me ensina|como funciona)\s*", "", topic).strip()
    if not topic:
        return ok(ctx, "O que devo explicar?")
    advice = ctx.advisor.explain(topic)
    return ok(ctx, advice.text)


@command("advice.reflect",
         must=[["desabafar", "conversar"]],
         extra_patterns=[{"must": [["preciso"], ["conversar"]]},
                         {"must": [["preciso"], ["desabafar"]]}],
         optional=[["sobre", "com", "voce"]],
         category="conselheiro",
         description="Conversa de apoio e escuta ativa",
         examples=["Preciso conversar sobre um problema", "Estou desabafando"],
         priority=3)
def reflect(ctx: Context):
    advice = ctx.advisor.reflect(ctx.clean)
    return ok(ctx, advice.text)


@command("advice.opinion_open",
         must=[["opinar"]],
         category="conselheiro",
         description="Opinião fundamentada dentro dos limites locais",
         examples=["Jarvis, o que você acha disso?"],
         priority=2)
def opinion(ctx: Context):
    text = ctx.clean.lower()
    if len(text.split()) <= 5:
        return ok(ctx, "Preciso de mais contexto para opinar com honestidade. "
                       "Me conte a situação, as alternativas que você considera e o que valoriza mais. "
                       "Posso estruturar isso em critérios.")
    advice = ctx.advisor.decide(ctx.clean)
    return ok(ctx, advice.text, criteria=advice.criteria, questions=advice.questions)
