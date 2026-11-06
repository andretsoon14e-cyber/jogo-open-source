"""Ações de energia: desligar, reiniciar, suspender, cancelar.

Toda chamada destrutiva passa pelo módulo de segurança (nível 3) antes de chegar aqui.
"""
from __future__ import annotations

import shutil
import subprocess

from .platform import IS_LINUX, IS_MAC, IS_WINDOWS, lock_screen


def _run(cmd: list[str]) -> tuple[bool, str]:
    try:
        subprocess.run(cmd, check=True, timeout=15, capture_output=True)
        return True, "comando enviado ao sistema"
    except FileNotFoundError:
        return False, f"o utilitário '{cmd[0]}' não está disponível neste sistema"
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode(errors="ignore").strip()
        return False, f"o sistema recusou a operação: {stderr or exc}"
    except Exception as exc:
        return False, f"falha ao executar: {exc}"


def shutdown(delay_s: int = 0) -> tuple[bool, str]:
    if IS_WINDOWS:
        ok, _ = _run(["shutdown", "/s", "/t", str(max(0, delay_s))])
        return (True, f"desligamento agendado para daqui a {delay_s} segundos" if ok and delay_s
                else (True, "desligando o computador") if ok else (False, "o Windows recusou o desligamento"))
    if IS_LINUX:
        if delay_s > 0 and shutil.which("shutdown"):
            ok, msg = _run(["shutdown", "-h", f"+{max(1, delay_s // 60)}"])
            return (True, f"desligamento agendado para daqui a {delay_s // 60} minuto(s)" if ok else (False, msg))
        ok, msg = _run(["systemctl", "poweroff"])
        return (True, "desligando o computador") if ok else (False, msg)
    if IS_MAC:
        ok, msg = _run(["osascript", "-e", 'tell app "System Events" to shut down'])
        return (True, "desligando o computador") if ok else (False, msg)
    return False, "desligamento não suportado neste sistema"


def restart(delay_s: int = 0) -> tuple[bool, str]:
    if IS_WINDOWS:
        ok, _ = _run(["shutdown", "/r", "/t", str(max(0, delay_s))])
        return (True, "reinício agendado") if ok else (False, "o Windows recusou o reinício")
    if IS_LINUX:
        ok, msg = _run(["systemctl", "reboot"])
        return (True, "reiniciando o computador") if ok else (False, msg)
    if IS_MAC:
        ok, msg = _run(["osascript", "-e", 'tell app "System Events" to restart'])
        return (True, "reiniciando o computador") if ok else (False, msg)
    return False, "reinício não suportado neste sistema"


def sleep() -> tuple[bool, str]:
    if IS_WINDOWS:
        ok, msg = _run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
        return (True, "coloquei o computador em suspensão") if ok else (False, msg)
    if IS_LINUX:
        for cmd in (["systemctl", "suspend"], ["pm-suspend"], ["loginctl", "suspend"]):
            if shutil.which(cmd[0]):
                ok, msg = _run(cmd)
                if ok:
                    return True, "coloquei o computador em suspensão"
        return False, "nenhum mecanismo de suspensão disponível"
    if IS_MAC:
        ok, msg = _run(["pmset", "sleepnow"])
        return (True, "coloquei o computador em suspensão") if ok else (False, msg)
    return False, "suspensão não suportada neste sistema"


def lock() -> tuple[bool, str]:
    return lock_screen()


def cancel_scheduled() -> tuple[bool, str]:
    if IS_WINDOWS:
        ok, msg = _run(["shutdown", "/a"])
        return (True, "cancelei o desligamento agendado") if ok else (False, "não havia desligamento agendado")
    ok, msg = _run(["shutdown", "-c"])
    return (True, "cancelei o desligamento agendado") if ok else (False, msg)


ACTIONS = {
    "shutdown": shutdown,
    "restart": restart,
    "sleep": sleep,
    "lock": lock,
}
