#!/usr/bin/env python3
"""J.A.R.V.I.S. — assistente pessoal local.

Uso:
    python jarvis.py                 # abre a interface no navegador
    python jarvis.py --console       # modo terminal
    python jarvis.py --diagnose      # verifica ambiente, dependências e voz
    python jarvis.py --port 9000     # porta alternativa
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
