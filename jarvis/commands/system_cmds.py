"""Comandos do computador: desempenho, disco, energia, volume e inicialização."""
from __future__ import annotations

from datetime import datetime

from ..core.response import Response
from ..nlu import extract
from ..nlu.engine import command
from ..system import power, sysinfo, volume
from ..system.platform import IS_WINDOWS, set_startup, startup_status
from .base import Context
from .helpers import ask_confirmation, err, format_when, ok


@command("system.uptime",
         must=[["tempo"], ["ligado", "ligada", "ligados"]],
         extra_patterns=[{"must": [["desde"]]},
                         {"must": [["uptime"]]},
                         {"must": [["quanto"], ["tempo"]]}],
         category="sistema",
         description="Informa há quanto tempo o computador está ligado",
         examples=["Há quanto tempo o computador está ligado?"],
         priority=3)
def uptime(ctx: Context):
    data = sysinfo.snapshot()
    seconds = int(data.get("uptime_seconds") or 0)
    if seconds <= 0:
        return err(ctx, "Não consegui consultar o tempo de atividade nesta máquina.")
    dias, resto = divmod(seconds, 86400)
    horas, resto = divmod(resto, 3600)
    minutos = resto // 60
    partes = []
    if dias:
        partes.append(f"{dias} dia{'s' if dias > 1 else ''}")
    if horas:
        partes.append(f"{horas} hora{'s' if horas > 1 else ''}")
    if minutos and not dias:
        partes.append(f"{minutos} minuto{'s' if minutos > 1 else ''}")
    return ok(ctx, "O computador está ligado há " + ", ".join(partes or ["menos de um minuto"]) + ".",
              uptime_seconds=seconds)


@command("system.status",
         must=[["desempenho"]],
         extra_patterns=[{"must": [["como"], ["esta"], ["computador", "maquina"]]},
                         {"must": [["como"], ["esta"], ["memoria", "processador"]]},
                         {"must": [["status"]]},
                         {"must": [["situacao"]]},
                         {"must": [["temperatura"], ["processador", "cpu", "computador", "maquina"]]},
                         {"must": [["uso"], ["processador", "cpu", "memoria", "ram", "disco"]]},
                         {"must": [["quanta", "quanto", "quantos"], ["memoria", "ram", "livre"]]},
                         {"must": [["desempenho"]]}],
         optional=[["computador", "agora", "como"]],
         category="sistema",
         description="Relata CPU, memória, disco e temperatura reais",
         examples=["Jarvis, como está o desempenho do computador?"],
         priority=2)
def status(ctx: Context):
    data = sysinfo.snapshot()
    text = sysinfo.summary_text(data)
    tips = sysinfo.health_advice(data)
    if tips:
        text += " Observação: " + " ".join(tips)
    return ok(ctx, text, system=data)


@command("system.disk",
         must=[["disco"], ["espaco", "livre", "quanto", "tem"]],
         extra_patterns=[{"must": [["espaco"]], "optional": [["disco", "livre"]]}],
         category="sistema",
         description="Informa espaço livre em disco",
         examples=["Quanto espaço tem no disco?"],
         priority=3)
def disk(ctx: Context):
    data = sysinfo.snapshot()
    if not data["disks"]:
        return err(ctx, "não consegui ler as unidades de disco")
    parts = []
    for item in data["disks"][:4]:
        parts.append(f"{item['mount']}: {item['free_gb']} GB livres de {item['total_gb']} GB "
                     f"({item['percent']}% em uso)")
    return ok(ctx, "Armazenamento — " + ". ".join(parts) + ".", disks=data["disks"])


@command("system.processes",
         must=[["processo"]],
         optional=[["computador", "abertos", "rodando", "quais"]],
         category="sistema",
         description="Lista os programas em execução",
         examples=["Quais processos estão rodando?"],
         priority=2)
def processes(ctx: Context):
    from ..system.platform import running_apps

    apps = running_apps(12)
    if not apps:
        return err(ctx, "não consegui listar os processos")
    lines = [f"{app['name']} ({app['memory_mb']} MB)" for app in apps]
    text = ("Programas em execução, ordenados por memória: " + "; ".join(lines) +
            ". Diga “fecha” seguido do nome para encerrar algum.")
    return ok(ctx, text, apps=apps)


@command("system.volume.set",
         must=[["volume"], ["aumentar", "diminuir", "colocar", "definir", "em"]],
         extra_patterns=[{"must": [["aumentar"], ["volume"]]},
                         {"must": [["diminuir"], ["volume"]]},
                         {"must": [["colocar"], ["volume"]]}],
         optional=[["computador", "som", "para", "em"]],
         extract_names=["number"],
         category="sistema",
         description="Ajusta, aumenta ou diminui o volume",
         examples=["Coloca o volume em 40", "Aumenta o volume", "Abaixa o volume para 20"],
         priority=3)
def set_volume(ctx: Context):
    text = ctx.norm
    if "silenciar" in text:
        ok_, message = volume.mute()
        return ok(ctx, message) if ok_ else err(ctx, message)
    number = ctx.slots.get("number")
    if "aumentar" in text:
        success, message = volume.change_volume(number or 10)
    elif "diminuir" in text:
        success, message = volume.change_volume(-(number or 10))
    else:
        if number is None:
            return ok(ctx, "Diga o nível desejado, por exemplo: “volume em 40”.")
        success, message = volume.set_volume(number)
    current = volume.get_volume()
    suffix = f" O volume atual é {current}%." if current is not None else ""
    return ok(ctx, message + suffix, volume=current) if success else err(ctx, message)


@command("system.volume.mute",
         must=[["silenciar"]],
         category="sistema",
         description="Silencia o som do sistema",
         examples=["Jarvis, silencia o som"],
         priority=4)
def mute(ctx: Context):
    success, message = volume.mute()
    return ok(ctx, message) if success else err(ctx, message)


@command("system.power",
         must=[["desligar", "reiniciar", "suspender"]],
         optional=[["computador", "agora", "ja"]],
         extract_names=["duration"],
         level=3,
         category="sistema",
         description="Desliga, reinicia ou suspende o computador",
         examples=["Desliga o computador", "Reinicia o computador",
                   "Desliga o computador daqui a 30 minutos"],
         priority=2,
         gate=False)
def power_action(ctx: Context):
    text = ctx.norm
    duration = extract.parse_duration(ctx.text)
    if "reiniciar" in text:
        action, label = "restart", "reiniciar o computador"
    elif "suspender" in text:
        action, label = "sleep", "colocar o computador em suspensão"
    else:
        action, label = "shutdown", "desligar o computador"

    if duration and duration > 5:
        fire_at = datetime.now().timestamp() + duration
        minutes = max(1, duration // 60)

        def schedule():
            ctx.db.add_schedule(
                label=f"{label} (programado por voz)",
                action=f"system.{action}",
                when_at=fire_at,
                payload={"mode": action},
            )
            ctx.assistant.bus.emit("notification", {
                "title": "Agendamento criado",
                "message": f"{label} em {minutes} minuto(s)",
            })
            return Response(reply=f"Agendado: vou {label} em {minutes} minuto(s). "
                                  "Diga “cancela o desligamento” se mudar de ideia.",
                            intent="system.power", source=ctx.source)

        if ctx.dry_run:
            return Response(reply=f"Agendarei para daqui a {minutes} minuto(s): {label}.",
                            intent="system.power", source=ctx.source)
        return ask_confirmation(ctx, f"agendar para daqui a {minutes} minuto(s): {label}",
                               3, schedule,
                               preview={"ação": label, "quando": format_when(fire_at)})

    def run():
        fn = power.ACTIONS[action]
        success, message = fn()
        if success:
            ctx.assistant.audit.record(f"power.{action}", message, level=3, confirmed=True)
            return Response(reply=ctx.personality.confirmed(label), intent="system.power",
                            source=ctx.source)
        return Response(reply=ctx.personality.error(message), intent="system.power",
                        error=True, source=ctx.source)

    if ctx.dry_run:
        return Response(reply=f"Executarei: {label}.", intent="system.power", source=ctx.source)
    return ask_confirmation(ctx, label, 3, run, preview={"ação": label, "imediato": True})


@command("system.power.cancel",
         must=[["cancelar"], ["desligar", "reiniciar", "desligamento"]],
         category="sistema",
         description="Cancela desligamento/reinício agendado",
         examples=["Cancela o desligamento"],
         priority=5)
def cancel_power(ctx: Context):
    success, message = power.cancel_scheduled()
    return ok(ctx, message) if success else err(ctx, message)


@command("system.lock",
         must=[["bloquear"]],
         optional=[["computador", "tela", "pc"]],
         level=2,
         category="sistema",
         description="Bloqueia a tela do computador",
         examples=["Bloqueia o computador"],
         gate=False)
def lock(ctx: Context):
    def run():
        success, message = power.lock()
        return (ok(ctx, message) if success else err(ctx, message))

    if ctx.dry_run:
        return Response(reply="Vou bloquear a tela do computador.", intent="system.lock",
                        source=ctx.source)
    return ask_confirmation(ctx, "bloquear a tela do computador", 2, run)


@command("system.startup",
         must=[["abrir", "iniciar"], ["windows", "junto", "automatico"]],
         extra_patterns=[{"must": [["inicializacao"]]}, {"must": [["autostart"]]}],
         optional=[["desativar", "ativar"]],
         level=3,
         category="configuracao",
         description="Liga/desliga a inicialização automática com o sistema",
         examples=["Iniciar com Windows", "Desativa a inicialização automática"],
         priority=4,
         gate=False)
def startup(ctx: Context):
    enable = not any(word.startswith(("desativ", "deslig", "remov", "tirar", "parar"))
                     for word in ctx.norm.split())
    def run():
        success, message = set_startup(enable)
        return ok(ctx, message, enabled=enable) if success else err(ctx, message)

    if ctx.dry_run:
        return Response(reply=f"{'Ativarei' if enable else 'Desativarei'} a inicialização automática.",
                        intent="system.startup", source=ctx.source)
    return ask_confirmation(ctx, f"{'ativar' if enable else 'desativar'} a inicialização automática com o sistema",
                            3, run, preview={"iniciar_com_sistema": enable,
                                             "estado_atual": startup_status()})
