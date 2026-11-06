@echo off
REM ============================================================
REM  J.A.R.V.I.S. — inicialização para Windows
REM  Basta dar dois cliques neste arquivo.
REM ============================================================
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Python nao encontrado. Instale o Python 3.10+ em https://python.org
  echo  e marque a opcao "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual...
  python -m venv .venv || goto :erro
)

echo Verificando dependencias...
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt || goto :erro

echo Iniciando J.A.R.V.I.S....
".venv\Scripts\python.exe" jarvis.py %*
if errorlevel 1 goto :erro
exit /b 0

:erro
echo.
echo Ocorreu um erro. Rode "python jarvis.py --diagnose" para detalhes.
pause
exit /b 1
