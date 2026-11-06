# Comandos do J.A.R.V.I.S.

Este arquivo é gerado automaticamente a partir do interpretador (`python scripts/gen_commands_doc.py`).

**81 intenções registradas.** O reconhecimento aceita variações informais, erros de pronúncia e sinônimos — as frases abaixo são exemplos, não a única forma válida.

> Dica: diga ou escreva “Jarvis” antes da frase quando estiver usando a palavra de ativação.
> O assistente também entende frases compostas como “anote que preciso revisar o código e quais são minhas tarefas”.

## Níveis de autorização

| Nível | Comportamento |
| --- | --- |
| 1 · simples | executado imediatamente (abrir programas, consultar dados, ajustar volume) |
| 2 · altera dados | mostra o que será feito e pede confirmação |
| 3 · crítica | confirmação explícita obrigatória (excluir, desligar, memória, configurações) |

## Conversa e informação

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `conversation.date` | Informa a data de hoje | “Que dia é hoje?”<br>“Qual é a data de hoje?” | nível 1 · simples |
| `conversation.farewell` | Despedida | “Até logo, Jarvis” | nível 1 · simples |
| `conversation.fun_fact` | Conta uma curiosidade científica verificável | “Me diga uma curiosidade” | nível 1 · simples |
| `conversation.greeting` | Cumprimenta o assistente | “Oi, Jarvis”<br>“Bom dia” | nível 1 · simples |
| `conversation.how_are_you` | Conversa casual sobre o estado do assistente | “Como você está?”<br>“Tudo bem com você?” | nível 1 · simples |
| `conversation.identity` | Explica quem é o assistente | “Quem é você?”<br>“Qual é o seu nome?” | nível 1 · simples |
| `conversation.joke` | Conta uma piada leve | “Jarvis, conta uma piada” | nível 1 · simples |
| `conversation.local_model` | Explica como habilitar um modelo de linguagem local (opt-in) | “Quero um modelo local”<br>“Dá para ter conversa aberta offline?” | nível 1 · simples |
| `conversation.mood` | Conversa de apoio, com escuta ativa | “Jarvis, estou cansado”<br>“Estou ansioso com o trabalho” | nível 1 · simples |
| `conversation.set_name` | Registra como o usuário quer ser chamado | “Meu nome é Tony”<br>“Pode me chamar de Stark” | nível 1 · simples |
| `conversation.thanks` | Responde a agradecimentos | “Obrigado, Jarvis” | nível 1 · simples |
| `conversation.time` | Informa a hora atual | “Que horas são?”<br>“Qual é o horário agora?” | nível 1 · simples |
| `conversation.weather` | Explica a limitação de previsão do tempo offline | “Jarvis, vai chover hoje?”<br>“Como está o clima?” | nível 1 · simples |
| `meta.help` | Lista o que o assistente sabe fazer | “Jarvis, ajuda”<br>“O que você pode fazer?” | nível 1 · simples |

## Computador

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `system.disk` | Informa espaço livre em disco | “Quanto espaço tem no disco?” | nível 1 · simples |
| `system.lock` | Bloqueia a tela do computador | “Bloqueia o computador” | nível 2 · altera dados |
| `system.power` | Desliga, reinicia ou suspende o computador | “Desliga o computador”<br>“Reinicia o computador” | nível 3 · crítica |
| `system.power.cancel` | Cancela desligamento/reinício agendado | “Cancela o desligamento” | nível 1 · simples |
| `system.processes` | Lista os programas em execução | “Quais processos estão rodando?” | nível 1 · simples |
| `system.status` | Relata CPU, memória, disco e temperatura reais | “Jarvis, como está o desempenho do computador?” | nível 1 · simples |
| `system.uptime` | Informa há quanto tempo o computador está ligado | “Há quanto tempo o computador está ligado?” | nível 1 · simples |
| `system.volume.mute` | Silencia o som do sistema | “Jarvis, silencia o som” | nível 1 · simples |
| `system.volume.set` | Ajusta, aumenta ou diminui o volume | “Coloca o volume em 40”<br>“Aumenta o volume” | nível 1 · simples |

## Programas, pastas e janelas

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `app.close` | Fecha um programa aberto | “Jarvis, fecha o navegador”<br>“Fecha o Discord” | nível 2 · altera dados |
| `app.list` | Lista programas abertos | “Quais programas estão abertos?” | nível 1 · simples |
| `app.open` | Abre um programa ou uma pasta | “Jarvis, abre o navegador”<br>“Abre o Discord” | nível 1 · simples |
| `folder.open` | Abre uma pasta do usuário | “Abre a pasta de downloads” | nível 1 · simples |
| `window.list` | Lista janelas abertas | “Quais janelas estão abertas?” | nível 1 · simples |
| `window.maximize` | Maximiza uma janela | “Maximiza o Discord” | nível 1 · simples |
| `window.minimize` | Minimiza uma janela ou todas | “Minimiza o navegador”<br>“Minimiza tudo” | nível 1 · simples |
| `window.switch` | Alterna entre janelas (Alt+Tab) | “Troca de janela”<br>“Alterna entre os programas” | nível 1 · simples |

## Arquivos

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `file.delete` | Exclui um arquivo (com confirmação obrigatória) | “Exclui o arquivo temporario.txt” | nível 3 · crítica |
| `file.duplicates` | Procura arquivos duplicados por conteúdo | “Encontra os arquivos duplicados” | nível 1 · simples |
| `file.large` | Lista os maiores arquivos das pastas autorizadas | “Quais são os arquivos grandes?” | nível 1 · simples |
| `file.list` | Lista o conteúdo de uma pasta | “Lista os arquivos da pasta downloads” | nível 1 · simples |
| `file.mkdir` | Cria uma pasta | “Cria uma pasta chamada Projetos em Documentos” | nível 2 · altera dados |
| `file.organize` | Organiza uma pasta por categoria de arquivo | “Jarvis, organize os arquivos da minha pasta de downloads” | nível 2 · altera dados |
| `file.rename` | Renomeia um arquivo ou pasta | “Renomeia o arquivo relatorio.txt para final.txt” | nível 2 · altera dados |
| `file.search` | Procura arquivos e pastas pelo nome | “Procura o arquivo relatório.pdf”<br>“Onde está a pasta projetos?” | nível 1 · simples |
| `file.transfer` | Move ou copia arquivos e pastas | “Copia o relatorio.pdf para Documentos”<br>“Move a pasta projetos para o desktop” | nível 2 · altera dados |

## Memória

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `memory.clear` | Apaga toda a memória de longo prazo | “Apague toda a minha memória” | nível 3 · crítica |
| `memory.forget` | Remove uma informação da memória | “Esqueça que eu prefiro acordar cedo” | nível 3 · crítica |
| `memory.recall` | Mostra o que está guardado sobre o usuário | “O que você sabe sobre mim?”<br>“Quais são minhas preferências?” | nível 1 · simples |
| `memory.remember` | Guarda uma informação na memória local | “Jarvis, lembre-se de que prefiro acordar às 7 horas” | nível 1 · simples |
| `memory.search` | Procura um assunto na memória local | “O que você sabe sobre meu projeto?” | nível 1 · simples |

## Organização pessoal

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `agenda.show` | Mostra a agenda do dia | “Qual é minha agenda de amanhã?” | nível 1 · simples |
| `appointment.add` | Registra um compromisso na agenda | “Marca uma consulta com o dentista na sexta às 15h” | nível 1 · simples |
| `goal.add` | Cria um objetivo | “Crie um objetivo de aprender inglês”<br>“Quero definir um objetivo: correr 5 km” | nível 1 · simples |
| `goal.list` | Lista objetivos e progresso | “Quais são meus objetivos?” | nível 1 · simples |
| `goal.progress` | Atualiza o progresso de um objetivo | “Atualize o progresso do objetivo estudar para 50%” | nível 1 · simples |
| `note.add` | Cria uma anotação | “Jarvis, anote que preciso comprar um carregador” | nível 1 · simples |
| `note.list` | Lista anotações | “Mostre minhas anotações” | nível 1 · simples |
| `reminder.list` | Lista lembretes pendentes | “Quais são meus lembretes?” | nível 1 · simples |
| `task.add` | Cria tarefa ou lembrete com data opcional | “Crie um lembrete para estudar às 19 horas”<br>“Adicionar tarefa: pagar a conta” | nível 1 · simples |
| `task.add_remember` | Cria lembrete a partir de “me lembre de…” | “Jarvis, me lembre de estudar amanhã” | nível 1 · simples |
| `task.done` | Marca tarefa como concluída | “Marca a tarefa estudar como concluída”<br>“Terminei a tarefa de revisar o código” | nível 1 · simples |
| `task.list` | Lista tarefas pendentes | “Quais são minhas tarefas?”<br>“O que tenho para fazer hoje?” | nível 1 · simples |
| `timer.set` | Cria uma contagem regressiva com aviso | “Jarvis, me avise em 10 minutos”<br>“Timer de 30 minutos” | nível 1 · simples |

## Automações e rotinas

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `routine.create` | Cria uma rotina a partir de uma frase falada | “Quando eu disser modo estudo, abra o navegador e abra a pasta de estudos” | nível 1 · simples |
| `routine.delete` | Remove uma rotina | “Apaga a rotina modo estudo” | nível 3 · crítica |
| `routine.list` | Lista as rotinas cadastradas | “Quais rotinas eu tenho?” | nível 1 · simples |
| `routine.run` | Executa uma rotina salva | “Ativar rotina modo estudo”<br>“Executar a rotina de trabalho” | nível 1 · simples |
| `routine.toggle` | Ativa ou desativa uma rotina | “Desativa a rotina modo estudo” | nível 1 · simples |
| `schedule.list` | Lista agendamentos programados | “Quais agendamentos eu tenho?” | nível 1 · simples |

## Conselheiro pessoal

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `advice.check` | Revisa o raciocínio do usuário e aponta riscos | “Jarvis, eu acho que estou certo. Concorda?” | nível 1 · simples |
| `advice.compare` | Compara alternativas por critérios explícitos | “Qual é melhor, notebook ou desktop?”<br>“Compare aluguel e financiamento” | nível 1 · simples |
| `advice.decide` | Estrutura uma decisão em critérios e riscos | “Jarvis, estou pensando em comprar um computador novo. O que acha?”<br>“Vale a pena trocar de emprego?” | nível 1 · simples |
| `advice.explain` | Explica um assunto com base no que está registrado localmente | “Explique como funciona a memória local” | nível 1 · simples |
| `advice.opinion_open` | Opinião fundamentada dentro dos limites locais | “Jarvis, o que você acha disso?” | nível 1 · simples |
| `advice.plan` | Divide um objetivo em próximos passos | “Me ajude a planejar meus estudos”<br>“Quero um passo a passo para emagrecer” | nível 1 · simples |
| `advice.reflect` | Conversa de apoio e escuta ativa | “Preciso conversar sobre um problema”<br>“Estou desabafando” | nível 1 · simples |

## Voz

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `voice.microphone` | Liga ou desliga a escuta pelo microfone | “Desliga o microfone”<br>“Ativa o microfone” | nível 1 · simples |
| `voice.repeat` | Repete a última resposta | “Repete o que você disse” | nível 1 · simples |
| `voice.stop` | Interrompe a fala e cancela ações pendentes | “Jarvis, pare” | nível 1 · simples |
| `voice.tts` | Liga ou desliga a voz do assistente | “Desliga sua voz”<br>“Ativa a voz” | nível 1 · simples |
| `voice.wake_word` | Liga/desliga a escuta da palavra de ativação | “Desativa a palavra de ativação” | nível 1 · simples |

## Configurações

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `system.startup` | Liga/desliga a inicialização automática com o sistema | “Iniciar com Windows”<br>“Desativa a inicialização automática” | nível 3 · crítica |

## privacidade

| Intenção | O que faz | Exemplos | Nível |
| --- | --- | --- | --- |
| `audit.recent` | Mostra as últimas ações registradas no log local | “O que você registrou nas últimas ações?” | nível 1 · simples |
| `history.clear` | Apaga o histórico de conversas (mantém a memória de longo prazo) | “Apaga o histórico de conversas” | nível 2 · altera dados |
| `settings.data_location` | Mostra onde ficam os dados locais | “Onde ficam meus dados?” | nível 1 · simples |
| `settings.show` | Resume as configurações de privacidade e segurança ativas | “Quais são as configurações de segurança?” | nível 1 · simples |

## O que o assistente não faz (por decisão de projeto)

- Não responde perguntas enciclopédicas abertas sem uma base local — ele avisa que não sabe.
- Não acessa serviços de IA na nuvem, APIs de terceiros ou telemetria.
- Não instala programas, não altera o registro do sistema e não executa scripts externos sem autorização explícita.
- Não identifica o locutor: qualquer voz com acesso ao microfone pode dar comandos. Ative a confirmação por nível e mantenha o microfone desligado em ambientes compartilhados.
- Não cria agendamentos recorrentes por voz (apenas horário único). Rotinas podem ser recriadas com o mesmo nome para editar os passos.
- Não apaga arquivos de forma permanente sem confirmação de nível 3 (quando a lixeira está disponível, o arquivo vai para ela).
