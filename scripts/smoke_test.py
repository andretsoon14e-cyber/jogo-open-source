#!/usr/bin/env python3
"""Teste de fumaça do núcleo — executa um roteiro completo sem interface.

Uso:
    python scripts/smoke_test.py

Cria um diretório temporário como HOME, de modo que nenhuma pasta real do
usuário seja alterada. Ações críticas (desligar) são apenas simuladas.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TMP_HOME = Path(tempfile.mkdtemp(prefix="jarvis-home-"))
os.environ["HOME"] = str(TMP_HOME)
os.environ["USERPROFILE"] = str(TMP_HOME)
downloads = TMP_HOME / "Downloads"
downloads.mkdir(parents=True, exist_ok=True)
for name in ("foto.jpg", "nota.txt", "planilha.xlsx", "musica.mp3"):
    (downloads / name).write_text("conteúdo de teste", encoding="utf-8")


async def main() -> int:
    from jarvis.core.assistant import Assistant
    from jarvis.core.config import Config

    (TMP_HOME / "config").mkdir(parents=True, exist_ok=True)
    (TMP_HOME / "data").mkdir(parents=True, exist_ok=True)
    config = Config(root=TMP_HOME)          # nada é gravado na pasta real do projeto
    config.set("security.confirm_level", 2)
    config.set("voice.tts.engine", "disabled")   # sem áudio no teste
    config.set("voice.stt.engine", "disabled")
    assistant = Assistant(config)

    print(f"HOME temporário: {TMP_HOME}\n")
    script = [
        "bom dia",
        "que horas são",
        "que dia é hoje",
        "quem é você",
        "anote que preciso comprar um carregador",
        "minhas anotações",
        "me lembre de estudar amanhã às 14 horas",
        "quais são minhas tarefas",
        "lembre-se de que prefiro acordar às 7 horas",
        "o que você sabe sobre mim",
        "como está o desempenho do computador",
        "quanto espaço tem no disco",
        "quais programas estão abertos",
        "abre a pasta de downloads",
        "organize a pasta de downloads",
        "sim",
        "quando eu disser modo estudo, abre o navegador e abre a pasta de documentos",
        "quais rotinas eu tenho",
        "desativa a rotina modo estudo",
        "desliga o computador",
        "cancela",
        "me avise em 1 minuto",
        "quais são meus lembretes",
        "estou pensando em comprar um computador novo, o que acha?",
        "eu acho que estou certo, concorda?",
        "explique como funciona a memória local",
        "quero um modelo local",
        "ajuda",
        "conta uma piada",
        "me diga uma curiosidade",
        "obrigado",
        # comandos adicionados na revisão final
        "cria uma tarefa revisar o relatório amanhã",
        "anota isso: comprar leite",
        "marca uma consulta com o dentista na sexta às 15 horas",
        "quanto tempo o computador está ligado",
        "quais são as configurações de segurança",
        "onde ficam meus dados",
        "o que você registrou nas últimas ações",
        "para de falar",
        "apaga o histórico de conversas",
        "cancela",
    ]
    for text in script:
        response = await assistant.handle_text(text, source="smoke")
        label = f"[{response.intent}]" if response.intent else ""
        print(f"você  › {text}")
        print(f"jarvis› {response.reply[:400]}{'…' if len(response.reply) > 400 else ''} {label}")
        if response.pending:
            print(f"        ⏳ confirmação pendente: {response.pending['description']} "
                  f"(nível {response.pending['level']})")
        print()

    print("=== resumo ===")
    print("memórias:", len(assistant.db.list_memories()))
    print("notas:", len(assistant.db.list_notes()))
    print("tarefas:", len(assistant.db.list_tasks(status=None)))
    print("lembretes:", len(assistant.db.pending_reminders()))
    print("rotinas:", [r["name"] for r in assistant.db.list_routines()])
    print("auditoria:", len(assistant.db.list_audit(200)), "registros")
    print("organização:", sorted(p.name for p in downloads.iterdir()))
    assistant.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
