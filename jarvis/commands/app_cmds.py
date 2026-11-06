"""Programas, pastas e janelas."""
from __future__ import annotations

import os
from pathlib import Path

from ..core.response import Response
from ..nlu.engine import command
from ..system import files as filetools
from ..system import platform as sysplat
from .base import Context
from .helpers import ask_confirmation, err, ok


def _target(ctx: Context) -> str:
    residual = ctx.residual().strip()
    # remove verbos residuais que restam após a normalização
    for word in ("abrir", "fechar", "minimizar", "maximizar", "programa", "aplicativo",
                 "pasta", "o", "a", "meu", "minha"):
        residual = residual.replace(word, " ")
    return " ".join(residual.split())


@command("app.open",
         must=[["abrir"]],
         optional=[["programa", "navegador", "pasta", "agora", "favor"]],
         category="aplicativos",
         description="Abre um programa ou uma pasta",
         examples=["Jarvis, abre o navegador", "Abre o Discord", "Abre a pasta de downloads"],
         priority=1)
def open_app(ctx: Context):
    target = _target(ctx)
    if not target:
        return ok(ctx, "O que devo abrir? Por exemplo: “abre o navegador” ou “abre a pasta de downloads”.")

    aliases = ctx.config.get("system.apps", {}) or {}
    folders = ctx.config.get("system.folders", {}) or {}

    # 1) pasta conhecida
    folder = filetools.resolve_folder(target, folders, ctx.permissions)
    if folder and folder.exists():
        success, message = sysplat.open_path(folder)
        if success:
            return ok(ctx, f"{message.capitalize()}, {ctx.personality.title() or 'senhor'}.",
                      opened=str(folder), kind="pasta")
        return err(ctx, message)

    # 2) arquivo existente
    candidate = Path(os.path.expanduser(target))
    if candidate.exists():
        try:
            safe = ctx.permissions.check_path(candidate)
            success, message = sysplat.open_path(safe)
            return ok(ctx, message.capitalize()) if success else err(ctx, message)
        except Exception as exc:
            return err(ctx, str(exc))

    # 3) programa configurado / executável no sistema
    success, message = sysplat.open_app(target, aliases, folders)
    if success:
        ctx.assistant.audit.record("app.open", target, level=1)
        return ok(ctx, f"{ctx.personality.ack()} {message.capitalize()}.",
                  opened=target, kind="programa")
    known = ", ".join(list(aliases.keys())[:8])
    return err(ctx, f"{message}. Programas que já conheço: {known}. "
                    "Você pode adicionar novos em system.apps, nas configurações.")


@command("app.close",
         must=[["fechar"]],
         optional=[["programa", "navegador", "agora", "tudo"]],
         level=2,
         category="aplicativos",
         description="Fecha um programa aberto",
         examples=["Jarvis, fecha o navegador", "Fecha o Discord"],
         priority=2,
         gate=False)
def close_app(ctx: Context):
    target = _target(ctx)
    if not target or target in ("isso", "esse", "esta", "janela"):
        windows = sysplat.list_windows()
        if windows:
            title = windows[0]["title"]
            target = title.split("-")[-1].strip() or title
        else:
            return ok(ctx, "Qual programa devo fechar? Diga o nome, por exemplo: “fecha o Chrome”.")
    if target.lower().replace(".exe", "") in sysplat.CRITICAL_PROCESSES:
        return err(ctx, "esse processo é essencial para o sistema e eu não vou encerrá-lo")

    def run():
        success, message = sysplat.close_app(target)
        if success:
            ctx.assistant.audit.record("app.close", target, level=2, confirmed=True)
            return ok(ctx, f"{message.capitalize()}.", closed=target)
        return err(ctx, message)

    if ctx.dry_run:
        return Response(reply=f"Vou encerrar os processos de {target}.", intent="app.close",
                        source=ctx.source)
    return ask_confirmation(ctx, f"fechar o programa “{target}” (pode haver dados não salvos)",
                            2, run, preview={"programa": target})


@command("window.minimize",
         must=[["minimizar"]],
         optional=[["janela", "programa", "tudo", "tela"]],
         category="aplicativos",
         description="Minimiza uma janela ou todas",
         examples=["Minimiza o navegador", "Minimiza tudo"])
def minimize(ctx: Context):
    target = _target(ctx)
    if not target or "tudo" in ctx.norm:
        success, message = sysplat.minimize_all()
    else:
        success, message = sysplat.window_action(target, "minimize")
    return ok(ctx, message.capitalize()) if success else err(ctx, message)


@command("window.maximize",
         must=[["maximizar"]],
         optional=[["janela", "programa", "tela"]],
         category="aplicativos",
         description="Maximiza uma janela",
         examples=["Maximiza o Discord"])
def maximize(ctx: Context):
    target = _target(ctx)
    if not target:
        return ok(ctx, "Qual janela devo maximizar?")
    success, message = sysplat.window_action(target, "maximize")
    return ok(ctx, message.capitalize()) if success else err(ctx, message)


@command("window.switch",
         must=[["trocar", "alternar"]],
         optional=[["janela", "programa", "aplicativo"]],
         category="aplicativos",
         description="Alterna entre janelas (Alt+Tab)",
         examples=["Troca de janela", "Alterna entre os programas"])
def switch(ctx: Context):
    success, message = sysplat.switch_window()
    return ok(ctx, message.capitalize()) if success else err(ctx, message)


@command("app.list",
         must=[["programa"], ["abertos", "rodando", "executando", "quais"]],
         extra_patterns=[{"must": [["janela"], ["aberta", "abertas", "quais"]]}],
         category="aplicativos",
         description="Lista programas abertos",
         examples=["Quais programas estão abertos?"],
         priority=4)
def list_apps(ctx: Context):
    apps = sysplat.running_apps(15)
    if not apps:
        return err(ctx, "não encontrei programas em execução")
    text = "Programas abertos: " + "; ".join(
        f"{a['name']} ({a['memory_mb']} MB)" for a in apps) + "."
    return ok(ctx, text, apps=apps)


@command("window.list",
         must=[["janelas"]],
         optional=[["abertas", "quais", "listar"]],
         category="aplicativos",
         description="Lista janelas abertas",
         examples=["Quais janelas estão abertas?"])
def list_windows(ctx: Context):
    windows = sysplat.list_windows()
    if not windows:
        return err(ctx, "não consigo enumerar janelas neste ambiente. No Windows essa função funciona "
                        "nativamente; no Linux é necessário o pacote wmctrl.")
    titles = [w["title"] for w in windows[:15]]
    return ok(ctx, "Janelas abertas: " + "; ".join(titles) + ".", windows=windows[:20])


@command("folder.open",
         must=[["pasta"], ["abrir", "mostrar", "acessar"]],
         extra_patterns=[{"must": [["abrir"], ["downloads", "desktop", "imagens", "musicas",
                                              "videos", "area de trabalho"]]}],
         optional=[["downloads", "documentos", "imagens", "desktop"]],
         category="aplicativos",
         description="Abre uma pasta do usuário",
         examples=["Abre a pasta de downloads"],
         priority=6)
def open_folder(ctx: Context):
    folders = ctx.config.get("system.folders", {}) or {}
    folder = filetools.resolve_folder(ctx.clean, folders, ctx.permissions)
    if not folder:
        return ok(ctx, "Qual pasta? Posso abrir downloads, documentos, imagens, músicas, vídeos "
                       "ou a área de trabalho.")
    success, message = sysplat.open_path(folder)
    return ok(ctx, f"{message.capitalize()}.", path=str(folder)) if success else err(ctx, message)
