# Arquitetura

## 1. Mapa de módulos

```
jarvis/
├── core/            assistente (orquestrador), configuração, estado, eventos, personalidade
├── nlu/             normalização pt-BR, extração de slots, motor de intenções
├── commands/        comandos registrados (conversa, sistema, apps, arquivos, memória,
│                    organização, rotinas, conselheiro, voz)
├── system/          integração com o SO (programas, janelas, energia, volume, arquivos)
├── voice/           STT, TTS e palavra de ativação
├── memory/          SQLite (schema + repositórios)
├── personal/        agendador (lembretes, timers, tarefas programadas)
├── security/        permissões, confirmações pendentes, auditoria
├── advisor/         conselheiro local + adaptador opcional de modelo local
└── server/          API HTTP + WebSocket + arquivos estáticos da interface
web/                 HUD (HTML/CSS/JS puro, Canvas 2D)
```

Cada módulo depende apenas de `core/config`, `core/bus` e `memory/db`. Não há acoplamento
circular: `commands` conhece o contexto (`Context`), que expõe o assistente já montado.

---

## 2. Fluxo de uma interação

```
1. Interface/WS ─► Assistant.handle_text(texto, origem)
2. remove palavra de ativação, normaliza e casa intenção (nlu.engine)
3. monta Context (assistente, texto, slots, match, dry_run)
4. Security: nível do comando × security.confirm_level
     ├─ precisa confirmação → cria PendingAction (executor + prévia) → estado CONFIRMING
     └─ não precisa       → executa o handler
5. handler retorna Response (texto, dados, pendências, ações)
6. Auditoria grava a ação | conversa vai para o SQLite
7. Evento "assistant_message" no bus → interface
8. Evento "speak" → TTS local (backend) ou vozes do sistema no navegador
9. Estado volta para IDLE
```

O mesmo caminho é usado por voz, texto, console, rotinas e agendador — só muda `source`.

---

## 3. Motor de intenções (sem IA externa)

Uma intenção é declarada assim:

```python
@command("system.volume.mute",
         must=[["silenciar"]],
         category="sistema",
         description="Silencia o som do sistema",
         examples=["Jarvis, silencia o som"],
         priority=4)
def mute(ctx: Context):
    success, message = volume.mute()
    return ok(ctx, message) if success else err(ctx, message)
```

O casamento funciona em quatro etapas:

1. **Normalização** — minúsculas, sem acento, pontuação removida, abreviações (`vc` → `voce`),
   sinônimos canônicos (`abre`/`abra`/`abri` → `abrir`; `pc` → `computador`), horas coladas
   (`23h` → `23 horas`, `19h30` → `19:30`).
2. **Grupos obrigatórios** (`must`) — cada grupo é uma lista de alternativas; todas precisam
   aparecer na frase, em qualquer ordem.
3. **Tolerância a erro** — palavras com 5+ letras aceitam similaridade ≥ 0,87 (palavras curtas
   exigem igualdade, para não gerar falso positivo).
4. **Desempate** — vence o padrão com mais grupos atendidos; `priority` resolve empates;
   o texto residual vira o slot livre (nome de programa, arquivo, rotina, título).

Slots extraídos automaticamente: duração (`30 minutos`, `2h30`, `meia hora`), data/hora
(`amanhã às 14h`, `segunda às 10`, `daqui a 30 minutos`, `dia 12 de março`), número, caminho,
texto entre aspas e “residual” (o que sobrou da frase).

**Limite consciente:** frases fora dos padrões não são “adivinhadas” — o assistente responde
que não entendeu e sugere exemplos. Para conversa aberta existe o modelo local opcional.

---

## 4. Segurança

`PermissionManager` guarda confirmações pendentes em memória com TTL de 180 s:

```python
pending = permissions.create_pending(
    intent="file.delete", description="excluir “nota.txt”", level=3,
    executor=lambda: plan.execute(), preview=plan.preview(),
)
```

- handlers de risco montam a **prévia** primeiro (`ctx.dry_run=True`);
- a interface mostra descrição, nível e itens afetados;
- aprovar dispara o `executor`; recusar descarta sem tocar em nada;
- expirar também descarta;
- cada transição vai para a auditoria (`security.confirm_request`, `..._approved`, `..._denied`).

Caminhos passam por `check_path()`: allowlist de raízes (`~/Downloads`, `~/Documents`, …) e
blocklist de áreas do sistema.

---

## 5. Eventos (WebSocket)

| Tipo | Conteúdo |
| --- | --- |
| `snapshot` | estado completo ao conectar |
| `state` | mudança de estado do núcleo (idle, listening, …) |
| `user_message` / `assistant_message` | transcrição, intenção, confiança, pendência |
| `speak` | texto + áudio base64 quando há TTS local |
| `notification` | lembretes, timers, falhas |
| `metrics` | snapshot do sistema a cada 3 s |
| `routine` | progresso de uma rotina |
| `system` / `settings` / `voice` | atualização de módulos e preferências |
| `stop` | interromper fala (barge-in) |

---

## 6. Banco de dados (`data/jarvis.db`)

| Tabela | Conteúdo |
| --- | --- |
| `memories` | fatos, preferências, perfil (com categoria, origem e datas) |
| `conversations` | histórico do diálogo (papel, texto, intenção, metadados) |
| `tasks` / `reminders` / `notes` / `goals` | organização pessoal |
| `routines` | automações com passos em JSON e contador de execuções |
| `schedules` | tarefas programadas (uma vez ou com horário) |
| `timers` | contagens regressivas |
| `audit` | registro de ações (nível, resultado, confirmado) |
| `settings` | preferências chave-valor |

SQLite em modo WAL, com `RLock` para acesso concorrente entre scheduler, API e handlers.
Backup = copiar um arquivo.

---

## 7. Voz

```
navegador: getUserMedia ─► AudioContext ─► ScriptProcessor (PCM)
                               └─► AnalyserNode ─► nível para o orbe (espectro circular)
     VAD local (RMS) detecta fala e silêncio ─► WAV 16 kHz mono
                                        └─► POST /api/voice/transcribe (só localhost)
servidor: Vosk/whisper.cpp transcreve ─► núcleo ─► resposta
     TTS local (Piper/pyttsx3/espeak) ─► WAV em base64 ─► navegador toca
     sem motor local ─► Web Speech API do sistema (vozes locais) no navegador
```

- **Fim de fala:** 950 ms de silêncio (configurável), com 300 ms de pré-roll para não cortar
  a primeira sílaba.
- **Interrupção:** ao detectar voz enquanto ele fala, o áudio para imediatamente; “jarvis, pare”
  também cancela confirmações pendentes.
- **Palavra de ativação:** tolerante (`jarves`, `jar vez`, `jar vis`) e desativável.

---

## 8. Como adicionar um comando

```python
# jarvis/commands/meu_modulo.py
from ..nlu.engine import command
from .base import Context
from .helpers import ok

@command("minha.ideia",
         must=[["lembrete", "nota"], ["criar"]],   # grupos obrigatórios
         optional=[["rapido"]],
         extract_names=["when"],
         level=1,
         category="organizacao",
         description="Exemplo de comando novo",
         examples=["crie uma nota rápida"])
def minha_ideia(ctx: Context):
    return ok(ctx, f"Você pediu: {ctx.clean}")
```

Depois adicione o módulo em `jarvis/nlu/engine.py::load_commands()` e rode
`python -m pytest tests -q` + `python scripts/gen_commands_doc.py`.

Regras: nunca usar `shell=True` com texto do usuário; operações de arquivo passam por
`ctx.permissions.check_path`; ações destrutivas declaram `level=3` e usam `ask_confirmation`.

---

## 9. Decisões de robustez

- Falha em um handler nunca derruba o processo: `_dispatch` captura exceção, audita e responde.
- `AuditLog` engole erros de I/O para não interromper a ação principal.
- Configuração corrompida cai para os padrões.
- WebSocket reconecta com backoff; a interface funciona mesmo se o WS cair (usa REST).
- O `ResizeObserver` mantém o canvas nítido; a animação pausa com a aba oculta.
