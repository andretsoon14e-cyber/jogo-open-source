"""Integração com o sistema operacional: abrir/fechar programas, janelas, pastas.

Windows é o alvo principal; Linux/macOS têm implementações equivalentes para que
o assistente possa ser desenvolvido e testado em qualquer máquina.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

import psutil

IS_WINDOWS = sys.platform.startswith("win")
IS_LINUX = sys.platform.startswith("linux")
IS_MAC = sys.platform == "darwin"

# Processos que nunca devem ser encerrados sem extrema necessidade.
CRITICAL_PROCESSES = {
    "system", "system idle process", "csrss.exe", "wininit.exe", "winlogon.exe",
    "services.exe", "lsass.exe", "smss.exe", "explorer.exe", "dwm.exe", "svchost.exe",
    "registry", "init", "systemd", "kthreadd", "launchd", "kernel_task", "windowserver",
    "python", "python3", "python.exe", "jarvis",
}


class SystemError_(Exception):
    pass


def os_name() -> str:
    if IS_WINDOWS:
        return "Windows"
    if IS_LINUX:
        return "Linux"
    if IS_MAC:
        return "macOS"
    return sys.platform


# ------------------------------------------------------------------ programas -
def resolve_app(name: str, aliases: dict[str, str]) -> str | None:
    """Resolve apelido configurado ('navegador', 'discord') em caminho/executável."""
    key = name.strip().lower()
    if key in aliases:
        return os.path.expandvars(str(aliases[key]))
    for alias, target in aliases.items():
        if alias in key or key in alias:
            return os.path.expandvars(str(target))
    return None


def open_path(target: str | Path) -> tuple[bool, str]:
    path = Path(os.path.expandvars(str(target))).expanduser()
    try:
        if str(target).startswith(("http://", "https://")):
            webbrowser.open(str(target))
            return True, "abri o endereço no navegador padrão"
        if path.exists():
            if IS_WINDOWS:
                os.startfile(str(path))  # type: ignore[attr-defined]
            elif IS_MAC:
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"abri {path.name}"
        return False, f"não encontrei {path}"
    except Exception as exc:
        return False, f"não consegui abrir {path.name or target}: {exc}"


def launch(command: str, args: list[str] | None = None) -> tuple[bool, str]:
    """Executa um programa. Nunca usa shell=True com texto do usuário."""
    try:
        parts = command.split()
        executable = parts[0]
        extra = parts[1:] if len(parts) > 1 else []
        if args:
            extra += args
        kwargs: dict = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if IS_WINDOWS:
            kwargs["creationflags"] = 0x00000008  # DETACHED_PROCESS
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen([executable, *extra], **kwargs)
        return True, f"iniciei {Path(executable).name}"
    except FileNotFoundError:
        return False, f"o executável '{command.split()[0]}' não foi encontrado neste computador"
    except Exception as exc:
        return False, f"não consegui iniciar: {exc}"


def open_app(name: str, aliases: dict[str, str], folders: dict[str, str]) -> tuple[bool, str]:
    lowered = name.strip().lower()
    # 1) pasta configurada
    for folder_alias, folder_path in folders.items():
        if folder_alias in lowered:
            resolved = Path(os.path.expanduser(os.path.expandvars(folder_path)))
            if resolved.exists():
                return open_path(resolved)
            return False, f"a pasta '{folder_alias}' não existe neste computador"
    # 2) apelido configurado
    target = resolve_app(lowered, aliases)
    if target and target != "default_browser":
        if target.startswith(("http://", "https://")):
            return open_path(target)
        if Path(os.path.expandvars(target)).exists() or shutil.which(target.split()[0]):
            return launch(target)
        return False, f"o caminho configurado para '{name}' não existe ({target})"
    if target == "default_browser" or "navegador" in lowered or "browser" in lowered:
        webbrowser.open("https://www.google.com")
        return True, "abri o navegador padrão"
    # 3) executável direto no PATH
    if shutil.which(name):
        return launch(name)
    # 4) procura em locais comuns do Windows
    if IS_WINDOWS:
        for base in [Path("C:/Program Files"), Path("C:/Program Files (x86)"),
                     Path(os.path.expandvars("%LOCALAPPDATA%"))]:
            for exe in (base.glob(f"*/{name}*.exe") if base.exists() else []):
                return launch(str(exe))
    # 5) Windows: deixa o próprio sistema resolver (apps da Store, protocolos, .exe no PATH)
    if IS_WINDOWS:
        try:
            os.startfile(name)  # type: ignore[attr-defined]
            return True, f"iniciei {name}"
        except OSError:
            pass
    return False, f"não encontrei nenhum programa chamado '{name}'"


# ------------------------------------------------------------------- processos -
def find_processes(query: str) -> list[psutil.Process]:
    query = query.strip().lower().replace(".exe", "")
    found = []
    for proc in psutil.process_iter(["pid", "name"]):
        name = (proc.info.get("name") or "").lower().replace(".exe", "")
        if query and (query in name or name in query) and name not in CRITICAL_PROCESSES:
            found.append(proc)
    return found


def close_app(query: str, force: bool = False) -> tuple[bool, str]:
    if query.strip().lower().replace(".exe", "") in CRITICAL_PROCESSES:
        return False, "esse processo é essencial para o sistema e eu não vou encerrá-lo"
    procs = find_processes(query)
    if not procs:
        return False, f"não encontrei nenhum programa aberto com o nome '{query}'"
    closed = 0
    for proc in procs:
        try:
            proc.terminate()
            closed += 1
        except psutil.AccessDenied:
            return False, f"sem permissão para encerrar {proc.name()} — tente executar como administrador"
        except Exception:
            continue
    if not force:
        gone, alive = psutil.wait_procs(procs, timeout=4)
        for proc in alive:
            try:
                proc.kill()
            except Exception:
                pass
    return True, f"encerrei {closed} processo(s) de '{query}'"


def running_apps(limit: int = 25) -> list[dict]:
    apps = []
    for proc in psutil.process_iter(["pid", "name", "memory_info", "create_time"]):
        try:
            info = proc.info
            name = (info.get("name") or "").replace(".exe", "")
            if not name or name.lower() in CRITICAL_PROCESSES:
                continue
            apps.append({
                "pid": info["pid"],
                "name": name,
                "memory_mb": round((info["memory_info"].rss if info.get("memory_info") else 0) / 1048576, 1),
                "started": info.get("create_time"),
            })
        except Exception:
            continue
    apps.sort(key=lambda a: a["memory_mb"], reverse=True)
    return apps[:limit]


# --------------------------------------------------------------------- janelas -
def list_windows() -> list[dict]:
    """Lista janelas visíveis (Windows via ctypes; Linux via wmctrl/xdotool)."""
    if IS_WINDOWS:
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            windows: list[dict] = []

            @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            def callback(hwnd, _):
                if user32.IsWindowVisible(hwnd):
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length:
                        buf = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buf, length + 1)
                        if buf.value.strip():
                            windows.append({"hwnd": int(hwnd), "title": buf.value})
                return True

            user32.EnumWindows(callback, 0)
            return windows
        except Exception:
            return []
    if IS_LINUX and shutil.which("wmctrl"):
        try:
            out = subprocess.run(["wmctrl", "-l"], capture_output=True, text=True, timeout=5).stdout
            result = []
            for line in out.splitlines():
                parts = line.split(None, 3)
                if len(parts) == 4:
                    result.append({"hwnd": int(parts[0], 16), "title": parts[3]})
            return result
        except Exception:
            return []
    return []


def _show_window(hwnd: int, mode: int) -> tuple[bool, str]:
    if IS_WINDOWS:
        try:
            import ctypes
            ctypes.windll.user32.ShowWindow(hwnd, mode)
            ctypes.windll.user32.SetForegroundWindow(hwnd)
            return True, "janela ajustada"
        except Exception as exc:
            return False, f"não consegui ajustar a janela: {exc}"
    if IS_LINUX and shutil.which("wmctrl"):
        flag = {6: "-b add,hidden", 9: "-b remove,hidden", 3: "-b add,maximized_vert,maximized_horz"}.get(mode)
        if flag:
            subprocess.run(["wmctrl", "-i", "-r", hex(hwnd), *flag.split()], timeout=5)
            return True, "janela ajustada"
    return False, "controle de janelas não está disponível neste ambiente"


MINIMIZE, MAXIMIZE, RESTORE = 6, 3, 9


def window_action(query: str, action: str) -> tuple[bool, str]:
    windows = list_windows()
    if not windows:
        return False, ("não consigo listar as janelas neste ambiente — no Windows essa "
                       "função funciona nativamente")
    query = query.strip().lower()
    target = None
    for win in windows:
        if query and query in win["title"].lower():
            target = win
            break
    if target is None:
        for win in windows:
            if action in ("minimize", "maximize") and any(
                    word in win["title"].lower() for word in query.split()):
                target = win
                break
    if target is None:
        return False, f"não encontrei nenhuma janela aberta relacionada a '{query}'"
    mode = {"minimize": MINIMIZE, "maximize": MAXIMIZE, "restore": RESTORE}.get(action, RESTORE)
    if action == "switch":
        mode = RESTORE
    ok, message = _show_window(target["hwnd"], mode)
    return ok, message if ok else message


def minimize_all() -> tuple[bool, str]:
    if IS_WINDOWS:
        try:
            import ctypes
            ctypes.windll.user32.keybd_event(0x5B, 0, 0, 0)
            ctypes.windll.user32.keybd_event(0x44, 0, 0, 0)
            ctypes.windll.user32.keybd_event(0x44, 0, 2, 0)
            ctypes.windll.user32.keybd_event(0x5B, 0, 2, 0)
            return True, "minimizei todas as janelas"
        except Exception as exc:
            return False, f"não consegui minimizar as janelas: {exc}"
    return False, "atalho de minimizar tudo disponível apenas no Windows"


def switch_window() -> tuple[bool, str]:
    """Alt+Tab (Windows)."""
    if IS_WINDOWS:
        try:
            import ctypes
            user32 = ctypes.windll.user32
            user32.keybd_event(0x12, 0, 0, 0)   # Alt
            user32.keybd_event(0x09, 0, 0, 0)   # Tab
            user32.keybd_event(0x09, 0, 2, 0)
            user32.keybd_event(0x12, 0, 2, 0)
            return True, "alternei para a próxima janela"
        except Exception as exc:
            return False, f"não consegui alternar: {exc}"
    return False, "a troca de janelas por atalho só está disponível no Windows"


def lock_screen() -> tuple[bool, str]:
    if IS_WINDOWS:
        try:
            import ctypes
            if ctypes.windll.user32.LockWorkStation():
                return True, "bloqueei a estação de trabalho"
            return False, "o Windows não permitiu bloquear a tela"
        except Exception as exc:
            return False, f"falha ao bloquear: {exc}"
    if IS_LINUX:
        for cmd in (["loginctl", "lock-session"], ["xdg-screensaver", "lock"], ["gnome-screensaver-command", "-l"]):
            if shutil.which(cmd[0]):
                subprocess.run(cmd, check=False, timeout=5)
                return True, "bloqueei a sessão"
        return False, "nenhum mecanismo de bloqueio de tela disponível"
    if IS_MAC:
        subprocess.run(["pmset", "displaysleepnow"], check=False)
        return True, "bloqueei a tela"
    return False, "bloqueio de tela não suportado neste sistema"


# -------------------------------------------------------------------- startup --
def startup_status() -> bool:
    if IS_WINDOWS:
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ)
            try:
                winreg.QueryValueEx(key, "JARVIS")
                return True
            except FileNotFoundError:
                return False
        except Exception:
            return False
    desktop_file = Path.home() / ".config" / "autostart" / "jarvis.desktop"
    return desktop_file.exists()


def set_startup(enabled: bool, command: str | None = None) -> tuple[bool, str]:
    command = command or f'"{sys.executable}" "{Path(sys.argv[0]).resolve()}"'
    if IS_WINDOWS:
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r"Software\Microsoft\Windows\CurrentVersion\Run", 0,
                                 winreg.KEY_SET_VALUE)
            if enabled:
                winreg.SetValueEx(key, "JARVIS", 0, winreg.REG_SZ, command)
                return True, "o J.A.R.V.I.S. vai iniciar junto com o Windows"
            try:
                winreg.DeleteValue(key, "JARVIS")
            except FileNotFoundError:
                pass
            return True, "removi a inicialização automática"
        except Exception as exc:
            return False, f"não consegui alterar a inicialização automática: {exc}"
    path = Path.home() / ".config" / "autostart" / "jarvis.desktop"
    try:
        if enabled:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                "[Desktop Entry]\nType=Application\nName=JARVIS\n"
                f"Exec={command}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n",
                encoding="utf-8",
            )
            return True, "o J.A.R.V.I.S. vai iniciar junto com a sessão"
        if path.exists():
            path.unlink()
        return True, "removi a inicialização automática"
    except Exception as exc:
        return False, f"não consegui alterar a inicialização automática: {exc}"
