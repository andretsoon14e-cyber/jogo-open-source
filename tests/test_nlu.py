"""Testes do interpretador de comandos em português."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from jarvis.nlu import extract
from jarvis.nlu.engine import engine, load_commands
from jarvis.nlu.normalizer import normalize, similarity, strip_accents, words_to_numbers

load_commands()


def test_normalizacao_basica():
    assert strip_accents("J.A.R.V.I.S., que horas são?") == "J.A.R.V.I.S., que horas sao?"
    assert normalize("JARVIS, abre o Chrome!") == "jarvis abrir o chrome"
    assert normalize("vc pode abrir o navegador pra mim") .startswith("voce")
    assert normalize("23h") == "23 horas"
    assert normalize("19h30") == "19:30"


def test_numeros_por_extenso():
    assert words_to_numbers("trinta minutos") == "30 minutos"
    assert words_to_numbers("vinte e dois") == "22"
    assert words_to_numbers("dez horas") == "10 horas"


def test_similaridade_tolera_erros():
    assert similarity("jarvis", "jarves") > 0.8
    assert similarity("abrir", "abrir") == 1.0


@pytest.mark.parametrize("text,expected", [
    ("30 minutos", 1800),
    ("1 hora", 3600),
    ("duas horas", 7200),
    ("meia hora", 1800),
    ("10 segundos", 10),
    ("2h30", 9000),
])
def test_parse_duration(text, expected):
    assert extract.parse_duration(text) == expected


def test_parse_when_amanha():
    now = datetime(2026, 5, 10, 9, 0)
    result = extract.parse_when("estudar amanhã às 14 horas", now=now)
    assert result == datetime(2026, 5, 11, 14, 0)


def test_parse_when_relative():
    now = datetime(2026, 5, 10, 9, 0)
    result = extract.parse_when("daqui a 30 minutos", now=now)
    assert result == now + timedelta(minutes=30)


def test_parse_when_hoje_meia_noite():
    now = datetime(2026, 5, 10, 9, 0)
    assert extract.parse_time_of_day("meia-noite") == (0, 0)
    assert extract.parse_time_of_day("às 23 horas") == (23, 0)
    assert extract.parse_when("hoje às 23 horas", now=now) == datetime(2026, 5, 10, 23, 0)


@pytest.mark.parametrize("text,expected", [
    ("que horas são", "conversation.time"),
    ("que dia é hoje", "conversation.date"),
    ("Jarvis, abre o navegador", "app.open"),
    ("abre o chrome", "app.open"),
    ("fecha o navegador", "app.close"),
    ("abre a pasta de downloads", "folder.open"),
    ("organize a pasta de downloads", "file.organize"),
    ("procura o arquivo relatorio.pdf", "file.search"),
    ("quais são os arquivos grandes", "file.large"),
    ("encontra os arquivos duplicados", "file.duplicates"),
    ("desliga o computador", "system.power"),
    ("reinicia o computador", "system.power"),
    ("bloqueia a tela", "system.lock"),
    ("aumenta o volume", "system.volume.set"),
    ("silencia o som", "system.volume.mute"),
    ("como está o desempenho do computador", "system.status"),
    ("quanto espaço tem no disco", "system.disk"),
    ("quais programas estão abertos", "app.list"),
    ("me lembre de estudar amanhã às 14 horas", "task.add_remember"),
    ("quais são minhas tarefas", "task.list"),
    ("o que tenho para fazer hoje", "task.list"),
    ("anote que preciso comprar um carregador", "note.add"),
    ("minhas anotações", "note.list"),
    ("cria um objetivo de aprender inglês", "goal.add"),
    ("quais são meus objetivos", "goal.list"),
    ("minha agenda de amanhã", "agenda.show"),
    ("timer de 10 minutos", "timer.set"),
    ("meus lembretes", "reminder.list"),
    ("lembre-se de que prefiro acordar às 7 horas", "memory.remember"),
    ("o que você sabe sobre mim", "memory.recall"),
    ("esqueça que prefiro acordar cedo", "memory.forget"),
    ("quando eu disser modo estudo, abre o navegador e abre a pasta de documentos", "routine.create"),
    ("quais rotinas eu tenho", "routine.list"),
    ("desativa a rotina modo estudo", "routine.toggle"),
    ("apaga a rotina modo estudo", "routine.delete"),
    ("estou pensando em comprar um computador novo, o que acha?", "advice.decide"),
    ("qual é melhor notebook ou desktop?", "advice.compare"),
    ("me ajude a planejar meus estudos", "advice.plan"),
    ("eu acho que estou certo, concorda?", "advice.check"),
    ("explique como funciona a memória local", "advice.explain"),
    ("desativa o microfone", "voice.microphone"),
    ("desativa a palavra de ativação", "voice.wake_word"),
    ("repete o que você disse", "voice.repeat"),
    ("Jarvis, pare", "voice.stop"),
    ("quem é você", "conversation.identity"),
    ("ajuda", "meta.help"),
    ("vai chover hoje", "conversation.weather"),
    ("quero um modelo local", "conversation.local_model"),
])
def test_intencoes_reconhecidas(text, expected):
    match = engine.match(text)
    assert match is not None, f"não reconheceu: {text}"
    assert match.command.intent == expected


@pytest.mark.parametrize("text", [
    "toca uma música aleatória",
    "qual a capital da Mongólia",
    "tira um print da tela",
])
def test_intencoes_desconhecidas(text):
    match = engine.match(text)
    assert match is None


def test_niveis_de_seguranca():
    assert engine.get("app.open").level == 1
    assert engine.get("app.close").level == 2
    assert engine.get("file.delete").level == 3
    assert engine.get("system.power").level == 3
    assert engine.get("system.volume.set").level == 1


def test_sugestoes_quando_desconhecido():
    suggestions = engine.suggest("abre o programa excel")
    assert isinstance(suggestions, list)


def test_wake_word():
    from jarvis.voice import wake

    assert wake.detect("Jarvis, abre o navegador")
    assert wake.detect("jarves que horas sao")
    assert not wake.detect("abre o navegador")
    assert wake.strip("Jarvis, abre o navegador") == "abre o navegador"
    assert wake.is_confirmation("confirmo") is True
    assert wake.is_confirmation("cancela isso") is False
    assert wake.is_confirmation("bom dia") is None
