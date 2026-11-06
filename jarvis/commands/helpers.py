"""Helpers compartilhados pelos comandos."""
from __future__ import annotations

from typing import Any, Callable

from ..core.response import Response
from .base import Context


def ok(ctx: Context, reply: str, **data: Any) -> Response:
    return Response(reply=reply, intent=ctx.intent, confidence=ctx.match.confidence if ctx.match else 0.0,
                    data=data, source=ctx.source)


def err(ctx: Context, reply: str, **data: Any) -> Response:
    return Response(reply=ctx.personality.error(reply), intent=ctx.intent, error=True,
                    data=data, source=ctx.source)


def unsupported(ctx: Context, what: str, alternative: str | None = None) -> Response:
    return Response(reply=ctx.personality.not_capable(what, alternative), intent=ctx.intent,
                    error=True, source=ctx.source)


def ask_confirmation(ctx: Context, description: str, level: int,
                     executor: Callable[[], Response], preview: dict | None = None) -> Response:
    """Cria uma confirmação pendente e devolve a resposta que pede autorização."""
    pending = ctx.permissions.create_pending(
        intent=ctx.intent or "action",
        description=description,
        level=level,
        executor=executor,
        preview=preview,
    )
    return Response(
        reply=ctx.personality.confirm_request(description, level),
        intent=ctx.intent,
        confidence=ctx.match.confidence if ctx.match else 0.0,
        pending=pending.public(),
        data={"preview": preview or {}},
        source=ctx.source,
    )


def human_list(items: list[str], max_items: int = 6, conjunction: str = "e") -> str:
    if not items:
        return ""
    items = [str(item) for item in items]
    if len(items) == 1:
        return items[0]
    if len(items) > max_items:
        remaining = len(items) - max_items
        items = items[:max_items] + [f"mais {remaining}"]
    return ", ".join(items[:-1]) + f" {conjunction} " + items[-1]


def format_when(ts: float | None) -> str:
    if not ts:
        return "sem data"
    from datetime import datetime

    moment = datetime.fromtimestamp(ts)
    today = datetime.now().date()
    if moment.date() == today:
        return f"hoje às {moment:%H:%M}"
    delta = (moment.date() - today).days
    if delta == 1:
        return f"amanhã às {moment:%H:%M}"
    return f"{moment:%d/%m} às {moment:%H:%M}"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
