"""Gerenciamento de arquivos com planos de execução e confirmação.

Toda operação em massa é montada como um *plano*: o assistente mostra o que
pretende fazer e só executa após autorização.
"""
from __future__ import annotations

import hashlib
import os
import shutil
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from ..security.permissions import PermissionManager, SecurityError

CATEGORIES: dict[str, set[str]] = {
    "Imagens": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".heic", ".tiff"},
    "Documentos": {".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".epub"},
    "Planilhas": {".xls", ".xlsx", ".csv", ".ods"},
    "Apresentacoes": {".ppt", ".pptx", ".odp"},
    "Videos": {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv"},
    "Musicas": {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"},
    "Compactados": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"},
    "Instaladores": {".exe", ".msi", ".dmg", ".deb", ".rpm", ".appimage"},
    "Codigo": {".py", ".js", ".ts", ".html", ".css", ".json", ".java", ".c", ".cpp", ".cs", ".sh", ".sql"},
}

EXT_TO_CATEGORY = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}


@dataclass
class FileAction:
    kind: str                 # mover | copiar | renomear | criar_pasta | excluir
    source: Path
    target: Path | None = None

    def describe(self) -> str:
        if self.kind == "criar_pasta":
            return f"criar a pasta {self.target}"
        if self.kind == "excluir":
            return f"excluir {self.source.name}"
        if self.kind == "renomear":
            return f"renomear {self.source.name} para {self.target.name if self.target else '?'}"
        verb = "mover" if self.kind == "mover" else "copiar"
        return f"{verb} {self.source.name} → {self.target}"


@dataclass
class Plan:
    title: str
    actions: list[FileAction] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    total_bytes: int = 0

    @property
    def count(self) -> int:
        return len(self.actions)

    def preview(self, limit: int = 12) -> dict:
        return {
            "title": self.title,
            "total": self.count,
            "total_mb": round(self.total_bytes / 1048576, 2),
            "items": [action.describe() for action in self.actions[:limit]],
            "truncated": max(0, self.count - limit),
            "notes": self.notes,
        }

    def execute(self) -> tuple[bool, str, list[str]]:
        done: list[str] = []
        errors: list[str] = []
        for action in self.actions:
            try:
                if action.kind == "criar_pasta" and action.target:
                    action.target.mkdir(parents=True, exist_ok=True)
                elif action.kind == "mover":
                    target = _unique(action.target) if action.target else None
                    if not target:
                        raise ValueError("destino inválido")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(action.source), str(target))
                    action.target = target
                elif action.kind == "copiar":
                    target = _unique(action.target) if action.target else None
                    if not target:
                        raise ValueError("destino inválido")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if action.source.is_dir():
                        shutil.copytree(action.source, target)
                    else:
                        shutil.copy2(action.source, target)
                    action.target = target
                elif action.kind == "renomear":
                    if not action.target:
                        raise ValueError("nome inválido")
                    action.source.rename(action.target)
                elif action.kind == "excluir":
                    _delete(action.source)
                done.append(action.describe())
            except Exception as exc:
                errors.append(f"{action.source.name}: {exc}")
        if errors:
            return (len(done) > 0), f"{len(done)} ação(ões) concluída(s), {len(errors)} falha(s)", done + errors
        return True, f"{len(done)} ação(ões) concluída(s) com sucesso", done


def _unique(path: Path) -> Path:
    """Evita sobrescrever arquivos: adiciona sufixo (1), (2)..."""
    if not path.exists():
        return path
    stem, suffix, parent = path.stem, path.suffix, path.parent
    for index in range(1, 1000):
        candidate = parent / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
    return parent / f"{stem}-{datetime.now():%Y%m%d%H%M%S}{suffix}"


def _delete(path: Path) -> None:
    try:
        import send2trash  # type: ignore

        send2trash.send2trash(str(path))
        return
    except Exception:
        pass
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


# ------------------------------------------------------------------- resolução
def resolve_folder(text: str, folders: dict[str, str], permissions: PermissionManager) -> Path | None:
    lowered = text.lower().strip()
    for alias, path in folders.items():
        if alias in lowered:
            return Path(os.path.expanduser(os.path.expandvars(path))).resolve()
    for candidate in [lowered, text.strip()]:
        try:
            path = Path(os.path.expanduser(candidate))
            if path.exists() and path.is_dir():
                return permissions.check_path(path)
        except (OSError, SecurityError):
            continue
    return None


def list_dir(path: Path, limit: int = 40) -> dict:
    entries = []
    try:
        for item in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))[:limit]:
            try:
                size = item.stat().st_size if item.is_file() else None
            except OSError:
                size = None
            entries.append({
                "name": item.name,
                "is_dir": item.is_dir(),
                "size_mb": round(size / 1048576, 2) if size else None,
                "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat(timespec="minutes")
                if item.exists() else None,
            })
    except PermissionError:
        return {"path": str(path), "entries": [], "error": "sem permissão de leitura"}
    return {"path": str(path), "entries": entries}


def search(root: Path, term: str, limit: int = 30, max_depth: int = 4) -> list[Path]:
    term = term.lower().strip()
    results: list[Path] = []
    root = root.expanduser()
    if not root.exists():
        return results
    base_depth = len(root.parts)
    for current, dirs, files in os.walk(root):
        if len(Path(current).parts) - base_depth > max_depth:
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if not d.startswith((".", "$")) and d.lower() not in
                   ("node_modules", "appdata", "windows", "program files", "program files (x86)")]
        for name in files + dirs:
            if term in name.lower():
                results.append(Path(current) / name)
                if len(results) >= limit:
                    return results
    return results


# ---------------------------------------------------------------------- planos
def build_organize_plan(folder: Path, permissions: PermissionManager) -> Plan:
    plan = Plan(title=f"Organizar {folder.name} por categoria")
    if not folder.exists() or not folder.is_dir():
        plan.notes.append("a pasta não existe")
        return plan
    for item in sorted(folder.iterdir()):
        if item.is_dir() or item.name.startswith("."):
            continue
        category = EXT_TO_CATEGORY.get(item.suffix.lower(), "Outros")
        target_dir = folder / category
        try:
            plan.total_bytes += item.stat().st_size
        except OSError:
            pass
        plan.actions.append(FileAction("mover", item, target_dir / item.name))
    if plan.count:
        plan.notes.append("Nada será apagado — os arquivos apenas mudam de pasta.")
    else:
        plan.notes.append("a pasta já está organizada")
    return plan


def find_duplicates(root: Path, min_size: int = 1024, limit: int = 40) -> list[list[Path]]:
    by_size: dict[int, list[Path]] = defaultdict(list)
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in files:
            path = Path(current) / name
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size >= min_size:
                by_size[size].append(path)
    groups: list[list[Path]] = []
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        by_hash: dict[str, list[Path]] = defaultdict(list)
        for path in paths:
            try:
                digest = _hash_file(path)
            except OSError:
                continue
            if digest:
                by_hash[digest].append(path)
        for group in by_hash.values():
            if len(group) > 1:
                groups.append(group)
        if len(groups) >= limit:
            break
    return groups[:limit]


def _hash_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while data := fh.read(chunk):
            digest.update(data)
    return digest.hexdigest()


def find_large(root: Path, min_mb: int = 100, limit: int = 20) -> list[dict]:
    found: list[dict] = []
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith((".", "node_modules", "$"))]
        for name in files:
            path = Path(current) / name
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size >= min_mb * 1048576:
                found.append({"path": str(path), "size_mb": round(size / 1048576, 1)})
    found.sort(key=lambda item: item["size_mb"], reverse=True)
    return found[:limit]


def free_space(path: Path) -> dict:
    import psutil

    usage = psutil.disk_usage(str(path))
    return {
        "path": str(path),
        "total_gb": round(usage.total / 1073741824, 1),
        "free_gb": round(usage.free / 1073741824, 1),
        "percent": usage.percent,
    }
