# Roadmap

## Entregue nesta versão (1.0.0)

- [x] Fase 1 — planejamento, escolha de tecnologias, riscos (`docs/PLANEJAMENTO.md`)
- [x] Fase 2 — núcleo, configuração em camadas, SQLite, inicialização, logs
- [x] Fase 3 — HUD futurista com núcleo animado por estado, telemetria, painéis, modo mini
- [x] Fase 4 — STT offline (Vosk/whisper.cpp), TTS local (Piper/pyttsx3/espeak/navegador),
      palavra de ativação, fim de fala automático, interrupção
- [x] Fase 5 — interpretador de 89 intenções com sinônimos, slots, compostos e fallback honesto
- [x] Bateria de regressão de NLU (`scripts/nlu_battery.py`, 84 frases) rodando também no pytest
- [x] Fase 6 — programas, janelas, arquivos, energia, volume, rotinas, agendamentos
- [x] Fase 7 — memória, notas, tarefas, lembretes, objetivos, agenda, timers
- [x] Fase 8 — personalidade, confirmações, conselheiro, explicações sobre si mesmo
- [x] Fase 9 — 207 testes automatizados, bateria de frases, smoke test, diagnóstico de ambiente

---

## Próximos passos sugeridos

Ordenados por relação custo/benefício. Nenhum deles exige IA na nuvem.

### Curtos (1–2 dias cada)

1. **Modo “sempre à escuta” com modelo Vosk dedicado** — reduzir o consumo de CPU reutilizando
   o reconhecedor entre frases em vez de criar um por requisição.
2. **Wake word por palavra-chave configurável** — permitir trocar “Jarvis” por outro nome
   (o detector já é genérico; falta expor na interface).
3. **Histórico navegável na interface** — busca no histórico de conversas com filtro por intenção.
4. **Notificações nativas do sistema** — Windows toast (via `winrt` ou `powershell`) e
   `notify-send` no Linux, mantendo o aviso na interface como fallback.
5. **Ajuste fino de volume por aplicativo** (Windows, `pycaw`) — “abaixa o volume do Chrome”.

### Médios (1 semana)

6. **Busca por conteúdo em arquivos locais** — índice invertido SQLite FTS5 sobre `.txt/.md/.pdf`
   com extração local; permite “encontre o documento que fala de orçamento”.
7. **Pomodoro e rotinas temporizadas** — rotina com pausas (“modo foco por 25 minutos”).
8. **Painel de automações visuais** — editor de passos com reordenação e teste antes de salvar.
9. **Múltiplos perfis de memória** — separar trabalho/pessoal com troca por voz.
10. **Pacote Windows (.exe)** — PyInstaller com ícone, atalho e inicialização opcional, para
    dispensar o terminal.

### Longos (requer planejamento)

11. **Modelo local integrado e opcional** — gerenciador que baixa um LLM pequeno por escolha
    explícita, com indicador de que a conversa é processada localmente.
12. **Visão computacional local** — “o que está na minha tela?” com OCR (Tesseract) e captura
    local; sem envio de imagens.
13. **Integração com calendário local** — `.ics` em disco, sem servidor.
14. **Comandos por gesto/atalho global** — hotkey do Windows para abrir o modo mini.
15. **Plugins de terceiros** — API de comandos com assinatura e sandbox de permissões.

---

## Ideias descartadas (por contrariarem o projeto)

- Qualquer API de LLM na nuvem (OpenAI, Gemini, Anthropic).
- `SpeechRecognition` do Chrome (envia áudio ao Google).
- Telemetria de uso, contas de usuário, sincronização em nuvem.
- Instalação automática de programas sem autorização.

---

## Como contribuir com um módulo novo

1. Crie `jarvis/commands/meu_modulo.py` com decoradores `@command`.
2. Registre em `jarvis/nlu/engine.py::load_commands()`.
3. Adicione testes em `tests/` (frases → intenção esperada).
4. Rode `python scripts/gen_commands_doc.py` para atualizar `docs/COMANDOS.md`.
5. `python -m pytest tests -q` precisa passar antes de abrir PR.
