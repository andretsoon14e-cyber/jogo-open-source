"""Conversa: identidade, ajuda, hora, data, saudações e limites honestos."""
from __future__ import annotations

import random
import re
from datetime import datetime

from .. import __version__
from ..nlu.engine import command, engine
from .base import Context
from .helpers import human_list, ok

WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
            "sexta-feira", "sábado", "domingo"]
MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
          "setembro", "outubro", "novembro", "dezembro"]


@command("conversation.greeting",
         must=[["ola", "oi", "eai", "bom dia", "boa tarde", "boa noite", "opa"]],
         extra_patterns=[{"must": [["voce"], ["ai"]]}],
         optional=[["tudo bem", "como vai", "tudo certo", "jarvis"]],
         category="conversa",
         description="Cumprimenta o assistente",
         examples=["Oi, Jarvis", "Bom dia"],
         priority=4)
def greet(ctx: Context):
    return ok(ctx, ctx.personality.greeting())


@command("conversation.identity",
         must=[["quem"], ["voce"]],
         extra_patterns=[{"must": [["seu", "qual"], ["nome"]]},
                         {"must": [["o"], ["que"], ["voce"], ["e"]]}],
         optional=[["afinal", "exatamente"]],
         category="conversa",
         description="Explica quem é o assistente",
         examples=["Quem é você?", "Qual é o seu nome?"],
         priority=3)
def identity(ctx: Context):
    text = (
        f"Sou o {ctx.config.get('assistant.name', 'J.A.R.V.I.S.')}, versão {__version__} — "
        "um assistente pessoal que roda inteiramente na sua máquina. "
        "Não uso nenhuma inteligência artificial na nuvem: interpretação de comandos por regras, "
        "voz e memória locais, e um banco de dados SQLite no seu disco. "
        "Posso abrir programas, cuidar de arquivos, registrar lembretes e tarefas, organizar rotinas, "
        "monitorar o computador e ajudar a estruturar decisões. "
        "Quando não sei algo, digo que não sei — não faz parte do meu funcionamento inventar."
    )
    return ok(ctx, text, version=__version__, offline=True)


@command("meta.help",
         must=[["ajuda", "comandos", "capacidades", "funcoes"]],
         extra_patterns=[{"must": [["ajudar"]], "optional": [["mim"]]},
                         {"must": [["o"], ["que"], ["voce"], ["pode"], ["criar"]]}],
         category="conversa",
         description="Lista o que o assistente sabe fazer",
         examples=["Jarvis, ajuda", "O que você pode fazer?"],
         priority=5)
def help_command(ctx: Context):
    groups: dict[str, list[str]] = {}
    labels = {
        "conversa": "Conversa e informação",
        "sistema": "Computador",
        "aplicativos": "Programas e janelas",
        "arquivos": "Arquivos",
        "memoria": "Memória",
        "organizacao": "Organização pessoal",
        "automacao": "Automações e rotinas",
        "conselheiro": "Conselheiro pessoal",
        "voz": "Voz",
        "configuracao": "Configurações",
    }
    for item in engine.describe():
        category = item["category"]
        if not item["examples"]:
            continue
        groups.setdefault(category, []).append(item["examples"][0])
    blocks = []
    for category, examples in groups.items():
        blocks.append(f"{labels.get(category, category)}: " + "; ".join(f"“{e}”" for e in examples[:4]))
    text = ("Estas são as áreas em que posso agir de verdade, com exemplos falados. "
            + " ".join(blocks) +
            " Também entendo variações informais dessas frases. Para o que não estiver aqui, "
            "posso ao menos registrar como objetivo de melhoria.")
    return ok(ctx, text, groups=groups)


@command("conversation.time",
         must=[["que"], ["horas"]],
         extra_patterns=[{"must": [["horario"]]}, {"must": [["horas"], ["agora"]]}],
         category="conversa",
         description="Informa a hora atual",
         examples=["Que horas são?", "Qual é o horário agora?"],
         priority=3)
def time_now(ctx: Context):
    now = datetime.now()
    return ok(ctx, f"São {now:%H:%M} agora, {ctx.personality.title() or 'senhor'}.",
              time=now.strftime("%H:%M"))


@command("conversation.date",
         must=[["que"], ["dia"], ["hoje"]],
         extra_patterns=[{"must": [["data"]], "optional": [["hoje"]]},
                         {"must": [["dia"], ["hoje"]]}],
         category="conversa",
         description="Informa a data de hoje",
         examples=["Que dia é hoje?", "Qual é a data de hoje?"],
         priority=3)
def date_today(ctx: Context):
    now = datetime.now()
    text = f"Hoje é {WEEKDAYS[now.weekday()]}, {now.day} de {MONTHS[now.month - 1]} de {now.year}."
    return ok(ctx, text, date=now.strftime("%Y-%m-%d"))


@command("conversation.thanks",
         must=[["agradecer"]],
         category="conversa",
         description="Responde a agradecimentos",
         examples=["Obrigado, Jarvis"])
def thanks(ctx: Context):
    return ok(ctx, ctx.personality.thanks_reply())


@command("conversation.farewell",
         must=[["tchau"]],
         category="conversa",
         description="Despedida",
         examples=["Até logo, Jarvis"])
def farewell(ctx: Context):
    return ok(ctx, ctx.personality.farewell())


@command("conversation.how_are_you",
         must=[["como"], ["voce"], ["esta"]],
         extra_patterns=[{"must": [["como"], ["vai"]], "optional": [["voce"]]},
                         {"must": [["tudo"], ["bem"]], "optional": [["voce"]]}],
         category="conversa",
         description="Conversa casual sobre o estado do assistente",
         examples=["Como você está?", "Tudo bem com você?"],
         priority=2)
def how_are_you(ctx: Context):
    text = ("Operando normalmente: todos os módulos locais ativos, sem uso de serviços externos. "
            "Obrigado por perguntar. E o senhor, como está?")
    if ctx.personality.humor > 0.5:
        text += " " + ctx.personality.humor_line()
    return ok(ctx, text)


@command("conversation.fun_fact",
         must=[["curiosidade"]],
         extra_patterns=[{"must": [["fato"], ["interessante"]]},
                         {"must": [["me"], ["conte"], ["algo"]]}],
         category="conversa",
         description="Conta uma curiosidade científica verificável",
         examples=["Me diga uma curiosidade"],
         priority=4)
def fun_fact(ctx: Context):
    import random as _random

    facts = [
        "Um dia em Vênus dura mais que um ano venusiano: 243 dias terrestres para girar "
        "sobre o próprio eixo contra 225 para completar a órbita.",
        "A luz do Sol leva cerca de 8 minutos e 20 segundos para chegar até aqui.",
        "O corpo humano tem cerca de 37 trilhões de células, e as bactérias que vivem em nós "
        "são quase tão numerosas quanto elas.",
        "A Voyager 1, lançada em 1977, é o objeto humano mais distante e continua enviando dados.",
        "Um raio pode aquecer o ar ao redor a cerca de 30 mil graus Celsius em frações de segundo.",
        "A molécula de água é uma das poucas substâncias que se expande ao congelar — por isso o "
        "gelo flutua.",
    ]
    return ok(ctx, _random.choice(facts))


@command("conversation.joke",
         must=[["piada"]],
         category="conversa",
         description="Conta uma piada leve",
         examples=["Jarvis, conta uma piada"])
def joke(ctx: Context):
    jokes = [
        "Um programador foi ao mercado e pediu: “um pão”. O atendente perguntou: “quer que eu corte?”. "
        "Ele respondeu: “não, obrigado, eu ainda vou usá-lo inteiro”.",
        "Meu código nunca tem bugs — tem funcionalidades com personalidade própria.",
        "O Wi-Fi caiu aqui. Tecnicamente, o senhor agora tem uma máquina mais focada.",
        "Por que o processador nunca reclama? Porque ele já está acostumado a levar tudo em ciclos.",
    ]
    return ok(ctx, random.choice(jokes))


@command("conversation.weather",
         must=[["previsao"]],
         extra_patterns=[{"must": [["como"], ["esta"], ["tempo"]]},
                         {"must": [["tempo"]], "optional": [["hoje", "amanha", "agora", "fora"]]},
                         {"must": [["vai"], ["chover"]]},
                         {"must": [["clima"]], "optional": [["hoje", "amanha"]]},
                         {"must": [["temperatura"], ["ambiente"]]}],
         optional=[["hoje", "amanha", "agora"]],
         category="conversa",
         description="Explica a limitação de previsão do tempo offline",
         examples=["Jarvis, vai chover hoje?", "Como está o clima?"])
def weather(ctx: Context):
    text = ("Não tenho acesso a serviços de meteorologia — e, como a regra do projeto é não "
            "consultar serviços externos, não vou chutar a previsão. O que posso fazer: consultar "
            "a temperatura dos sensores internos do computador, se o senhor quiser. "
            "Para previsão do tempo real, seria necessário um serviço externo ou uma estação local.")
    return ok(ctx, text)


@command("conversation.set_name",
         must=[["meu"], ["nome"]],
         extra_patterns=[{"must": [["me"], ["chame", "chamar", "chamo"]]}],
         category="conversa",
         description="Registra como o usuário quer ser chamado",
         examples=["Meu nome é Tony", "Pode me chamar de Stark"],
         priority=4)
def set_name(ctx: Context):
    match = re.search(r"(?i)(?:meu nome (?:e|é)|me chame de|pode me chamar de|me chama de)\s+([\wÀ-ÿ ]{2,40})",
                      ctx.text)
    if not match:
        return ok(ctx, "Não consegui identificar o nome. Pode dizer algo como “meu nome é Tony”?")
    name = match.group(1).strip().split(" e ")[0][:40]
    ctx.personality.set_user_name(name)
    ctx.db.add_memory(f"Prefere ser chamado de {name}", key="nome", category="preferencia")
    return ok(ctx, f"Registrado, {name}. Vou tratá-lo assim a partir de agora.", name=name)


@command("conversation.local_model",
         must=[["modelo"], ["local", "llm", "linguagem", "habilitar", "instalar"]],
         category="conversa",
         description="Explica como habilitar um modelo de linguagem local (opt-in)",
         examples=["Quero um modelo local", "Dá para ter conversa aberta offline?"],
         priority=3)
def local_model(ctx: Context):
    available, reason = ctx.advisor.local_model_available()
    text = ctx.advisor.local_model_instructions()
    if available:
        text = f"Situação atual: {reason}. " + text
    else:
        text = f"Situação atual: {reason}. " + text
    return ok(ctx, text, available=available, reason=reason)


@command("conversation.mood",
         must=[["cansado", "ansioso", "triste", "desanimado", "estressado", "feliz"]],
         category="conversa",
         description="Conversa de apoio, com escuta ativa",
         examples=["Jarvis, estou cansado", "Estou ansioso com o trabalho"],
         priority=2)
def mood(ctx: Context):
    advice = ctx.advisor.reflect(ctx.clean)
    return ok(ctx, advice.text)
