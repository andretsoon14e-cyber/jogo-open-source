"""Controle de volume do sistema (Windows: pycaw ou PowerShell; Linux: amixer/pactl)."""
from __future__ import annotations

import shutil
import subprocess

from .platform import IS_LINUX, IS_MAC, IS_WINDOWS

try:  # opcional, melhora a precisão no Windows
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume  # type: ignore
    from ctypes import cast, POINTER
    from comtypes import CLSCTX_ALL  # type: ignore
    PYCAW_AVAILABLE = True
except Exception:  # pragma: no cover
    PYCAW_AVAILABLE = False


def _windows_volume():
    devices = AudioUtilities.GetSpeakers()
    interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return cast(interface, POINTER(IAudioEndpointVolume))


def _powershell_key(key: str, times: int = 1) -> tuple[bool, str]:
    script = (
        "$w = New-Object -ComObject WScript.Shell; "
        f"1..{max(1, times)} | ForEach-Object {{ $w.SendKeys('{key}') }}"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", script],
                       check=True, capture_output=True, timeout=15)
        return True, ""
    except Exception as exc:
        return False, str(exc)


def get_volume() -> int | None:
    if IS_WINDOWS and PYCAW_AVAILABLE:
        try:
            return round(_windows_volume().GetMasterVolumeLevelScalar() * 100)
        except Exception:
            return None
    if IS_LINUX:
        if shutil.which("pactl"):
            try:
                out = subprocess.run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"],
                                     capture_output=True, text=True, timeout=5).stdout
                import re
                match = re.search(r"(\d+)%", out)
                return int(match.group(1)) if match else None
            except Exception:
                return None
        if shutil.which("amixer"):
            try:
                out = subprocess.run(["amixer", "get", "Master"], capture_output=True, text=True, timeout=5).stdout
                import re
                match = re.search(r"\[(\d+)%\]", out)
                return int(match.group(1)) if match else None
            except Exception:
                return None
    if IS_MAC:
        try:
            out = subprocess.run(["osascript", "-e", "output volume of (get volume settings)"],
                                 capture_output=True, text=True, timeout=5).stdout
            return int(out.strip())
        except Exception:
            return None
    return None


def set_volume(percent: int) -> tuple[bool, str]:
    percent = max(0, min(100, int(percent)))
    if IS_WINDOWS and PYCAW_AVAILABLE:
        try:
            _windows_volume().SetMasterVolumeLevelScalar(percent / 100, None)
            return True, f"volume em {percent}%"
        except Exception as exc:
            return False, f"não consegui ajustar o volume: {exc}"
    if IS_WINDOWS:
        current = get_volume()
        if current is None:
            # aproximação por teclas de mídia: cada toque = 2%
            steps = max(1, abs(percent - 50) // 2)
            key = "^({VOLUME_UP})" if percent > 50 else "^({VOLUME_DOWN})"
            ok, err = _powershell_key(key, steps)
            return (True, f"ajustei o volume (aproximadamente {percent}%)" if ok
                    else (False, f"não consegui ajustar o volume: {err}"))
        delta = percent - current
        if delta == 0:
            return True, "o volume já está nesse nível"
        key = "^({VOLUME_UP})" if delta > 0 else "^({VOLUME_DOWN})"
        ok, err = _powershell_key(key, max(1, abs(delta) // 2))
        return (True, f"volume em aproximadamente {percent}%" if ok else (False, err))
    if IS_LINUX:
        if shutil.which("pactl"):
            try:
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{percent}%"],
                               check=True, capture_output=True, timeout=5)
                return True, f"volume em {percent}%"
            except Exception as exc:
                return False, f"não consegui ajustar o volume: {exc}"
        if shutil.which("amixer"):
            try:
                subprocess.run(["amixer", "-q", "sset", "Master", f"{percent}%"],
                               check=True, capture_output=True, timeout=5)
                return True, f"volume em {percent}%"
            except Exception as exc:
                return False, f"não consegui ajustar o volume: {exc}"
        return False, "não encontrei pactl nem amixer para controlar o volume"
    if IS_MAC:
        try:
            subprocess.run(["osascript", "-e", f"set volume output volume {percent}"], check=True, timeout=5)
            return True, f"volume em {percent}%"
        except Exception as exc:
            return False, f"não consegui ajustar o volume: {exc}"
    return False, "controle de volume não suportado neste sistema"


def change_volume(delta: int) -> tuple[bool, str]:
    current = get_volume()
    if current is None:
        if delta > 0:
            if IS_WINDOWS:
                ok, err = _powershell_key("^({VOLUME_UP})", 2)
                return (True, "aumentei o volume") if ok else (False, err)
            return set_volume(60)
        return set_volume(40)
    return set_volume(current + delta)


def mute() -> tuple[bool, str]:
    if IS_WINDOWS and PYCAW_AVAILABLE:
        try:
            volume = _windows_volume()
            volume.SetMute(1, None)
            return True, "som silenciado"
        except Exception as exc:
            return False, f"não consegui silenciar: {exc}"
    if IS_WINDOWS:
        ok, err = _powershell_key("^({VOLUME_MUTE})")
        return (True, "som silenciado") if ok else (False, err)
    if IS_LINUX:
        for cmd in (["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"],
                    ["amixer", "-q", "sset", "Master", "mute"]):
            if shutil.which(cmd[0]):
                try:
                    subprocess.run(cmd, check=True, capture_output=True, timeout=5)
                    return True, "som silenciado"
                except Exception:
                    continue
        return False, "não consegui silenciar"
    if IS_MAC:
        try:
            subprocess.run(["osascript", "-e", "set volume output muted true"], check=True, timeout=5)
            return True, "som silenciado"
        except Exception as exc:
            return False, str(exc)
    return False, "silenciar não é suportado neste sistema"


def unmute() -> tuple[bool, str]:
    if IS_WINDOWS and PYCAW_AVAILABLE:
        try:
            _windows_volume().SetMute(0, None)
            return True, "som reativado"
        except Exception as exc:
            return False, str(exc)
    if IS_LINUX:
        for cmd in (["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"],
                    ["amixer", "-q", "sset", "Master", "unmute"]):
            if shutil.which(cmd[0]):
                try:
                    subprocess.run(cmd, check=True, capture_output=True, timeout=5)
                    return True, "som reativado"
                except Exception:
                    continue
    if IS_MAC:
        try:
            subprocess.run(["osascript", "-e", "set volume output muted false"], check=True, timeout=5)
            return True, "som reativado"
        except Exception:
            return False, "não consegui reativar o som"
    return False, "não consegui reativar o som"
