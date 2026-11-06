#!/usr/bin/env python3
"""Gera docs/COMANDOS.md a partir dos comandos realmente registrados.

Assim a documentação nunca fica desatualizada em relação ao interpretador.
Uso: python scripts/gen_commands_doc.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from jarvis.nlu.engine import engine, load_commands  # noqa: E402

CATEGORY_TITLES = {
    "conversa": "Conversa e informação",
    "sistema": "Computador",
    "aplicativos": "Programas, pastas e janelas",
    "arquivos": "Arquivos",
    "memoria": "Memória",
    "organizacao": "Organização pessoal",
    "automacao": "Automações e rotinas",
    "conselheiro": "Conselheiro pessoal",
    "voz": "Voz",
    "configuracao": "Configurações",
}
LEVEL_NAMES = {1: "nível 1 · simples", 2: "nível 2 · altera dados", 3: "nível 3 · crítica"}


def main() -> int:
    load_commands()
    commands = engine.describe()
    lines = [
        "# Comandos do J.A.R.V.I.S.",
        "",
        "Este arquivo é gerado automaticamente a partir do interpretador "
        "(`python scripts/gen_commands_doc.py`).",
        "",
        f"**{len(commands)} intenções registradas.** O reconhecimento aceita variações informais, "
        "erros de pronúncia e sinônimos — as frases abaixo são exemplos, não a única forma válida.",
        "",
        "> Dica: diga ou escreva “Jarvis” antes da frase quando estiver usando a palavra de ativação.",
        "> O assistente também entende frases compostas como "
        "“anote que preciso revisar o código e quais são minhas tarefas”.",
        "",
        "## Níveis de autorização",
        "",
        "| Nível | Comportamento |",
        "| --- | --- |",
        "| 1 · simples | executado imediatamente (abrir programas, consultar dados, ajustar volume) |",
        "| 2 · altera dados | mostra o que será feito e pede confirmação |",
        "| 3 · crítica | confirmação explícita obrigatória (excluir, desligar, memória, configurações) |",
        "",
    ]

    grouped: dict[str, list[dict]] = {}
    for item in commands:
        grouped.setdefault(item["category"], []).append(item)

    for category in sorted(grouped, key=lambda key: list(CATEGORY_TITLES).index(key)
                           if key in CATEGORY_TITLES else 99):
        items = grouped[category]
        lines.append(f"## {CATEGORY_TITLES.get(category, category)}")
        lines.append("")
        lines.append("| Intenção | O que faz | Exemplos | Nível |")
        lines.append("| --- | --- | --- | --- |")
        for item in items:
            examples = "<br>".join(f"“{example}”" for example in item["examples"][:2]) or "—"
            lines.append(
                f"| `{item['intent']}` | {item['description'] or '—'} | {examples} | "
                f"{LEVEL_NAMES.get(item['level'], item['level'])} |"
            )
        lines.append("")

    lines += [
        "## O que o assistente não faz (por decisão de projeto)",
        "",
        "- Não responde perguntas enciclopédicas abertas sem uma base local — ele avisa que não sabe.",
        "- Não acessa serviços de IA na nuvem, APIs de terceiros ou telemetria.",
        "- Não instala programas, não altera o registro do sistema e não executa scripts externos "
        "sem autorização explícita.",
        "- Não identifica o locutor: qualquer voz com acesso ao microfone pode dar comandos. "
        "Ative a confirmação por nível e mantenha o microfone desligado em ambientes compartilhados.",
        "- Não cria agendamentos recorrentes por voz (apenas horário único). Rotinas podem ser "
        "recriadas com o mesmo nome para editar os passos.",
        "- Não apaga arquivos de forma permanente sem confirmação de nível 3 "
        "(quando a lixeira está disponível, o arquivo vai para ela).",
        "",
    ]

    target = ROOT / "docs" / "COMANDOS.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(commands)} comandos documentados em {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
