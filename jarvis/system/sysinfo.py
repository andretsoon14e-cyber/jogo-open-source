"""Informações reais do computador (psutil): CPU, RAM, disco, temperatura, bateria."""
from __future__ import annotations

import os
import platform
import socket
import time
from datetime import datetime, timedelta

import psutil

from .platform import IS_LINUX, IS_MAC, IS_WINDOWS, os_name

# primeira leitura serve de referência para as medições seguintes sem bloquear
try:
    psutil.cpu_percent(interval=None)
except Exception:  # pragma: no cover
    pass


def _cpu_percent() -> float:
    """Leitura não bloqueante: percentual desde a chamada anterior."""
    return psutil.cpu_percent(interval=None)


def _temperatures() -> list[dict]:
    temps: list[dict] = []
    try:
        sensors = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
        for chip, entries in (sensors or {}).items():
            for entry in entries:
                if entry.current:
                    temps.append({
                        "chip": chip,
                        "label": entry.label or chip,
                        "current": round(entry.current, 1),
                        "high": entry.high,
                        "critical": entry.critical,
                    })
    except Exception:
        pass
    return temps[:6]


def _disks() -> list[dict]:
    disks = []
    seen = set()
    for part in psutil.disk_partitions(all=False):
        if IS_LINUX and not part.device.startswith("/dev"):
            continue
        if part.mountpoint in seen:
            continue
        seen.add(part.mountpoint)
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (PermissionError, OSError):
            continue
        disks.append({
            "device": part.device,
            "mount": part.mountpoint,
            "total_gb": round(usage.total / 1073741824, 1),
            "used_gb": round(usage.used / 1073741824, 1),
            "free_gb": round(usage.free / 1073741824, 1),
            "percent": usage.percent,
        })
    return disks


def _battery() -> dict | None:
    try:
        battery = psutil.sensors_battery()
        if not battery:
            return None
        return {
            "percent": round(battery.percent, 1),
            "plugged": battery.power_plugged,
            "secs_left": battery.secsleft if battery.secsleft not in (-1, -2) else None,
        }
    except Exception:
        return None


def _top_processes(limit: int = 5) -> list[dict]:
    procs = []
    for proc in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
        try:
            info = proc.info
            mem = info.get("memory_info").rss / 1048576 if info.get("memory_info") else 0
            procs.append({
                "name": (info.get("name") or "?").replace(".exe", ""),
                "cpu": round(info.get("cpu_percent") or 0, 1),
                "memory_mb": round(mem, 1),
            })
        except Exception:
            continue
    procs.sort(key=lambda p: p["memory_mb"], reverse=True)
    return procs[:limit]


def uptime() -> timedelta:
    return timedelta(seconds=max(0, time.time() - psutil.boot_time()))


def snapshot() -> dict:
    cpu = _cpu_percent()
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    freq = None
    try:
        freq_info = psutil.cpu_freq()
        freq = round(freq_info.current) if freq_info else None
    except Exception:
        pass
    return {
        "os": os_name(),
        "os_version": f"{platform.system()} {platform.release()}",
        "hostname": socket.gethostname(),
        "user": os.environ.get("USERNAME") or os.environ.get("USER") or "",
        "cpu": {
            "percent": round(cpu, 1),
            "cores_physical": psutil.cpu_count(logical=False),
            "cores_logical": psutil.cpu_count(logical=True),
            "freq_mhz": freq,
            "load_avg": [round(x, 2) for x in os.getloadavg()] if hasattr(os, "getloadavg") and not IS_WINDOWS else None,
        },
        "memory": {
            "total_gb": round(mem.total / 1073741824, 1),
            "used_gb": round(mem.used / 1073741824, 1),
            "available_gb": round(mem.available / 1073741824, 1),
            "percent": mem.percent,
        },
        "swap": {"total_gb": round(swap.total / 1073741824, 1), "percent": swap.percent},
        "disks": _disks(),
        "temperatures": _temperatures(),
        "battery": _battery(),
        "uptime_seconds": int(uptime().total_seconds()),
        "boot_time": psutil.boot_time(),
        "processes": len(psutil.pids()),
        "top_processes": _top_processes(),
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


def _human_uptime(delta: timedelta) -> str:
    total = int(delta.total_seconds())
    days, rest = divmod(total, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    parts = []
    if days:
        parts.append(f"{days} dia{'s' if days > 1 else ''}")
    if hours:
        parts.append(f"{hours} hora{'s' if hours > 1 else ''}")
    if minutes and not days:
        parts.append(f"{minutes} minuto{'s' if minutes > 1 else ''}")
    return " e ".join(parts) if parts else "menos de um minuto"


def summary_text(data: dict | None = None) -> str:
    data = data or snapshot()
    cpu = data["cpu"]
    mem = data["memory"]
    fisicos = cpu["cores_physical"]
    logicos = cpu["cores_logical"]
    nucleos = f"{fisicos} núcleo{'s' if fisicos != 1 else ''} físico{'s' if fisicos != 1 else ''}"
    linhas_cpu = f"Processador em {cpu['percent']}% de uso ({nucleos}, {logicos} lógico{'s' if logicos != 1 else ''})"
    lines = [
        linhas_cpu,
        f"Memória RAM em {mem['percent']}% — {mem['used_gb']} GB de {mem['total_gb']} GB",
    ]
    if data["disks"]:
        disk = data["disks"][0]
        lines.append(f"Disco {disk['mount']}: {disk['free_gb']} GB livres de {disk['total_gb']} GB "
                     f"({disk['percent']}% em uso)")
    if data["temperatures"]:
        temp = data["temperatures"][0]
        lines.append(f"Temperatura: {temp['current']}°C ({temp['label']})")
    if data["battery"]:
        bat = data["battery"]
        state = "na tomada" if bat["plugged"] else "na bateria"
        lines.append(f"Bateria em {bat['percent']}%, {state}")
    lines.append(f"Tempo ligado: {_human_uptime(uptime())} — {data['processes']} processos ativos")
    return ". ".join(lines) + "."


def health_advice(data: dict) -> list[str]:
    tips: list[str] = []
    if data["memory"]["percent"] >= 85:
        tips.append("A memória está quase no limite; fechar programas em segundo plano ajudaria.")
    if data["cpu"]["percent"] >= 85:
        tops = data.get("top_processes", [])[:2]
        names = ", ".join(p["name"] for p in tops) or "alguns processos"
        tips.append(f"O processador está muito ocupado — os maiores consumidores são {names}.")
    for disk in data["disks"]:
        if disk["percent"] >= 90:
            tips.append(f"O disco {disk['mount']} está com {disk['percent']}% de uso. "
                        "Posso localizar os arquivos maiores, se desejar.")
    for temp in data["temperatures"]:
        if temp.get("high") and temp["current"] >= temp["high"] * 0.95:
            tips.append(f"A temperatura de {temp['label']} está alta ({temp['current']}°C).")
    if data["battery"] and not data["battery"]["plugged"] and data["battery"]["percent"] < 20:
        tips.append("A bateria está baixa; recomendo conectar o carregador.")
    return tips
