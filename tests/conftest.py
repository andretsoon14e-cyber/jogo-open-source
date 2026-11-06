"""Fixtures de teste: ambiente isolado, sem tocar nos dados reais do usuário."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def env(tmp_path, monkeypatch):
    home = tmp_path / "home"
    (home / "Downloads").mkdir(parents=True)
    (home / "Documents").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))

    from jarvis.core.config import Config

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    config = Config(root=tmp_path)
    config.set("voice.tts.engine", "disabled")
    config.set("voice.stt.engine", "disabled")
    config.set("security.confirm_level", 2)
    return {"config": config, "home": home, "tmp": tmp_path}


@pytest.fixture()
def assistant(env):
    from jarvis.core.assistant import Assistant

    instance = Assistant(env["config"])
    yield instance
    instance.shutdown()


@pytest.fixture()
def db(tmp_path):
    from jarvis.memory.db import Database

    database = Database(tmp_path / "test.db")
    yield database
    database.close()


@pytest.fixture()
def sample_downloads(env):
    folder = env["home"] / "Downloads"
    for name in ("foto.jpg", "nota.txt", "planilha.xlsx", "musica.mp3", "video.mp4"):
        (folder / name).write_text("conteúdo de teste", encoding="utf-8")
    return folder


def copy_default_config(target: Path) -> None:
    shutil.copy(ROOT / "config" / "default.yaml", target / "default.yaml")
