"""Reconhecimento de voz offline.

Motores suportados (nenhum envia áudio para a internet):
- Vosk (recomendado): modelo pt-BR pequeno, ~50 MB, roda em CPU.
- whisper.cpp: transcrição mais precisa, exige binário + modelo GGML compilados.
- Desativado: o assistente continua funcionando por texto.

Se nenhum motor estiver instalado, o sistema informa isso claramente em vez de
fingir que está ouvindo.
"""
from __future__ import annotations

import io
import json
import logging
import os
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

from ..core.config import Config

logger = logging.getLogger("jarvis.stt")


@dataclass
class SpeechResult:
    text: str
    engine: str
    confidence: float = 0.0
    duration_s: float = 0.0
    raw: str | None = None

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "engine": self.engine,
            "confidence": round(self.confidence, 2),
            "duration_s": round(self.duration_s, 2),
        }


class BaseSTT:
    name = "base"
    available = False
    reason = "não configurado"

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> SpeechResult:
        raise NotImplementedError

    def status(self) -> dict:
        return {"engine": self.name, "available": self.available, "reason": self.reason}


class DisabledSTT(BaseSTT):
    name = "disabled"

    def __init__(self, reason: str = "reconhecimento de voz desativado") -> None:
        self.reason = reason

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> SpeechResult:
        return SpeechResult(text="", engine=self.name)


class VoskSTT(BaseSTT):
    name = "vosk"

    def __init__(self, model_path: Path, alt_path: Path | None = None) -> None:
        self.model = None
        self.available = False
        try:
            import vosk  # noqa: F401

            candidate = model_path if model_path.exists() else alt_path
            if candidate and candidate.exists():
                import vosk

                vosk.SetLogLevel(-1 if hasattr(vosk, "SetLogLevel") else 0)
                self.model = vosk.Model(str(candidate))
                self.available = True
                self.reason = f"modelo carregado ({candidate.name})"
            else:
                self.reason = (f"modelo Vosk não encontrado em {model_path}. "
                               "Execute scripts/setup_models.py para baixá-lo.")
        except ImportError:
            self.reason = "pacote 'vosk' não instalado (pip install vosk)"
        except Exception as exc:
            self.reason = f"falha ao carregar o modelo Vosk: {exc}"

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> SpeechResult:
        if not self.available:
            return SpeechResult(text="", engine=self.name, raw=self.reason)
        import vosk

        recognizer = vosk.KaldiRecognizer(self.model, sample_rate)
        recognizer.SetWords(True)
        started = 0
        # Vosk aceita PCM s16le mono em blocos
        chunk_size = 8000
        for offset in range(0, len(audio), chunk_size):
            block = audio[offset:offset + chunk_size]
            if recognizer.AcceptWaveform(block):
                started += 1
        final = json.loads(recognizer.FinalResult() or "{}")
        text = (final.get("text") or "").strip()
        confidence = 0.0
        if final.get("result"):
            confidence = sum(word.get("conf", 0) for word in final["result"]) / len(final["result"])
        duration = len(audio) / 2 / sample_rate
        return SpeechResult(text=text, engine=self.name, confidence=confidence, duration_s=duration,
                            raw=json.dumps(final, ensure_ascii=False))


class WhisperCppSTT(BaseSTT):
    name = "whisper_cpp"

    def __init__(self, binary: Path | None, model: Path | None) -> None:
        self.binary = binary
        self.model = model
        if binary and Path(binary).exists() and model and Path(model).exists():
            self.available = True
            self.reason = "whisper.cpp pronto"
        else:
            self.reason = ("whisper.cpp não configurado (informe voice.stt.whisper_cpp_binary "
                           "e voice.stt.whisper_cpp_model nas configurações)")

    def transcribe(self, audio: bytes, sample_rate: int = 16000) -> SpeechResult:
        if not self.available:
            return SpeechResult(text="", engine=self.name, raw=self.reason)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            with wave.open(str(tmp_path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sample_rate)
                wav.writeframes(audio)
            result = subprocess.run(
                [str(self.binary), "-m", str(self.model), "-f", str(tmp_path),
                 "-l", "pt", "-nt", "-otxt", "-of", str(tmp_path.with_suffix(""))],
                capture_output=True, text=True, timeout=120,
            )
            txt_file = Path(str(tmp_path.with_suffix("")) + ".txt")
            text = txt_file.read_text(encoding="utf-8", errors="ignore").strip() if txt_file.exists() else ""
            if not text:
                text = (result.stdout or "").strip()
            txt_file.unlink(missing_ok=True)
            return SpeechResult(text=text, engine=self.name,
                                duration_s=len(audio) / 2 / sample_rate)
        except Exception as exc:
            logger.warning("whisper.cpp falhou: %s", exc)
            return SpeechResult(text="", engine=self.name, raw=str(exc))
        finally:
            tmp_path.unlink(missing_ok=True)


def build_stt(config: Config) -> BaseSTT:
    engine = str(config.get("voice.stt.engine", "auto")).lower()
    sample_rate = int(config.get("voice.stt.sample_rate", 16000))
    vosk_model = config.resolve(config.get("voice.stt.vosk_model", "models/vosk-model-small-pt-0.3"))
    vosk_alt = config.resolve(config.get("voice.stt.vosk_model_alt", "models/vosk-model-pt"))
    whisper_bin = config.get("voice.stt.whisper_cpp_binary") or ""
    whisper_model = config.resolve(config.get("voice.stt.whisper_cpp_model", "models/ggml-small.bin"))

    def make_vosk() -> BaseSTT:
        return VoskSTT(vosk_model, vosk_alt)

    def make_whisper() -> BaseSTT:
        return WhisperCppSTT(Path(whisper_bin) if whisper_bin else None, whisper_model)

    if engine == "disabled":
        return DisabledSTT("reconhecimento de voz desativado nas configurações")
    if engine == "vosk":
        return make_vosk()
    if engine == "whisper_cpp":
        return make_whisper()

    # auto: prefere Vosk (leve e rápido) e cai para whisper.cpp
    vosk = make_vosk()
    if vosk.available:
        return vosk
    whisper = make_whisper()
    if whisper.available:
        return whisper
    disabled = DisabledSTT(
        f"{vosk.reason.rstrip('.')}. {whisper.reason.rstrip('.')}. "
        "Você pode digitar os comandos normalmente."
    )
    disabled.name = "unavailable"
    return disabled


def wav_to_pcm(data: bytes) -> tuple[bytes, int]:
    """Converte WAV (do navegador) em PCM s16le mono 16 kHz para o Vosk."""
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            channels = wav.getnchannels()
            width = wav.getsampwidth()
            rate = wav.getframerate()
            frames = wav.readframes(wav.getnframes())
    except Exception:
        return data, 16000
    if width != 2:
        # conversão simples de 8 bits sem sinal para 16 bits
        if width == 1:
            frames = b"".join(int.to_bytes((b - 128) << 8, 2, "little", signed=True) for b in frames)
        else:
            return frames, rate
    if channels > 1:
        import array

        samples = array.array("h")
        samples.frombytes(frames)
        mono = array.array("h", samples[::channels])
        frames = mono.tobytes()
    if rate != 16000:
        frames = _resample_pcm(frames, rate, 16000)
    return frames, 16000


def _resample_pcm(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Reamostragem linear (suficiente para reconhecimento de fala)."""
    import array

    src = array.array("h")
    src.frombytes(pcm)
    if not src:
        return pcm
    ratio = dst_rate / src_rate
    out_len = int(len(src) * ratio)
    out = array.array("h", [0] * out_len)
    for i in range(out_len):
        pos = i / ratio
        idx = int(pos)
        frac = pos - idx
        s0 = src[idx] if idx < len(src) else 0
        s1 = src[idx + 1] if idx + 1 < len(src) else s0
        out[i] = int(s0 + (s1 - s0) * frac)
    return out.tobytes()
