"""Conselheiro pessoal — raciocínio local, transparente e sem IA externa.

O que este módulo faz de verdade:
* estrutura decisões (critérios, alternativas, riscos, custo de oportunidade);
* aponta vícios de raciocínio com perguntas de verificação;
* decompõe objetivos em marcos e próximos passos;
* compara alternativas usando critérios explícitos;
* consulta a memória local (preferências, objetivos) para personalizar;
* admite abertamente quando não tem informação suficiente.

O que ele NÃO faz: responder perguntas enciclopédicas abertas. Para isso existe
um adaptador opcional para modelo de linguagem LOCAL (llama.cpp/Ollama), que só
é usado depois de autorização explícita do usuário.
"""
from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from ..core.config import Config

# Heurísticas por domínio: critérios que costumam importar em cada tipo de decisão.
DOMAIN_HINTS: list[tuple[str, str, list[str]]] = [
    (r"computador|notebook|pc|placa de video|hardware", "compra de computador", [
        "Uso real: quais programas você roda todos os dias?",
        "Folga de desempenho: prefira configuração acima do mínimo — dura mais anos.",
        "Portabilidade vs. potência: notebook leve custa mais por desempenho.",
        "Garantia, assistência técnica e possibilidade de upgrade (RAM/SSD).",
        "Total de custo: periféricos, licenças e energia entram na conta.",
    ]),
    (r"celular|smartphone|iphone|android", "compra de celular", [
        "Vida útil esperada e suporte de atualizações do fabricante.",
        "Bateria e assistência técnica local pesam mais que câmera no dia a dia.",
        "Comparar preço à vista, com troca e com o aparelho atual funcionando.",
    ]),
    (r"carro|moto|veiculo|veículo|automovel", "compra de veículo", [
        "Custo total de propriedade: seguro, IPVA, manutenção, combustível, depreciação.",
        "Quilometragem mensal real define se vale a pena a troca.",
        "Histórico de manutenção e revisão cautelar antes de fechar negócio.",
    ]),
    (r"emprego|trabalho|carreira|demissao|demissão|salario|salário|proposta", "decisão de carreira", [
        "Compare o pacote completo: remuneração, aprendizado, tempo de deslocamento, estabilidade.",
        "Pergunta-chave: em dois anos, essa escolha aumenta ou reduz suas opções?",
        "Risco financeiro: quantos meses de reserva você tem hoje?",
        "Converse com alguém que já viveu essa transição — informação real vale mais que opinião.",
    ]),
    (r"investir|investimento|acao|ação|fundo|tesouro|cripto|bitcoin", "decisão financeira", [
        "Eu não faço recomendações de investimento — e desconfie de quem faz sem conhecer seu perfil.",
        "Organize por objetivo, prazo e tolerância a risco antes de escolher o produto.",
        "Reserva de emergência primeiro; risco depois.",
        "Taxas e impostos corroem retorno: coloque-os na comparação.",
    ]),
    (r"estudar|curso|faculdade|concurso|aprender|ingles|inglês", "decisão de estudo", [
        "Objetivo concreto e prazo definido valem mais que motivação inicial.",
        "Carga semanal realista: quantas horas por semana você consegue manter por 3 meses?",
        "Como você vai medir progresso? Sem medida, o abandono é provável.",
    ]),
    (r"mudar de casa|aluguel|casa|apartamento|imovel|imóvel", "decisão de moradia", [
        "Custo total mensal: aluguel/parcela + condomínio + contas + deslocamento.",
        "Distância do trabalho e rotina real de transporte.",
        "Prazo: quanto tempo pretende ficar? Mudanças frequentes custam caro.",
    ]),
    (r"comprar|gastar|preco|preço|barato|caro", "decisão de compra", [
        "Necessidade x desejo: você usaria isso com que frequência?",
        "Regra do custo por uso: preço dividido pelo número de utilizações previstas.",
        "Espere 24 horas antes de compras impulsivas acima do seu limite habitual.",
    ]),
]


SELF_KNOWLEDGE: list[tuple[str, str]] = [
    ("memoria|memória|lembrar de mim|guarda",
     "Minha memória é um banco SQLite local (data/jarvis.db). Cada informação que você autoriza "
     "é gravada com categoria, origem e data; você pode consultar, editar e apagar na aba Memória. "
     "Nada é sincronizado, copiado ou enviado para fora desta máquina. Detalhe importante: eu não "
     "aprendo sozinho — só guardo o que você pede explicitamente."),
    ("voz|falar|microfone|reconhec",
     "O reconhecimento e a síntese de voz rodam localmente: Vosk (ou whisper.cpp) para entender, "
     "Piper / pyttsx3 / espeak ou as vozes do próprio sistema para falar. O áudio do microfone é "
     "processado no seu computador; em nenhum momento é enviado para servidores. Se nenhum modelo "
     "estiver instalado, eu aviso em vez de fingir que estou ouvindo."),
    ("seguranca|segurança|permiss|confirma|nivel|nível",
     "Trabalho com três níveis: ações simples (abrir programas, consultar dados) são imediatas; "
     "ações que alteram arquivos pedem confirmação com prévia do que será feito; ações críticas "
     "(excluir, desligar, mexer em configurações) exigem confirmação explícita. Tudo o que executo "
     "fica registrado em auditoria local (data/logs/audit.jsonl)."),
    ("arquitetura|como funciona|modulo|módulo|tecnologia",
     "Funciono em módulos independentes: núcleo, interpretação da fala, voz, controle do sistema, "
     "arquivos, memória, organização pessoal, automações, segurança e interface. O que entende as "
     "suas ordens são regras explícitas de português, não IA generativa — por isso sou previsível e "
     "você pode auditar cada ação no log."),
    ("internet|nuvem|privacidade|pesquisa|busca",
     "Pesquiso na internet quando você pede — DuckDuckGo para resultados, Wikipédia para resumos e "
     "Open-Meteo para a previsão do tempo. A sua memória pessoal nunca entra na consulta: só o texto "
     "que você ditou. Fora isso, não há chamadas de fundo nem telemetria."),
    ("inteligencia artificial|ia|modelo|llm",
     "Meu raciocínio é simbólico: regras, sinônimos, extração de datas e durações, e um repertório "
     "de respostas escritas. Executo e organizo com precisão, mas não tenho conhecimento "
     "enciclopédico — quando falta, eu pesquiso na internet ou digo que não sei. Se quiser conversa "
     "aberta, existe a opção de um modelo local rodando na sua máquina."),
]


@dataclass
class Advice:
    text: str
    criteria: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    actions: list[dict] = field(default_factory=list)

    def render(self) -> str:
        return self.text


class Advisor:
    def __init__(self, config: Config, db=None, personality=None) -> None:
        self.config = config
        self.db = db
        self.personality = personality

    # ------------------------------------------------------------- utilidades
    def _title(self) -> str:
        return self.personality.title() if self.personality else "Senhor"

    def _memory_context(self) -> list[dict]:
        if not self.db:
            return []
        try:
            return self.db.list_memories(limit=12)
        except Exception:
            return []

    def _preferences(self) -> list[str]:
        return [row["value"] for row in self._memory_context()
                if row.get("category") in ("preferencia", "preferência")]

    def _domain(self, text: str) -> tuple[str, list[str]]:
        lowered = text.lower()
        for pattern, label, criteria in DOMAIN_HINTS:
            if re.search(rf"\b(?:{pattern})\b", lowered):
                return label, criteria
        return "decisão genérica", [
            "Qual é o resultado esperado e em quanto tempo?",
            "Quais alternativas reais você tem hoje (inclusive não decidir)?",
            "Qual é o pior cenário de cada alternativa e ele é suportável?",
            "O que seria informação suficiente para você decidir com segurança?",
        ]

    # --------------------------------------------------------------- decisões
    def decide(self, question: str) -> Advice:
        label, criteria = self._domain(question)
        prefs = self._preferences()
        lines = [
            f"Vamos analisar isso como {label}. Vou separar o problema em critérios concretos, "
            "porque opinião sem critério não ajuda."
        ]
        lines.append("Critérios que importam:")
        for item in criteria[:5]:
            lines.append(f"• {item}")
        if prefs:
            lines.append("Considerando o que você já me disse:")
            for pref in prefs[:3]:
                lines.append(f"• {pref}")
        lines.append(
            "Riscos clássicos nesse tipo de decisão: decidir por impulso, ignorar custo "
            "recorrente (não só o preço inicial) e superestimar o uso que você fará do item."
        )
        lines.append(
            "Antes de opinar, preciso de três informações suas: qual é o orçamento disponível, "
            "qual é o seu objetivo principal e qual é o prazo."
        )
        return Advice(
            text=" ".join(lines),
            criteria=criteria,
            questions=["Qual é o orçamento disponível?",
                       "Qual é o objetivo principal dessa decisão?",
                       "Qual é o prazo?"],
        )

    def compare(self, subject: str) -> Advice:
        label, criteria = self._domain(subject)
        names = re.split(r"\bou\b|\bversus\b|\bvs\b|\be\b", subject)
        names = [n.strip(" ?.!,") for n in names if n.strip(" ?.!,")]
        alternatives = names[:3] if len(names) >= 2 else []
        text = [
            f"Comparação estruturada ({label})."
        ]
        if alternatives:
            text.append("Alternativas consideradas: " + ", ".join(alternatives) + ".")
        text.append(
            "Vou usar quatro dimensões: custo total, benefício direto para o seu objetivo, "
            "risco/arrependimento e custo de oportunidade."
        )
        text.append("Critérios de avaliação:")
        text += [f"• {item}" for item in criteria[:4]]
        text.append(
            "Para eu comparar de forma útil, me diga em uma frase o que é mais importante para você "
            "nessa escolha — custo, velocidade, durabilidade ou tranquilidade."
        )
        return Advice(text=" ".join(text), criteria=criteria,
                      questions=["O que é mais importante: custo, velocidade, durabilidade ou tranquilidade?"])

    def check_reasoning(self, statement: str) -> Advice:
        ctx = self._memory_context()
        text = [
            "Vou fazer o papel de advogado do diabo — é mais útil que concordar com o senhor. "
            "Perguntas de verificação:"
        ]
        checks = [
            "Que evidência concreta sustenta essa conclusão? Se a evidência for só a sua impressão, o risco existe.",
            "Você procurou ativamente um argumento contrário? (viés de confirmação)",
            "Quanto já foi investido nessa direção? (viés de custo afundado — o passado não deve decidir o futuro)",
            "E se você estivesse completamente errado, quais seriam os sinais disso?",
            "Qual é o custo de adiar essa decisão por 30 dias?",
        ]
        text += [f"• {item}" for item in checks]
        if ctx:
            text.append("Considerei também o que já está registrado na sua memória local, "
                        "para não contrariar suas preferências por engano.")
        text.append(
            "Minha avaliação honesta: sem dados específicos sobre a situação, não posso afirmar "
            "se está certo ou errado. Mas se a decisão resiste às perguntas acima, ela está melhor "
            "fundamentada do que a maioria."
        )
        return Advice(text=" ".join(text), questions=checks[:3])

    def plan(self, goal: str) -> Advice:
        goal = goal.strip(" .")
        steps = [
            f"1. Definir o resultado observável: como você saberá que '{goal}' foi concluído?",
            "2. Estabelecer um prazo único e realista, com uma data no calendário.",
            "3. Listar as 3 maiores objeções e como contorná-las.",
            "4. Quebrar em entregas semanais pequenas (20–40 minutos cada).",
            "5. Agendar a primeira ação para as próximas 24 horas.",
            "6. Definir uma revisão semanal de progresso — sem revisão, o plano morre.",
        ]
        text = (
            f"Objetivo registrado: {goal}. Vou transformar em um plano executável, "
            "não em uma lista de desejos. " + " ".join(steps) +
            " Posso criar o objetivo e as tarefas iniciais na sua organização, se autorizar."
        )
        return Advice(
            text=text,
            actions=[
                {"action": "goal.create", "payload": {"title": goal}},
                {"action": "task.create", "payload": {"title": f"Definir critério de conclusão: {goal}"}},
            ],
            questions=["Qual é o prazo?",
                       "Quantas horas por semana você pode dedicar?",
                       "Qual seria a primeira ação de 20 minutos?"],
        )

    def explain(self, topic: str) -> Advice:
        lowered = topic.lower()
        for pattern, text in SELF_KNOWLEDGE:
            if re.search(rf"\b(?:{pattern})\b", lowered):
                return Advice(text=text)
        facts = []
        if self.db:
            for row in self.db.search_memories(topic) + self.db.search_notes(topic):
                facts.append(row.get("value") or row.get("body") or "")
        if facts:
            text = (f"Sobre “{topic}”, o que está registrado na sua memória local: "
                    + " | ".join(f.replace("\n", " ") for f in facts[:5] if f))
            return Advice(text=text + " Se quiser um aprofundamento, posso organizar esses "
                                      "pontos em um plano de estudo.")
        if self.personality:
            return Advice(text=self.personality.honest_unknown(topic))
        return Advice(text="Não tenho informações locais suficientes para explicar isso com precisão.")

    def reflect(self, text: str) -> Advice:
        """Resposta para desabafos e conversa cotidiana — escuta ativa, sem fingir terapia."""
        mood = self._detect_mood(text)
        if mood == "cansado":
            body = ("Parece que o senhor está com pouca energia. Antes de decidir qualquer coisa "
                    "grande agora, vale uma pausa curta e água. Se quiser, organizo o restante do dia "
                    "em blocos menores para reduzir o peso.")
        elif mood == "ansioso":
            body = ("Entendo. Ansiedade costuma crescer com tarefas abertas. Sugiro escrevermos "
                    "todas as pendências de uma vez e escolhermos apenas uma para hoje — "
                    "posso fazer essa lista agora.")
        elif mood == "triste":
            body = ("Sinto muito que esteja assim. Não vou fingir que tenho respostas emocionais "
                    "prontas; mas posso ajudar a organizar o que está ao seu alcance hoje, e "
                    "registrar o que você quiser desabafar para revisitar depois.")
        elif mood == "positivo":
            body = "Que bom ouvir isso. Vamos aproveitar o embalo: quer definir a próxima ação concreta?"
        else:
            body = ("Estou acompanhando. Posso ajudar a pensar, organizar ou executar — "
                    "o que for mais útil neste momento.")
        return Advice(text=body)

    def _detect_mood(self, text: str) -> str:
        lowered = text.lower()
        if re.search(r"cansad|exaust|sem energia|acabado", lowered):
            return "cansado"
        if re.search(r"ansios|nervos|preocupad|estress", lowered):
            return "ansioso"
        if re.search(r"triste|desanimad|sozinh|para baixo", lowered):
            return "triste"
        if re.search(r"feliz|animad|empolgad|otimist|consegui", lowered):
            return "positivo"
        return "neutro"

    # ------------------------------------------------------- modelo local (opt-in)
    def local_model_available(self) -> tuple[bool, str]:
        if not self.config.get("llm.enabled", False):
            return False, ("modelo de linguagem local desativado. Para habilitar, instale o Ollama "
                           "ou llama.cpp na sua máquina, baixe um modelo e ative llm.enabled "
                           "nas configurações — nada sai para a internet.")
        endpoint = str(self.config.get("llm.endpoint", "http://127.0.0.1:11434")).rstrip("/")
        try:
            with urllib.request.urlopen(f"{endpoint}/api/tags", timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
            models = [m.get("name") for m in payload.get("models", [])]
            return True, f"modelo local disponível ({', '.join(filter(None, models))[:120]})"
        except Exception as exc:
            return False, f"o endpoint local não respondeu ({exc})"

    def local_chat(self, prompt: str, system: str | None = None) -> str | None:
        """Conversa aberta usando modelo LOCAL. Só funciona se habilitado explicitamente."""
        ok, reason = self.local_model_available()
        if not ok:
            return None
        endpoint = str(self.config.get("llm.endpoint", "http://127.0.0.1:11434")).rstrip("/")
        model = self.config.get("llm.model", "qwen2.5:3b-instruct")
        payload = json.dumps({
            "model": model,
            "prompt": prompt,
            "system": system or ("Você é J.A.R.V.I.S., assistente pessoal educado, calmo e honesto, "
                                 "em português brasileiro. Seja objetivo e admita quando não souber."),
            "stream": False,
            "options": {"temperature": 0.4},
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{endpoint}/api/generate", data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=int(self.config.get("llm.timeout_s", 20))) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return (data.get("response") or "").strip() or None
        except Exception:
            return None

    # ------------------------------------------------------------ ajuda técnica
    def local_model_instructions(self) -> str:
        return (
            "Para conversas abertas sem depender de nuvem, o caminho é um modelo local. "
            "Opção simples: instale o Ollama (ollama.com), baixe um modelo leve como "
            "qwen2.5:3b-instruct ou llama3.2:3b e mantenha tudo na sua máquina. "
            "Depois ative em Configurações → Modelo local, informando o endereço "
            "http://127.0.0.1:11434. Nada é enviado para servidores externos — o modelo roda "
            "no seu processador/placa de vídeo. Eu não instalo nada sem a sua autorização."
        )
