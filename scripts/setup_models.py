#!/usr/bin/env python3
"""Instalador opcional dos modelos de voz locais do J.A.R.V.I.S.

Nada é baixado sem a sua confirmação. Os arquivos ficam na pasta models/ e
são usados apenas pelo seu próprio computador — nenhum áudio é enviado a
serviços externos.

Uso:
    python scripts/setup_models.py              # assistente interativo
    python scripts/setup_models.py --check      # só verifica o que já existe
    python scripts/setup_models.py --vosk       # baixa apenas o modelo Vosk
    python scripts/setup_models.py --piper      # baixa apenas o Piper + voz
    python scripts/setup_models.py --yes        # não pedir confirmação
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"

VOSK_URL = "https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip"
VOSK_DIR = "vosk-model-small-pt-0.3"

PIPER_RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
PIPER_VOICE = ("https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/"
               "pt_BR-faber-medium.onnx")
PIPER_CONFIG = PIPER_VOICE + ".json"


def human(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def download(url: str, target: Path, label: str) -> bool:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    print(f"  → {label}: {url}")
    try:
        with urllib.request.urlopen(url, timeout=60) as response, tmp.open("wb") as out:
            total = int(response.headers.get("Content-Length") or 0)
            done = 0
            while chunk := response.read(1 << 18):
                out.write(chunk)
                done += len(chunk)
                if total:
                    percent = done / total * 100
                    print(f"\r    {percent:5.1f}%  ({human(done)} de {human(total)})", end="")
        print()
        tmp.replace(target)
        return True
    except Exception as exc:
        print(f"\n    falhou: {exc}")
        tmp.unlink(missing_ok=True)
        return False


def check() -> dict:
    vosk_dir = MODELS / VOSK_DIR
    vosk_ok = vosk_dir.exists() and any(vosk_dir.iterdir())
    piper_exe = MODELS / "piper" / ("piper.exe" if os.name == "nt" else "piper")
    voice = MODELS / "piper" / "pt_BR-faber-medium.onnx"
    whisper = list(MODELS.glob("ggml-*.bin"))
    print("\nModelos de voz disponíveis:\n")
    print(f"  Vosk (reconhecimento pt-BR) ... {'pronto' if vosk_ok else 'ausente'}")
    print(f"  Piper (voz neural) ........... {'pronto' if (piper_exe.exists() and voice.exists()) else 'ausente'}")
    print(f"  whisper.cpp (opcional) ....... {'pronto' if whisper else 'ausente'}")
    print(f"  Pasta de modelos ............. {MODELS}")
    return {"vosk": vosk_ok, "piper": piper_exe.exists() and voice.exists(), "whisper": bool(whisper)}


def install_vosk(yes: bool) -> bool:
    print("\n[1/2] Modelo Vosk pt-BR (~50 MB)")
    print("      Reconhecimento de fala offline, rápido e leve (roda em CPU).")
    if not yes and input("      Baixar agora? [s/N] ").strip().lower()[:1] != "s":
        print("      ignorado.")
        return False
    zip_path = MODELS / "vosk-pt.zip"
    if not download(VOSK_URL, zip_path, "vosk-model-small-pt-0.3"):
        return False
    print("      extraindo…")
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(MODELS)
    zip_path.unlink(missing_ok=True)
    print(f"      pronto em {MODELS / VOSK_DIR}")
    return True


def install_piper(yes: bool) -> bool:
    print("\n[2/2] Voz neural Piper (pt-BR, masculina)")
    print("      Requer o binário do Piper + um modelo .onnx (~65 MB).")
    if platform.system() != "Windows":
        print("      Observação: este script baixa o binário do Windows.")
        print("      No Linux/macOS, instale o piper pelo gerenciador de pacotes ou compile")
        print("      (https://github.com/rhasspy/piper) e informe o caminho em voice.tts.piper_binary.")
    if not yes and input("      Baixar agora? [s/N] ").strip().lower()[:1] != "s":
        print("      ignorado.")
        return False
    target_dir = MODELS / "piper"
    target_dir.mkdir(parents=True, exist_ok=True)

    if platform.system() == "Windows":
        archive = MODELS / "piper.zip"
        if download(PIPER_RELEASE, archive, "piper (binário Windows)"):
            print("      extraindo…")
            with zipfile.ZipFile(archive) as zip_file:
                zip_file.extractall(MODELS)
            archive.unlink(missing_ok=True)
            # o zip cria a pasta piper/ com piper.exe
            moves = list(MODELS.glob("piper_*"))
            for folder in moves:
                exe = folder / "piper.exe"
                if exe.exists():
                    shutil.move(str(exe), str(target_dir / "piper.exe"))
                    shutil.rmtree(folder, ignore_errors=True)

    ok_voice = download(PIPER_VOICE, target_dir / "pt_BR-faber-medium.onnx", "voz pt_BR-faber-medium")
    ok_config = download(PIPER_CONFIG, target_dir / "pt_BR-faber-medium.onnx.json", "configuração da voz")
    if ok_voice and ok_config:
        print(f"      pronto em {target_dir}")
        return True
    return False


def update_config() -> None:
    """Aponta as configurações para os modelos encontrados."""
    try:
        import yaml
    except Exception:
        print("\n(PyYAML não instalado — ajuste os caminhos manualmente em config/user.yaml)")
        return
    path = ROOT / "config" / "user.yaml"
    data = {}
    if path.exists():
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    voice = data.setdefault("voice", {})
    stt = voice.setdefault("stt", {})
    tts = voice.setdefault("tts", {})
    if (MODELS / VOSK_DIR).exists():
        stt["vosk_model"] = f"models/{VOSK_DIR}"
        stt["engine"] = "auto"
    piper_exe = MODELS / "piper" / ("piper.exe" if os.name == "nt" else "piper")
    if piper_exe.exists():
        tts["piper_binary"] = str(piper_exe.relative_to(ROOT)).replace("\\", "/")
        tts["piper_model"] = "models/piper/pt_BR-faber-medium.onnx"
        tts["engine"] = "auto"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=True), encoding="utf-8")
    print(f"\nConfiguração atualizada em {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Instala os modelos de voz locais do J.A.R.V.I.S.")
    parser.add_argument("--check", action="store_true", help="apenas verificar")
    parser.add_argument("--vosk", action="store_true", help="baixar só o Vosk")
    parser.add_argument("--piper", action="store_true", help="baixar só o Piper")
    parser.add_argument("--yes", action="store_true", help="não pedir confirmação")
    args = parser.parse_args()

    MODELS.mkdir(parents=True, exist_ok=True)

    if args.check:
        check()
        return 0

    print("=" * 68)
    print(" J.A.R.V.I.S. — modelos de voz locais")
    print("=" * 68)
    print("Estes downloads acontecem uma única vez e servem apenas para o seu")
    print("computador. Depois disso, o assistente funciona 100% offline.")
    print("Nenhum áudio ou texto é enviado a serviços de terceiros.")

    only_vosk = args.vosk and not args.piper
    only_piper = args.piper and not args.vosk

    if not only_piper:
        install_vosk(args.yes)
    if not only_vosk:
        install_piper(args.yes)

    update_config()
    result = check()
    print("\nPróximos passos:")
    print("  1. python jarvis.py --diagnose    (verifica se os motores foram reconhecidos)")
    print("  2. python jarvis.py               (abre a interface)")
    if not result["vosk"]:
        print("\nSem o Vosk, o microfone fica indisponível e você pode digitar os comandos.")
    if not result["piper"]:
        print("Sem o Piper, a voz usa o motor local do sistema (SAPI5/espeak) ou as vozes do navegador.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
