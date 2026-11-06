"""Síntese de voz offline em português brasileiro.

Motores (em ordem de preferência):
1. Piper — voz neural local, natural, requer binário + modelo .onnx pt_BR.
2. pyttsx3 — usa SAPI5 (Windows) / espeak (Linux) já instalado no sistema.
3. espeak-ng — voz robótica, mas sempre disponível quando instalada.
4. Navegador — usa a voz local do próprio sistema via Web Speech API (offline).

Nenhum texto sai da máquina.
"""
from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from ..core.config import Config

logger = logging.getLogger("jarvis.tts")


class BaseTTS:
    name = "base"
    available = False
    reason = "não configurado"

    def synthesize(self, text: str) -> bytes | None:
        raise NotImplementedError

    def status(self) -> dict:
        return {"engine": self.name, "available": self.available, "reason": self.reason}


class PiperTTS(BaseTTS):
    name = "piper"

    def __init__(self, binary: Path | None, model: Path | None) -> None:
        self.binary = binary
        self.model = model
        if binary and Path(binary).exists() and model and Path(model).exists():
            self.available = True
            self.reason = "Piper pronto (voz neural local)"
        else:
            self.reason = ("Piper não configurado. Informe voice.tts.piper_binary e "
                           "voice.tts.piper_model (ex.: pt_BR-faber-medium.onnx)")

    def synthesize(self, text: str) -> bytes | None:
        if not self.available:
            return None
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.wav"
            try:
                subprocess.run(
                    [str(self.binary), "--model", str(self.model), "--output_file", str(out)],
                    input=text.encode("utf-8"), check=True, capture_output=True, timeout=60,
                )
                return out.read_bytes() if out.exists() else None
            except Exception as exc:
                logger.warning("Piper falhou: %s", exc)
                return None


class Pyttsx3TTS(BaseTTS):
    name = "pyttsx3"

    def __init__(self, rate: float = 1.0, volume: float = 0.9) -> None:
        self.rate = rate
        self.volume = volume
        try:
            import pyttsx3

            engine = pyttsx3.init()
            voices = engine.getProperty("voices")
            chosen = None
            for voice in voices:
                blob = f"{voice.id} {getattr(voice, 'name', '')}".lower()
                if any(tag in blob for tag in ("portugu", "pt-br", "pt_br", "brazil", "maria", "daniel")):
                    chosen = voice.id
                    break
            if chosen:
                engine.setProperty("voice", chosen)
                self.reason = "voz pt-BR do sistema localizada"
            else:
                self.reason = "pyttsx3 disponível (nenhuma voz pt-BR identificada no sistema)"
            engine.stop()
            self.available = True
        except Exception as exc:
            self.reason = f"pyttsx3 indisponível: {exc}"

    def synthesize(self, text: str) -> bytes | None:
        if not self.available:
            return None
        try:
            import pyttsx3

            engine = pyttsx3.init()
            engine.setProperty("rate", int(170 * self.rate))
            engine.setProperty("volume", self.volume)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                path = Path(tmp.name)
            engine.save_to_file(text, str(path))
            engine.runAndWait()
            engine.stop()
            data = path.read_bytes() if path.exists() else None
            path.unlink(missing_ok=True)
            return data if data and len(data) > 1000 else None
        except Exception as exc:
            logger.warning("pyttsx3 falhou: %s", exc)
            return None


class EspeakTTS(BaseTTS):
    name = "espeak"

    def __init__(self, rate: float = 1.0) -> None:
        self.rate = rate
        self.binary = shutil.which("espeak-ng") or shutil.which("espeak")
        self.available = bool(self.binary)
        self.reason = f"espeak pronto ({self.binary})" if self.binary else "espeak-ng não instalado"

    def synthesize(self, text: str) -> bytes | None:
        if not self.binary:
            return None
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.wav"
            try:
                subprocess.run(
                    [self.binary, "-v", "pt-br", "-s", str(int(160 * self.rate)), "-w", str(out),
                     text],
                    check=True, capture_output=True, timeout=60,
                )
                return out.read_bytes() if out.exists() else None
            except Exception as exc:
                logger.warning("espeak falhou: %s", exc)
                return None


class BrowserTTS(BaseTTS):
    """A síntese acontece no navegador, com as vozes locais do sistema operacional."""

    name = "browser"

    def __init__(self) -> None:
        self.available = True
        self.reason = "síntese pelo navegador (vozes locais do sistema)"

    def synthesize(self, text: str) -> bytes | None:
        return None


class DisabledTTS(BaseTTS):
    name = "disabled"

    def __init__(self, reason: str = "síntese de voz desativada") -> None:
        self.reason = reason

    def synthesize(self, text: str) -> bytes | None:
        return None


def build_tts(config: Config) -> BaseTTS:
    engine = str(config.get("voice.tts.engine", "auto")).lower()
    rate = float(config.get("voice.tts.rate", 1.0) or 1.0)
    volume = float(config.get("voice.tts.volume", 0.9) or 0.9)
    piper_bin = config.get("voice.tts.piper_binary") or ""
    piper_model = config.resolve(config.get("voice.tts.piper_model", "models/piper/pt_BR-faber-medium.onnx"))

    def make(name: str) -> BaseTTS:
        if name == "piper":
            return PiperTTS(Path(piper_bin) if piper_bin else None, piper_model)
        if name == "pyttsx3":
            return Pyttsx3TTS(rate, volume)
        if name == "espeak":
            return EspeakTTS(rate)
        if name == "browser":
            return BrowserTTS()
        return DisabledTTS()

    if engine == "disabled":
        return DisabledTTS()
    if engine in ("piper", "pyttsx3", "espeak", "browser"):
        return make(engine)

    # auto: Piper > pyttsx3 > espeak > navegador
    for candidate in ("piper", "pyttsx3", "espeak"):
        engine_obj = make(candidate)
        if engine_obj.available:
            return engine_obj
    if config.get("voice.tts.prefer_browser", True):
        return BrowserTTS()
    return DisabledTTS("nenhum motor de voz local encontrado")
