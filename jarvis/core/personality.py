"""Personalidade do J.A.R.V.I.S.: educação, clareza, honestidade e humor discreto.

Não há geração de texto por IA aqui — são bancos de frases escritos à mão,
combinados de acordo com contexto, hora do dia e estilo configurado.
"""
from __future__ import annotations

import random
from datetime import datetime

from .config import Config


class Personality:
    def __init__(self, config: Config) -> None:
        self.config = config
        self._last: dict[str, str] = {}
        self.user_name: str = str(config.get("assistant.user_name") or "")
        self.user_title: str = str(config.get("assistant.user_title") or "Senhor")

    # ------------------------------------------------------------------ estilo
    @property
    def formality(self) -> float:
        return float(self.config.get("personality.formality", 0.8))

    @property
    def humor(self) -> float:
        return float(self.config.get("personality.humor", 0.5))

    @property
    def verbose(self) -> bool:
        return float(self.config.get("personality.verbosity", 0.5)) >= 0.6

    def title(self) -> str:
        if self.user_name:
            if self.formality >= 0.7:
                return f"{self.user_title} {self.user_name}"
            return self.user_name
        return self.user_title if self.config.get("personality.use_honorific", True) else ""

    def set_user_name(self, name: str) -> None:
        self.user_name = name.strip()
        self.config.set("assistant.user_name", self.user_name)

    # --------------------------------------------------------------- utilidades
    def _pick(self, key: str, options: list[str], allow_repeat: bool = False) -> str:
        if not options:
            return ""
        if len(options) > 1 and not allow_repeat:
            previous = self._last.get(key)
            choices = [opt for opt in options if opt != previous] or options
        else:
            choices = options
        chosen = random.choice(choices)
        self._last[key] = chosen
        return chosen

    def _address(self, text: str) -> str:
        title = self.title()
        return f"{text}, {title}." if title else f"{text}."

    # --------------------------------------------------------------- saudações
    def greeting(self) -> str:
        hour = datetime.now().hour
        if 5 <= hour < 12:
            base = "Bom dia"
        elif 12 <= hour < 18:
            base = "Boa tarde"
        else:
            base = "Boa noite"
        extras = [
            "Todos os sistemas operacionais.",
            "Estou à disposição.",
            "Sistemas em linha. Como posso ajudar?",
            "Monitorando seus módulos. Em que posso ser útil?",
        ]
        return f"{self._address(base)} {self._pick('greet', extras)}"

    def wake_greeting(self) -> str:
        return self._pick("wake", ["Pois não?", "Estou ouvindo.", "Sim?", "Às suas ordens.",
                                   "Pode falar."])

    def farewell(self) -> str:
        return self._pick("bye", [
            self._address("Até logo"),
            self._address("Encerrando os sistemas de interface. Estarei aqui"),
            self._address("Foi um prazer. Até a próxima"),
        ])

    def thanks_reply(self) -> str:
        return self._pick("thanks", [
            "Sempre às suas ordens.",
            "Não foi nada. É para isso que estou aqui.",
            "Fico satisfeito em ajudar.",
            "Disponha.",
        ])

    def ack(self) -> str:
        return self._pick("ack", [
            "Certamente.", "Imediatamente.", "Claro.", "Como desejar.", "Feito.", "Sem problemas.",
        ])

    def thinking(self) -> str:
        return self._pick("think", ["Um instante.", "Analisando.", "Verificando os sistemas.",
                                    "Processando."])

    # -------------------------------------------------------------- respostas
    def known(self, message: str, prefix: bool = True) -> str:
        message = message.strip()
        if not prefix:
            return message
        ack = self.ack() if random.random() < 0.45 else ""
        return f"{ack} {message}".strip()

    def error(self, message: str) -> str:
        # mensagens que já vêm completas do comando não ganham prefixo:
        # antes saía "Não consegui concluir...: Não consegui falar com a internet".
        texto = (message or "").strip()
        if texto[:1].isupper() and texto.split(" ")[0].rstrip(",").lower() in (
                "não", "nao", "sem", "preciso", "falta", "impossível", "impossivel"):
            return texto
        return self._pick("err", [
            f"Não consegui concluir essa tarefa, {self.title() or 'senhor'}: {texto}",
            f"Receio que houve um impedimento: {texto}",
            f"Infelizmente não deu certo — {texto}",
        ])

    def denied(self, why: str) -> str:
        return f"Não posso fazer isso. {why}"

    def unknown_intent(self, suggestions: list[str] | None = None) -> str:
        base = self._pick("unknown", [
            "Não tenho certeza de como interpretar esse pedido.",
            "Confesso que não compreendi exatamente o que deseja.",
            "Não consegui reconhecer essa instrução — ela está fora do meu escopo no momento.",
        ])
        useful = [s for s in (suggestions or []) if s.strip().lower() != "ajuda"]
        if useful:
            examples = "; ".join(f"“{example}”" for example in useful[:2])
            return (f"{base} Posso ajudar com algo como: {examples}. "
                    "Diga “ajuda” para ver tudo o que sei fazer.")
        return f"{base} Diga “ajuda” para consultar as funções disponíveis."

    def not_capable(self, what: str, alternative: str | None = None) -> str:
        text = f"Essa capacidade específica não está implementada: {what}."
        if alternative:
            text += f" {alternative}"
        text += (" Prefiro ser transparente a inventar uma resposta. "
                 "Se desejar, posso registrar o pedido como um objetivo de melhoria.")
        return text

    def honest_unknown(self, topic: str | None = None) -> str:
        focus = f" sobre {topic}" if topic else ""
        return (
            f"Não tenho isso em base local para responder{focus} com precisão, e prefiro não "
            "inventar. Duas saídas: eu pesquiso na internet agora — diga “pesquisa sobre …” — ou, "
            "se preferir conversa aberta sem rede, existe a opção de um modelo de linguagem rodando "
            "na sua máquina (“quero um modelo local”)."
        )

    def confirm_request(self, description: str, level: int) -> str:
        level_text = {
            2: "Essa ação altera informações no seu computador",
            3: "Essa é uma ação crítica",
        }.get(level, "Preciso da sua autorização")
        description = description.rstrip(" .")
        return (f"{level_text}: {description}. "
                "Confirma a execução? Diga “confirmo” ou “cancela”.")

    def confirmed(self, description: str) -> str:
        return self._pick("confirmed", [
            f"Confirmado. {description}",
            f"Executando agora: {description}",
        ])

    def cancelled(self) -> str:
        return self._pick("cancelled", [
            "Entendido. Ação cancelada.",
            "Como preferir. Nada foi alterado.",
            "Cancelado. Nenhuma alteração foi feita.",
        ])

    def correction(self, issue: str, alternative: str | None = None) -> str:
        text = f"Permita-me discordar com respeito: {issue}"
        if alternative:
            text += f" {alternative}"
        return text

    # ---------------------------------------------------------------- conselhos
    def advice_intro(self) -> str:
        return self._pick("advice", [
            "Certo. Vamos estruturar essa decisão.",
            "Boa pergunta. Antes de opinar, gostaria de organizar os fatores.",
            "Podemos analisar por partes.",
        ])

    def closing_offer(self) -> str:
        return self._pick("offer", [
            "Quer que eu registre isso como um objetivo e crie as tarefas?",
            "Posso criar as tarefas correspondentes, se desejar.",
            "Se preferir, anoto os próximos passos na sua lista de tarefas.",
        ])

    def humor_line(self) -> str:
        if self.humor <= 0:
            return ""
        lines = [
            "Se algo der errado, culparemos a física — é o padrão da casa.",
            "Meus circuitos estão aquecidos, mas educados.",
            "Suspeito que o senhor tenha planos interessantes para hoje.",
            "Estou pronto. Otimista, mas pronto.",
        ]
        return random.choice(lines)
