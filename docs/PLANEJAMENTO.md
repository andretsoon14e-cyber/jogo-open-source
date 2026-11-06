# Fase 1 — Planejamento

Documento de decisões tomadas **antes** de escrever o código, com o ambiente real analisado.

---

## 1. Ambiente analisado

| Item | Resultado |
| --- | --- |
| Python | 3.11 (testado nesta versão) |
| Sistema de desenvolvimento | Linux x86_64 (sandbox) |
| Sistema alvo do usuário | **Windows** (primário), Linux/macOS suportados |
| Navegador | interface web local, sem build, sem CDN |
| Dependências instaláveis | `fastapi`, `uvicorn`, `psutil`, `PyYAML`, `vosk`, `pyttsx3` |
| Motores de voz presentes no sandbox | nenhum modelo instalado — por isso o sistema declara a limitação em vez de falhar em silêncio |
| GPU | não necessária para nenhum componente obrigatório |

Consequência direta: **a arquitetura precisa degradar com elegância**. Se o modelo de voz não
existir, a interface continua útil por texto; se o sensor de temperatura não existir, o painel
mostra “sem sensor”; se `wmctrl` não existir no Linux, o controle de janelas avisa que só existe
no Windows.

---

## 2. Requisitos funcionais → solução técnica

| Requisito | Decisão | Motivo |
| --- | --- | --- |
| Sem IA externa | interpretador de intenções por regras + sinônimos + extração de slots | previsível, auditável, offline, sem custo |
| Entender frases informais | normalização (acentos, abreviações, sinônimos canônicos) + casamento difuso por similaridade | tolera variações sem modelo neural |
| Voz offline | **Vosk** (modelo pequeno pt-BR) como padrão; **whisper.cpp** como alternativa opcional | ambos rodam em CPU, sem rede |
| Fala natural | **Piper** (voz neural local) → **pyttsx3/SAPI5** → **espeak** → vozes do navegador | cadeia de fallback garante voz mesmo sem instalação extra |
| Palavra de ativação | detecção sobre a transcrição com tolerância a erros (“jarves”, “jarvis”, “jar vis”) | não exige modelo dedicado de wake word |
| Interface futurista | HTML/CSS/JS puro + Canvas 2D | zero build, zero CDN, funciona offline, fácil de manter |
| Controle do Windows | `ctypes` (janelas, bloqueio), `subprocess` (energia), `pycaw` (volume), `winreg` (autostart) | APIs nativas, sem pacotes pesados |
| Memória persistente | SQLite via `sqlite3` da biblioteca padrão | sem servidor, backup é copiar um arquivo |
| Segurança | 3 níveis + confirmação + auditoria + allowlist de pastas | requisito explícito do projeto |
| Modularidade | pacotes por responsabilidade + registro de comandos por decorador | adicionar comando = um decorador |

---

## 3. Tecnologias descartadas (e por quê)

| Alternativa | Motivo do descarte |
| --- | --- |
| OpenAI / Gemini / Anthropic APIs | proibido pelo requisito fundamental |
| Web Speech API (`SpeechRecognition`) do Chrome | envia áudio para servidores do Google — viola a privacidade |
| Electron | ~150 MB só para a casca; um servidor local + navegador entrega o mesmo resultado |
| React/Vite/webpack | exigiria `node_modules` e build para uma interface que precisa rodar offline |
| Whisper “grande” em Python | pesado em CPU, dependência de PyTorch; whisper.cpp cobre o caso |
| Rasa / spaCy para NLU | modelos grandes e treino; regras explícitas atendem o escopo e são auditáveis |
| Banco PostgreSQL | servidor desnecessário; SQLite resolve e simplifica o backup |
| `shell=True` com texto do usuário | risco de injeção de comando — bloqueado por decisão de projeto |

---

## 4. Requisitos de hardware

| Recurso | Mínimo | Recomendado |
| --- | --- | --- |
| CPU | 2 núcleos | 4 núcleos (Vosk usa ~1 núcleo durante a fala) |
| RAM | 4 GB (assistente ~150–300 MB) | 8 GB |
| Disco | 300 MB (código + modelos de voz) | 1 GB |
| Áudio | microfone e saída | headset com cancelamento de eco |
| GPU | não necessária | acelera um eventual modelo local (opt-in) |
| Rede | **nenhuma** após a instalação | — |

Consumo observado no desenvolvimento: processo Python entre 60 e 180 MB, CPU ocioso abaixo de
2% (a telemetria é amostrada a cada 3 s; o orbe pausa quando a aba está em segundo plano).

---

## 5. Riscos identificados e mitigação

| Risco | Mitigação implementada |
| --- | --- |
| Reconhecimento errar palavras | normalização + sinônimos + similaridade + confirmação em ações críticas |
| Áudio do microfone vazar para a rede | apenas `127.0.0.1`; nenhuma chamada externa no código de voz |
| Comando destrutivo acidental | níveis de autorização, lista de padrões proibidos, prévia obrigatória, auditoria |
| Interpretador confundir intenções | padrões específicos com prioridade, testes parametrizados (207 no total) |
| Interface “bonita mas inútil” | todos os painéis leem dados reais da API; botões executam comandos reais |
| Dependência de modelo de voz ausente | cadeia de fallback + mensagem explícita na interface e no diagnóstico |
| Credenciais/senhas | o projeto **não** armazena senhas; não há campo para isso |
| Escopo crescer sem controle | fases com documentação e testes por etapa |

---

## 6. Arquitetura escolhida (visão de 30 segundos)

```
navegador (HUD)  ──HTTP/WebSocket──►  FastAPI local  ──►  Assistant (núcleo)
                                                            │
                    ┌───────────────────────────────────────┼─────────────────────┐
                    ▼                                       ▼                     ▼
            NLU (regras + slots)                   Segurança (3 níveis)     Eventos (bus)
                    │                                       │                     │
                    ▼                                       ▼                     ▼
            comandos registrados  ──────────►  execução no sistema      personalidade/voz
                    │                                       │
                    └────────────► SQLite (memória, tarefas, rotinas, auditoria)
```

Fluxo de uma frase: normalizar → casar intenção → extrair slots → verificar nível →
(confirmar) → executar → registrar auditoria → responder → falar.

---

## 7. Critérios de aceite usados nas fases seguintes

1. O programa inicia sem exceções e sem modelos de voz instalados.
2. Toda funcionalidade visível na interface executa uma ação real.
3. Nenhuma ação de nível ≥ 2 ocorre sem confirmação.
4. Todo comando executado aparece na auditoria.
5. Os testes automatizados passam por completo (`python -m pytest tests -q`).
6. A documentação descreve os comandos que realmente existem (gerada do código).
7. Se algo não é possível, a resposta é explícita — nunca inventada.
