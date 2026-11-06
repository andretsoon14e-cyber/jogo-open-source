#!/usr/bin/env bash
# ============================================================
#  J.A.R.V.I.S. — inicialização para Linux / macOS
# ============================================================
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10+ é necessário. Instale e tente novamente."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Criando ambiente virtual…"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Verificando dependências…"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "Iniciando J.A.R.V.I.S.…"
exec python jarvis.py "$@"
