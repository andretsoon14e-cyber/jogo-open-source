"""Regressão do interpretador: roda a bateria de frases de scripts/nlu_battery.py.

A bateria é a mesma usada em desenvolvimento, então este teste garante que
ajustes de sinônimos/limiar não reintroduzam falsos positivos nem percam frases
comuns do dia a dia.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from nlu_battery import CASES  # noqa: E402

from jarvis.nlu.engine import engine, load_commands  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def _commands_loaded():
    load_commands()


@pytest.mark.parametrize("phrase,expected", CASES, ids=[c[0] for c in CASES])
def test_frase_interpretada_como_esperado(phrase, expected):
    match = engine.match(phrase)
    got = match.command.intent if match else None
    assert got == expected, f"{phrase!r}: esperado {expected!r}, obtido {got!r}"


def test_bateria_tem_cobertura_relevante():
    assert len(CASES) >= 80
    assert any(expected is None for _, expected in CASES), "deve haver casos fora do escopo"
