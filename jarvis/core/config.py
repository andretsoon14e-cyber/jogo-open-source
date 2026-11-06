"""Carregamento e persistência de configuração (default.yaml + user.yaml)."""
from __future__ import annotations

import copy
import os
import threading
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
DEFAULT_FILE = CONFIG_DIR / "default.yaml"
USER_FILE = CONFIG_DIR / "user.yaml"


class Config:
    """Árvore de configuração com acesso por caminho pontuado ("voice.tts.engine")."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root) if root else ROOT
        self._lock = threading.RLock()
        self.defaults: dict[str, Any] = {}
        self.user: dict[str, Any] = {}
        self.data: dict[str, Any] = {}
        self.load()

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        with self._lock:
            self.defaults = self._read(DEFAULT_FILE)
            user_file = self.root / "config" / "user.yaml"
            self.user = self._read(user_file) if user_file.exists() else {}
            self.data = _deep_merge(copy.deepcopy(self.defaults), self.user)

    @staticmethod
    def _read(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        try:
            with path.open("r", encoding="utf-8") as fh:
                loaded = yaml.safe_load(fh) or {}
            return loaded if isinstance(loaded, dict) else {}
        except Exception:  # arquivo corrompido não deve derrubar o assistente
            return {}

    # ------------------------------------------------------------------- get
    def get(self, path: str, default: Any = None) -> Any:
        cur: Any = self.data
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                return default
            cur = cur[part]
        return cur

    def section(self, path: str) -> dict[str, Any]:
        value = self.get(path, {})
        return value if isinstance(value, dict) else {}

    # ------------------------------------------------------------------- set
    def set(self, path: str, value: Any) -> None:
        """Grava em user.yaml (persistente) e aplica em memória."""
        with self._lock:
            parts = path.split(".")
            node = self.user
            for part in parts[:-1]:
                node = node.setdefault(part, {})
                if not isinstance(node, dict):
                    raise ValueError(f"caminho de configuração inválido: {path}")
            node[parts[-1]] = value
            self._write_user()
            self.data = _deep_merge(copy.deepcopy(self.defaults), self.user)

    def update(self, values: dict[str, Any]) -> None:
        for key, value in values.items():
            self.set(key, value)

    def _write_user(self) -> None:
        path = self.root / "config" / "user.yaml"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            yaml.safe_dump(self.user, fh, allow_unicode=True, sort_keys=True)
        os.replace(tmp, path)

    # ---------------------------------------------------------------- helpers
    def resolve(self, value: str | Path) -> Path:
        path = Path(os.path.expandvars(str(value))).expanduser()
        return path if path.is_absolute() else (self.root / path).resolve()

    def public_dict(self) -> dict[str, Any]:
        """Configuração exposta à interface (sem segredos — não há segredos aqui)."""
        return copy.deepcopy(self.data)


def _deep_merge(base: dict, extra: dict) -> dict:
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


_config: Config | None = None


def get_config(refresh: bool = False) -> Config:
    global _config
    if _config is None:
        _config = Config()
    elif refresh:
        _config.load()
    return _config
