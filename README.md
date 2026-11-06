# J.A.R.V.I.S. — assistente pessoal local

Assistente pessoal para computador inspirado no J.A.R.V.I.S. dos filmes, com interface
futurista, voz em português brasileiro, memória local, controle do sistema e automações.

> **Princípio central:** nenhuma inteligência artificial na nuvem.
> Interpretação de comandos por regras, reconhecimento e síntese de voz offline, banco de
> dados SQLite na sua máquina. O assistente não envia conversas, áudio ou arquivos para
> servidores de terceiros.

```
┌──────────────────────────────────────────────────────────────┐
│  J.A.R.V.I.S.  ·  assistente pessoal  ·  100% local           │
│  voz offline · memória SQLite · automações · auditoria        │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. O que ele faz de verdade

| Área | Recursos implementados |
| --- | --- |
| **Voz** | reconhecimento offline (Vosk ou whisper.cpp), síntese local com timbre natural (Piper neural, vozes do Windows ou do navegador — o espeak sai da cadeia automática), escolha de timbre/velocidade/tom na interface, palavra de ativação “Jarvis”, detecção automática de fim de fala, interrupção da própria fala |
| **Internet** | pesquisa no DuckDuckGo, resumos da Wikipédia (“o que é / quem é”), previsão do tempo via Open-Meteo, abertura de sites e dos resultados — sempre acionada por você |
| **Terminal** | executa qualquer comando com confirmação de nível 3 mostrando a linha exata, com saída na tela e registro na auditoria |
| **Conversa** | personalidade educada e honesta, variações de fala, humor discreto, limites declarados (“não sei” quando é o caso) |
| **Computador** | CPU, RAM, disco, temperatura, bateria, uptime, processos · volume · bloqueio de tela · suspender, reiniciar, desligar (com confirmação) |
| **Programas e janelas** | abrir/fechar programas, abrir pastas, minimizar, maximizar, alternar janelas, listar processos e janelas |
| **Arquivos** | procurar, listar, criar pasta, renomear, mover, copiar, organizar por categoria, achar duplicados, listar os maiores — sempre com prévia e confirmação nas alterações em massa |
| **Organização** | lembretes, temporizadores, tarefas, anotações, objetivos com progresso, agenda do dia |
| **Automações** | rotinas criadas por voz (“quando eu disser modo estudo…”), execução em sequência, agendamentos (“desligar às 23h”), ativação/desativação |
| **Memória** | fatos, preferências e perfil guardados em SQLite; consulta, edição e exclusão pela interface; nada é gravado sem pedido explícito |
| **Conselheiro** | estrutura decisões em critérios, compara alternativas, aponta vícios de raciocínio, decompõe objetivos em passos, consulta sua memória para personalizar |
| **Segurança** | três níveis de autorização, lista de comandos proibidos, pastas autorizadas, auditoria local (banco + JSONL), microfone desativável |
| **Interface** | HUD com núcleo animado por estado, espectro de áudio circular, telemetria ao vivo, histórico, painéis de memória/tarefas/rotinas/sistema/ajustes/logs, modo compacto, layout responsivo |

---

## 2. Início rápido (Windows)

```bat
:: 1. instalar dependências (Python 3.10+)
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

:: 2. (opcional, recomendado) modelos de voz locais
python scripts\setup_models.py

:: 3. iniciar
python jarvis.py
```

Ou simplesmente dê dois cliques em **`jarvis.bat`** — ele cria o ambiente, instala as
dependências e abre a interface. No Linux/macOS: `./jarvis.sh`.

A interface abre em `http://127.0.0.1:8765`. Digite `que horas são` para confirmar que
tudo está funcionando.

Verificações úteis:

```bash
python jarvis.py --diagnose          # ambiente, dependências, motores de voz, interpretador
python jarvis.py --console           # usar no terminal, sem navegador
python jarvis.py --test-command "abre o navegador"   # ver a intenção detectada
```

---

## 3. Como falar com ele

Com a palavra de ativação ligada, diga **“Jarvis”** e ele responde **“Pois não?”**. Depois
basta falar naturalmente:

```
Jarvis, abre o navegador.
Jarvis, que horas são?
Jarvis, como está o desempenho do computador?
Jarvis, organiza a pasta de downloads.
Jarvis, me lembre de estudar amanhã às 14 horas.
Jarvis, quando eu disser modo estudo, abre o navegador e abre a pasta de documentos.
Jarvis, estou pensando em comprar um computador novo. O que acha?
```

O interpretador aceita variações informais, sinônimos e erros comuns do reconhecedor
(“abri o chrome”, “fecha o navegador pra mim”). A lista completa, com nível de autorização
de cada comando, está em **[docs/COMANDOS.md](docs/COMANDOS.md)**.

---

## 4. Estados do núcleo

| Estado | Aparência |
| --- | --- |
| **Inativo** | anéis girando devagar, pulsação suave |
| **Escutando** | espectro circular reagindo à sua voz, ondas concêntricas |
| **Processando** | arcos rápidos + varredura cônica |
| **Falando** | ondas verdes sincronizadas com a fala |
| **Executando** | varredura âmbar e pulsos |
| **Confirmando** | âmbar lento, aguardando autorização |
| **Erro** | vermelho com micro-instabilidade |

---

## 5. Voz: o que instalar e por quê

Nenhum dos itens abaixo é obrigatório para usar a interface por texto.

| Componente | Papel | Como instalar |
| --- | --- | --- |
| **Vosk** + modelo pt-BR (~50 MB) | entende sua fala, offline | `python scripts/setup_models.py --vosk` |
| **whisper.cpp** + modelo GGML | alternativa com mais precisão (mais lento) | compile e indique os caminhos em `config/user.yaml` |
| **Piper** + voz `pt_BR-faber-medium` | voz neural masculina, natural | `python scripts/setup_models.py --piper` |
| **pyttsx3 / SAPI5** | reaproveita a voz pt-BR do Windows | `pip install pyttsx3` |
| **Vozes do navegador** | fallback imediato, usa o motor do sistema | automático |

Sem nenhum motor de voz instalado, o assistente **informa a limitação** e continua
funcionando por texto — ele não finge que está ouvindo.

---

## 6. Segurança e privacidade

- **Nível 1 — simples:** executa direto (abrir programas, consultar dados, ajustar volume).
- **Nível 2 — altera dados:** mostra exatamente o que fará e pede confirmação (fechar
  programas, mover/copiar arquivos, organizar pastas).
- **Nível 3 — crítica:** confirmação obrigatória (excluir, desligar/reiniciar/suspender,
  apagar memória, alterar inicialização automática).

Outras garantias: comandos destrutivos conhecidos são bloqueados; operações de arquivo são
restritas às suas pastas de usuário; tudo o que é executado fica registrado localmente
(`data/logs/audit.jsonl` + tabela `audit`); o microfone pode ser desligado por voz ou na
interface. Detalhes em **[docs/SEGURANCA.md](docs/SEGURANCA.md)**.

---

## 7. Estrutura do projeto

```
jarvis.py                  entrada (interface, console, diagnóstico)
config/default.yaml        configuração padrão (versionada)
config/user.yaml           suas alterações (ignorado pelo git)
jarvis/
  core/                    assistente (orquestrador), estado, eventos, personalidade
  nlu/                     normalização pt-BR, extração de datas/durações, interpretador
  commands/                comandos registrados por decorador (9 módulos)
  system/                  Windows/Linux: programas, janelas, energia, volume, arquivos
  voice/                   STT (Vosk/whisper.cpp), TTS (Piper/pyttsx3/espeak), wake word
  memory/                  banco SQLite (memória, tarefas, rotinas, auditoria)
  personal/                agendador de lembretes, timers e tarefas programadas
  security/                permissões, confirmações e auditoria
  advisor/                 conselheiro local + adaptador opcional de modelo local
  server/                  API HTTP/WebSocket e servidor da interface
web/                       interface (HTML/CSS/JS puro, sem build, sem CDN)
scripts/                   setup_models.py, gen_commands_doc.py, smoke_test.py
tests/                     207 testes automatizados + bateria de 84 frases
docs/                      planejamento, arquitetura, instalação, segurança, limites
```

Detalhes de arquitetura: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)** ·
Planejamento e decisões técnicas: **[docs/PLANEJAMENTO.md](docs/PLANEJAMENTO.md)**.

---

## 8. Testes

```bash
pip install pytest
python -m pytest tests -q        # 207 testes: NLU, segurança, banco, núcleo, API
python scripts/smoke_test.py     # roteiro completo em um HOME temporário
```

O `smoke_test.py` executa cerca de 30 comandos reais (com confirmação simulada) em um
diretório temporário — nenhuma pasta sua é alterada.

---

## 9. Limitações (transparência)

O J.A.R.V.I.S. **não** é um modelo de linguagem: ele entende intenções que foram
programadas e estruturado raciocínio com regras. Perguntas enciclopédicas abertas recebem
uma resposta honesta de limitação. Para conversa realmente aberta existe a opção de um
**modelo local** (Ollama/llama.cpp), desativada por padrão e nunca instalada
automaticamente — veja **[docs/LIMITACOES.md](docs/LIMITACOES.md)**.

Também são específicos de plataforma: controle de janelas por API (Windows nativo; Linux
requer `wmctrl`), volume preciso (Windows com `pycaw`), temperatura (depende de sensores) e
inicialização automática (registro do Windows / `~/.config/autostart`).

---

## 10. Status das fases

| Fase | Entrega | Situação |
| --- | --- | --- |
| 1 · Planejamento | análise de ambiente, tecnologias, arquitetura, riscos | ✅ `docs/PLANEJAMENTO.md` |
| 2 · Estrutura inicial | núcleo, configuração, banco, inicialização | ✅ |
| 3 · Interface | HUD, núcleo animado, painéis, histórico, responsivo, modo mini | ✅ |
| 4 · Voz | STT/TTS offline, wake word, barge-in, VAD | ✅ (depende de modelos instalados) |
| 5 · Comandos | 89 intenções, sinônimos, slots, compostos | ✅ |
| 6 · Automações | programas, janelas, arquivos, energia, rotinas, agendamentos | ✅ |
| 7 · Memória e organização | memória, notas, tarefas, lembretes, objetivos | ✅ |
| 8 · Personalidade | respostas, confirmações, honestidade, conselheiro | ✅ |
| 9 · Testes | 207 testes + bateria de NLU + smoke test | ✅ contínuo |

Próximos passos sugeridos em **[docs/ROADMAP.md](docs/ROADMAP.md)**.

---

## 11. Privacidade em uma frase

A interface conversa apenas com `127.0.0.1`; o reconhecimento e a síntese de voz rodam na
sua máquina; o banco é um arquivo no seu disco. A única conexão externa do projeto é o
download opcional dos modelos de voz, feito uma vez por você.

---

## Nota

Projeto pessoal, sem afiliação à Marvel ou aos detentores da marca Iron Man.
"J.A.R.V.I.S." é usado aqui como homenagem ao personagem.
