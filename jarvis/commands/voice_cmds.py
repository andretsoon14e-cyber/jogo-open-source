"""Controle de voz: microfone, palavra de ativação e síntese."""
from __future__ import annotations

from ..nlu.engine import command
from .base import Context
from .helpers import ok


def _negated(ctx) -> bool:
    """Detecta ordens de desligar/desativar sem depender da conjugação exata."""
    text = ctx.norm
    return any(text.startswith(prefix) or f" {prefix}" in text
               or any(word.startswith(prefix) for word in text.split())
               for prefix in ("desativ", "deslig", "parar", "mutar", "silenciar", "tirar",
                              "silenci", "silenc", "quiet", "calad", "mud"))


@command("voice.microphone",
         must=[["microfone"]],
         optional=[["desligar", "ativar", "ligar", "agora"]],
         category="voz",
         description="Liga ou desliga a escuta pelo microfone",
         examples=["Desliga o microfone", "Ativa o microfone"],
         priority=4)
def microphone(ctx: Context):
    enabled = not _negated(ctx)
    ctx.voice.set_microphone(enabled)
    ctx.assistant.bus.emit("voice", ctx.voice.status())
    message = ("Microfone ativado. Pode falar quando quiser." if enabled
               else "Microfone desativado. Continuo disponível pelo campo de texto.")
    return ok(ctx, message, microphone_enabled=enabled)


@command("voice.wake_word",
         must=[["palavra"], ["ativacao"]],
         extra_patterns=[{"must": [["ativacao"], ["automatica"]]}],
         optional=[["desligar", "ativar", "jarvis"]],
         category="voz",
         description="Liga/desliga a escuta da palavra de ativação",
         examples=["Desativa a palavra de ativação"],
         priority=5)
def wake_word(ctx: Context):
    enabled = not _negated(ctx)
    ctx.config.set("voice.wake_word.enabled", enabled)
    ctx.assistant.bus.emit("voice", ctx.voice.status())
    return ok(ctx, ("Palavra de ativação ativada. Chame “Jarvis” quando precisar." if enabled
                    else "Palavra de ativação desativada. Use o botão do microfone ou o campo de texto."),
              wake_word_enabled=enabled)


@command("voice.tts",
         must=[["voz"], ["desligar", "ativar", "falar", "silenciar"]],
         extra_patterns=[{"must": [["modo"], ["silencioso", "silenciosa", "mudo", "calado"]],
                          "optional": [["ficar"]]},
                         {"must": [["ficar"], ["quieto", "quieta", "calado", "calada"]]}],
         category="voz",
         description="Liga ou desliga a voz do assistente",
         examples=["Desliga sua voz", "Ativa a voz"],
         priority=4)
def tts(ctx: Context):
    if _negated(ctx):
        ctx.config.set("voice.tts.engine", "disabled")
        ctx.assistant.voice.reload()
        ctx.assistant.bus.emit("voice", ctx.voice.status())
        return ok(ctx, "Voz desativada. Vou responder apenas por texto.", speak=False, tts_enabled=False)
    ctx.config.set("voice.tts.engine", "auto")
    ctx.assistant.voice.reload()
    ctx.assistant.bus.emit("voice", ctx.voice.status())
    return ok(ctx, "Voz reativada com o melhor motor local disponível.", tts_enabled=True)


@command("voice.stop",
         must=[["cancelar"]],
         extra_patterns=[{"must": [["parar"]]},
                         {"must": [["para", "pare"], ["voz"]]},
                         {"must": [["pare"]], "optional": [["agora", "isso"]]}],
         optional=[["isso", "tudo", "agora"]],
         category="voz",
         description="Interrompe a fala e cancela ações pendentes",
         examples=["Jarvis, pare"],
         priority=6)
def stop(ctx: Context):
    ctx.voice.stop_speaking()
    ctx.assistant.bus.emit("stop", {"reason": "voz do usuário"})
    pending = ctx.permissions.latest_pending()
    if pending:
        ctx.permissions.resolve(pending.id, approved=False)
        return ok(ctx, "Parei. Ação pendente cancelada; nada foi alterado.", speak=False)
    return ok(ctx, "Parei.", speak=False)


@command("voice.repeat",
         must=[["repetir"]],
         optional=[["isso", "ultimo", "que", "disse"]],
         category="voz",
         description="Repete a última resposta",
         examples=["Repete o que você disse"],
         priority=4)
def repeat(ctx: Context):
    last = [row for row in ctx.db.recent_conversations(limit=6) if row["role"] == "assistant"]
    if not last:
        return ok(ctx, "Ainda não tenho uma resposta anterior para repetir.")
    return ok(ctx, last[-1]["text"])
