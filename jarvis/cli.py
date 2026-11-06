"""Ponto de entrada: interface web, modo console e diagnóstico do ambiente."""
from __future__ import annotations

import argparse
import asyncio
import shutil
import sys
from pathlib import Path

from . import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jarvis",
        description="J.A.R.V.I.S. — assistente pessoal local, offline e modular.",
    )
    parser.add_argument("--version", action="version", version=f"J.A.R.V.I.S. {__version__}")
    parser.add_argument("--host", help="endereço do servidor (padrão: 0.0.0.0)")
    parser.add_argument("--port", type=int, help="porta do servidor (padrão: 8765)")
    parser.add_argument("--no-browser", action="store_true", help="não abrir o navegador")
    parser.add_argument("--console", action="store_true", help="usar no terminal, sem interface gráfica")
    parser.add_argument("--diagnose", action="store_true", help="verificar ambiente, dependências e voz")
    parser.add_argument("--test-command", help="interpretar uma frase e mostrar a intenção detectada")
    return parser


# --------------------------------------------------------------------- diagnose
def diagnose() -> int:
    import platform

    from .core.config import get_config
    from .nlu.engine import engine, load_commands
    from .system import sysinfo

    load_commands()
    from .voice.stt import build_stt
    from .voice.tts import build_tts

    config = get_config()
    print("\n=== J.A.R.V.I.S. — diagnóstico do ambiente ===\n")
    print(f"Python ........: {sys.version.split()[0]}")
    print(f"Sistema .......: {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"Projeto .......: {config.root}")

    print("\nDependências:")
    for module, purpose in [("fastapi", "servidor da interface"), ("uvicorn", "servidor ASGI"),
                            ("psutil", "métricas do sistema"), ("yaml", "configuração"),
                            ("vosk", "reconhecimento de voz offline"),
                            ("pyttsx3", "síntese de voz do sistema"),
                            ("pycaw", "volume preciso no Windows"),
                            ("send2trash", "excluir para a lixeira")]:
        try:
            __import__(module)
            print(f"  ✓ {module:<12} ({purpose})")
        except Exception:
            print(f"  – {module:<12} ausente ({purpose}) — opcional")

    stt = build_stt(config)
    tts = build_tts(config)
    print("\nVoz:")
    print(f"  Reconhecimento: {stt.name} — {'pronto' if stt.available else 'indisponível'}")
    print(f"                 {stt.reason}")
    print(f"  Síntese ......: {tts.name} — {'pronto' if tts.available else 'usará o navegador'}")
    print(f"                 {tts.reason}")

    print("\nSistema:")
    data = sysinfo.snapshot()
    print(f"  CPU: {data['cpu']['percent']}% | RAM: {data['memory']['percent']}% "
          f"({data['memory']['used_gb']}/{data['memory']['total_gb']} GB)")
    for disk in data["disks"][:3]:
        print(f"  Disco {disk['mount']}: {disk['free_gb']} GB livres de {disk['total_gb']} GB")

    print(f"\nComandos registrados: {len(engine.commands)}")
    print("\nInterpretador (teste rápido):")
    samples = ["jarvis abre o navegador", "que horas são", "me lembre de estudar amanhã às 14 horas",
               "organize a pasta de downloads", "desliga o computador daqui a 30 minutos",
               "estou pensando em comprar um computador, o que acha?",
               "quando eu disser modo estudo, abre o navegador e abre a pasta de documentos"]
    for sample in samples:
        match = engine.match(sample)
        if match:
            print(f"  ✓ “{sample}” → {match.command.intent} "
                  f"(confiança {match.confidence:.2f}, nível {match.command.level})")
        else:
            print(f"  ✗ “{sample}” → não reconhecido")
    print("\nDiagnóstico concluído. Nenhuma verificação acessou a internet.\n")
    return 0


# ---------------------------------------------------------------------- console
async def console_loop() -> None:
    from .core.assistant import Assistant
    from .core.config import get_config
    from .core.logging_setup import setup_logging

    config = get_config()
    setup_logging(config)
    assistant = Assistant(config)
    print(f"\nJ.A.R.V.I.S. {__version__} — modo console. Digite 'sair' para encerrar.\n")
    print(assistant.personality.greeting() + "\n")
    task = asyncio.create_task(assistant.scheduler_loop())
    try:
        while True:
            try:
                text = await asyncio.to_thread(input, "você › ")
            except (EOFError, KeyboardInterrupt):
                break
            if text.strip().lower() in {"sair", "exit", "quit", "tchau"}:
                break
            response = await assistant.handle_text(text, source="console")
            print(f"\njarvis › {response.reply}\n")
            if response.pending:
                confirm = await asyncio.to_thread(input, "[confirma? s/n] › ")
                approved = confirm.strip().lower().startswith(("s", "y", "c"))
                response = await assistant.confirm(response.pending["id"], approved)
                print(f"\njarvis › {response.reply}\n")
    finally:
        task.cancel()
        assistant.shutdown()
        print("\nSessão encerrada.\n")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.diagnose:
        return diagnose()

    if args.test_command:
        from .nlu.engine import engine

        match = engine.match(args.test_command)
        if not match:
            print("não reconhecido")
            return 1
        print(f"intent .....: {match.command.intent}")
        print(f"confiança ..: {match.confidence}")
        print(f"nível ......: {match.command.level}")
        print(f"slots ......: {match.slots}")
        return 0

    if args.console:
        try:
            asyncio.run(console_loop())
        except KeyboardInterrupt:
            pass
        return 0

    from .core.config import get_config
    from .server.app import serve

    config = get_config()
    for directory in ("data", "data/logs", "models"):
        (config.root / directory).mkdir(parents=True, exist_ok=True)
    serve(host=args.host, port=args.port, open_browser=not args.no_browser)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
