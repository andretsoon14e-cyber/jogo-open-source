"""Configuração de logs locais (rotação por tamanho, sem envio externo)."""
from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import Config

_configured = False


def setup_logging(config: Config, force: bool = False) -> None:
    global _configured
    if _configured and not force:
        return
    level = getattr(logging, str(config.get("logging.level", "INFO")).upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        console = logging.StreamHandler()
        console.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)-18s %(message)s",
                                               "%H:%M:%S"))
        root.addHandler(console)

    path = config.resolve(config.get("logging.file", "data/logs/jarvis.log"))
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(
            path,
            maxBytes=int(config.get("logging.max_bytes", 2_097_152)),
            backupCount=int(config.get("logging.backups", 3)),
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)-20s %(message)s"))
        root.addHandler(handler)
    except Exception as exc:  # disco somente leitura etc.
        logging.getLogger("jarvis").warning("não foi possível gravar log em arquivo: %s", exc)

    for noisy in ("uvicorn.access", "watchfiles", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    _configured = True
