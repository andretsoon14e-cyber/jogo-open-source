"""Bateria de regressão do interpretador local (NLU).

Uso:  python3 scripts/nlu_battery.py [-v]

Cada linha é (frase dita, intenção esperada ou None). Falha o processo se
alguma frase for interpretada de forma diferente do esperado — serve para
pegar regressões ao ajustar padrões, sinônimos ou o limiar de similaridade.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jarvis.nlu.engine import engine, load_commands  # noqa: E402

CASES: list[tuple[str, str | None]] = [
    # conversa e personalidade
    ("bom dia jarvis", "conversation.greeting"),
    ("e aí, tudo bem?", "conversation.how_are_you"),
    ("tudo bem com você?", "conversation.how_are_you"),
    ("quem é você", "conversation.identity"),
    ("qual é o seu nome", "conversation.identity"),
    ("o que você acha de comprar um computador novo?", "advice.decide"),
    ("você está aí?", "conversation.greeting"),
    ("obrigado, jarvis", "conversation.thanks"),
    ("tchau", "conversation.farewell"),
    ("conta uma piada", "conversation.joke"),
    ("me diga uma curiosidade", "conversation.fun_fact"),
    ("o que você pode fazer", "meta.help"),
    ("me ajuda", "meta.help"),
    ("como funciona a sua memória", "advice.explain"),
    ("como está o tempo hoje", "conversation.weather"),
    ("preciso de um conselho", "advice.decide"),
    ("estou me sentindo desanimado", "conversation.mood"),
    # sistema
    ("status do sistema", "system.status"),
    ("como está o computador", "system.status"),
    ("situação do computador", "system.status"),
    ("temperatura do processador", "system.status"),
    ("uso de cpu e memória", "system.status"),
    ("quanta memória está livre", "system.status"),
    ("quais processos estão rodando", "system.processes"),
    ("quais são os maiores processos", "system.processes"),
    ("quanto tempo o computador está ligado", "system.uptime"),
    ("aumenta o volume", "system.volume.set"),
    ("diminui o volume em 20", "system.volume.set"),
    ("silencia o som", "system.volume.mute"),
    ("desliga o computador", "system.power"),
    ("reiniciar o computador", "system.power"),
    ("bloqueia a tela", "system.lock"),
    ("suspende o computador", "system.power"),
    ("desliga o computador daqui a 30 minutos", "system.power"),
    # aplicativos e pastas
    ("abre o chrome", "app.open"),
    ("fecha o bloco de notas", "app.close"),
    ("minimiza o navegador", "window.minimize"),
    ("maximiza a janela do chrome", "window.maximize"),
    ("alterna para o word", "window.switch"),
    ("lista os programas abertos", "app.list"),
    ("abre a pasta de documentos", "folder.open"),
    ("abre downloads", "folder.open"),
    # arquivos
    ("cria uma pasta chamada projetos em documentos", "file.mkdir"),
    ("renomeia o arquivo relatorio para relatorio final", "file.rename"),
    ("move o arquivo nota para documentos", "file.transfer"),
    ("copia o arquivo foto para imagens", "file.transfer"),
    ("pesquisa arquivos com nome orçamento", "file.search"),
    ("encontra arquivos duplicados em documentos", "file.duplicates"),
    ("lista os arquivos grandes em downloads", "file.large"),
    ("organiza a pasta downloads por categoria", "file.organize"),
    ("lista o conteúdo da pasta documentos", "file.list"),
    # memória
    ("memorize que prefiro café sem açúcar", "memory.remember"),
    ("lembre-se de que meu aniversário é em maio", "memory.remember"),
    ("o que você sabe sobre mim", "memory.recall"),
    ("esquece o que falei sobre café", "memory.forget"),
    # organização pessoal
    ("cria uma tarefa estudar física amanhã", "task.add"),
    ("quais são minhas tarefas", "task.list"),
    ("conclui a tarefa estudar física", "task.done"),
    ("me lembra de beber água às 15 horas", "task.add_remember"),
    ("quais são meus lembretes", "reminder.list"),
    ("anota que preciso ligar para o banco", "note.add"),
    ("mostra minhas anotações", "note.list"),
    ("cria o objetivo aprender inglês", "goal.add"),
    ("atualiza o progresso do objetivo inglês para 40 por cento", "goal.progress"),
    ("como estão meus objetivos", "goal.list"),
    ("marca uma consulta com o dentista na sexta", "appointment.add"),
    ("quais são meus compromissos", "agenda.show"),
    # rotinas e automação
    ("cria uma rotina modo estudo", "routine.create"),
    ("executa a rotina modo estudo", "routine.run"),
    ("quais são minhas rotinas", "routine.list"),
    ("desativa a rotina modo estudo", "routine.toggle"),
    ("me avisa em 10 minutos", "timer.set"),
    # voz e interface
    ("desliga o microfone", "voice.microphone"),
    ("ativa o microfone", "voice.microphone"),
    ("para de falar", "voice.stop"),
    ("repete a última resposta", "voice.repeat"),
    ("modo silencioso", "voice.tts"),
    # privacidade e sistema interno
    ("o que você registrou nas últimas ações", "audit.recent"),
    ("apaga o histórico de conversas", "history.clear"),
    ("quais são as configurações de segurança", "settings.show"),
    ("onde ficam meus dados", "settings.data_location"),
    # internet, terminal e voz (v1.1)
    ("pesquisa na internet sobre buracos negros", "web.search"),
    ("procura no google passagens para o rio", "web.search"),
    ("o que é computação quântica", "web.define"),
    ("quem é Ada Lovelace", "web.define"),
    ("abre o primeiro resultado", "web.open_result"),
    ("abre o site do github", "web.open_site"),
    ("minha cidade é Curitiba", "settings.location"),
    ("executa o comando ipconfig /all", "system.run"),
    ("qual é o meu ip", "system.network"),
    ("abre o arquivo relatório.pdf", "file.open"),
    # fora do escopo (deve cair no fallback honesto)
    ("qual é a capital da mongólia", None),
    ("escreve um poema sobre o mar", None),
    ("traduz isso para o inglês", None),
]


def main() -> int:
    verbose = "-v" in sys.argv
    load_commands()
    failures = 0
    for phrase, expected in CASES:
        match = engine.match(phrase)
        got = match.command.intent if match else None
        if got != expected:
            failures += 1
            print(f"FALHA  {phrase!r}\n       esperado {expected!r}, obtido {got!r}")
        elif verbose:
            print(f"ok     {phrase!r} -> {got}")
    total = len(CASES)
    print(f"\n{total - failures}/{total} frases interpretadas como esperado.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
