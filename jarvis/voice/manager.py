"""Coordenação da voz: transcrição, síntese, palavra de ativação e interrupção."""
from __future__ import annotations

import logging

from ..core.config import Config
from . import wake
from .stt import BaseSTT, SpeechResult, build_stt, wav_to_pcm
from .tts import BaseTTS, build_tts

logger = logging.getLogger("jarvis.voice")


class VoiceManager:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.stt: BaseSTT = build_stt(config)
        self.tts: BaseTTS = build_tts(config)
        self.microphone_enabled = bool(config.get("security.microphone_enabled", True))
        self.speaking = False
        self.interrupted = False

    # ------------------------------------------------------------- reconhecer
    @property
    def sample_rate(self) -> int:
        return int(self.config.get("voice.stt.sample_rate", 16000))

    def transcribe(self, audio: bytes, content_type: str = "audio/wav") -> SpeechResult:
        if not self.microphone_enabled:
            return SpeechResult(text="", engine="muted", raw="microfone desativado")
        if not self.stt.available:
            return SpeechResult(text="", engine=self.stt.name, raw=self.stt.reason)
        pcm = audio
        rate = self.sample_rate
        if content_type.startswith("audio/wav") or audio[:4] == b"RIFF":
            pcm, rate = wav_to_pcm(audio)
        result = self.stt.transcribe(pcm, rate)
        if result.text:
            logger.info("transcrição (%s): %s", result.engine, result.text)
        return result

    # ---------------------------------------------------------------- sintetizar
    def synthesize(self, text: str) -> dict:
        if not text:
            return {"audio": None, "engine": "none", "use_browser": False}
        engine = str(self.config.get("voice.tts.engine", "auto")).lower()
        if engine == "disabled":
            return {"audio": None, "engine": "disabled", "use_browser": False}
        audio = self.tts.synthesize(text)
        if audio:
            return {"audio": audio, "engine": self.tts.name, "use_browser": False}
        use_browser = isinstance(self.tts, type(None)) or self.tts.name == "browser" or \
            bool(self.config.get("voice.tts.prefer_browser", True))
        return {"audio": None, "engine": self.tts.name, "use_browser": use_browser}

    def stop_speaking(self) -> None:
        self.interrupted = True
        self.speaking = False

    def begin_speaking(self) -> None:
        self.speaking = True
        self.interrupted = False

    def end_speaking(self) -> None:
        self.speaking = False

    # ------------------------------------------------------------ palavra-chave
    def wake_detected(self, text: str) -> bool:
        if not self.config.get("voice.wake_word.enabled", True):
            return False
        return wake.detect(text, float(self.config.get("voice.wake_word.sensitivity", 0.78)))

    def strip_wake(self, text: str) -> str:
        return wake.strip(text)

    def greeting(self) -> str:
        return str(self.config.get("voice.wake_word.greeting", "Pois não?"))

    # ------------------------------------------------------------------ estado
    def reload(self) -> None:
        self.stt = build_stt(self.config)
        self.tts = build_tts(self.config)

    def set_microphone(self, enabled: bool) -> None:
        self.microphone_enabled = enabled
        self.config.set("security.microphone_enabled", enabled)

    def status(self) -> dict:
        return {
            "stt": self.stt.status(),
            "tts": {**self.tts.status(),
                    "rate": float(self.config.get("voice.tts.rate", 1.0) or 1.0),
                    "pitch": float(self.config.get("voice.tts.pitch", 0.95) or 0.95),
                    "browser_voice": str(self.config.get("voice.tts.browser_voice", "") or ""),
                    "volume": float(self.config.get("voice.tts.volume", 0.9) or 0.9)},
            "microphone_enabled": self.microphone_enabled,
            "wake_word": {
                "enabled": bool(self.config.get("voice.wake_word.enabled", True)),
                "words": self.config.get("voice.wake_word.words", ["jarvis"]),
                "greeting": self.greeting(),
            },
            "barge_in": bool(self.config.get("voice.barge_in.enabled", True)),
            "sample_rate": self.sample_rate,
            "offline": self.tts.name != "edge",
        }
