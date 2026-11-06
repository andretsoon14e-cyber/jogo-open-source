# Segurança e privacidade

O assistente tem acesso a partes sensíveis do computador. Por isso a política de segurança é
parte da arquitetura, não um detalhe.

---

## 1. Três níveis de autorização

| Nível | Definição | Exemplos | Comportamento |
| --- | --- | --- | --- |
| **1 — simples** | não altera nem destrói nada | abrir programas, hora, telemetria, volume, listar arquivos, procurar | executa direto |
| **2 — altera dados** | modifica ou interrompe algo | fechar programa, criar/renomear/mover/copiar, organizar pasta, bloquear tela | mostra prévia e pede confirmação |
| **3 — crítica** | irreversível ou sistêmica | excluir arquivo, desligar/reiniciar/suspender, apagar memória, autostart | confirmação explícita, destaque âmbar, expira em 180 s |

O gatilho de confirmação é configurável:

```yaml
security:
  confirm_level: 2      # 1 = pede em tudo; 2 = padrão; 3 = só críticas
  default_confirm: true
```

Mesmo com `confirm_level: 3`, ações de nível 3 **sempre** confirmam. Para reduzir fricção sem
perder controle, o nível 2 é o equilíbrio recomendado.

---

## 2. Como a confirmação funciona

1. O comando é interpretado, mas **não executado**.
2. O handler monta um plano/prévia (ex.: “12 arquivos serão movidos para Imagens, Documentos…”).
3. `PermissionManager` cria uma `PendingAction` com prazo de 180 segundos.
4. A interface mostra nível, descrição e itens afetados; o mesmo vale por voz
   (“…confirma a execução? Diga confirmo ou cancela”).
5. Aprovar executa exatamente o plano mostrado. Recusar (ou o tempo expirar) não altera nada.

Enquanto uma confirmação está pendente, o núcleo fica no estado **Aguardando autorização** —
ele não fica ouvindo comandos por cima de uma decisão crítica.

---

## 3. Bloqueios automáticos

- **Padrões proibidos** (`security.forbidden_patterns`): `rm -rf /`, `mkfs`, `diskpart`,
  `format c:`, `bcdedit`, `reg delete hklm` etc. Se a frase contiver um deles, a ação é
  recusada e registrada como bloqueada.
- **Processos críticos**: `explorer.exe`, `lsass.exe`, `svchost.exe`, `systemd`, `launchd`…
  nunca são encerrados.
- **Pastas protegidas** (`security.protected_paths`): `C:\Windows`, `Program Files`, `/etc`,
  `/usr`, `/boot`. Escrita é negada.
- **Allowlist de escrita** (`security.allowed_roots`): por padrão sua pasta de usuário e
  subpastas (Downloads, Documentos, Desktop…). Fora disso, escrita só com liberação explícita.
- **Exclusão**: usa a lixeira quando `send2trash` está disponível; caso contrário, é nível 3 com
  aviso claro na prévia.
- **Sem `shell=True`**: texto do usuário nunca vira comando de shell; programas são executados
  como argumentos separados.

---

## 4. Auditoria

Toda ação relevante é registrada em dois lugares:

- tabela `audit` em `data/jarvis.db` (ação, detalhe, nível, resultado, se foi confirmada);
- `data/logs/audit.jsonl` (uma linha JSON por evento, fácil de inspecionar).

Exemplos registrados: `security.confirm_request`, `security.confirm_approved`,
`security.confirm_denied`, `security.block`, `app.open`, `files.plan`, `file.delete`,
`power.shutdown`, `memory.add`, `routine.run`, `command.error`.

Na interface, aba **Logs**, você vê as últimas ações e o log técnico.

---

## 5. Privacidade

| Dado | Onde fica | Sai da máquina? |
| --- | --- | --- |
| Áudio do microfone | memória temporária → transcrição | **não** (só para `127.0.0.1`) |
| Transcrições e conversas | SQLite + histórico | **não** |
| Memória pessoal, tarefas, notas | SQLite | **não** |
| Logs e auditoria | `data/logs/` | **não** |
| Modelos de voz | `models/` | **não** |
| Preferências | `config/user.yaml` | **não** |

O servidor escuta em `0.0.0.0` para permitir acesso pela rede local (útil para testar em outro
dispositivo). Se quiser restringir ao próprio computador:

```yaml
interface:
  host: "127.0.0.1"
```

**Microfone:** pode ser desligado por voz (“desliga o microfone”), pelo botão da interface ou
por `security.microphone_enabled: false`. Desligado, nenhum áudio é capturado — a interface
continua funcionando por texto.

**Senhas:** o projeto não possui campo de senha nem cofre. Não armazene credenciais em
memórias ou notas; elas ficariam em texto simples no banco local.

---

## 6. Limites honestos da proteção

- O assistente roda com as **permissões do seu usuário**. Se você é administrador, ele também é.
  Não há sandbox de processo.
- A allowlist de pastas protege contra acidentes e comandos mal interpretados, **não** contra
  alguém com acesso físico à máquina.
- O banco SQLite não é criptografado. Se precisar, use o BitLocker (Windows) ou uma pasta
  criptografada para `data/`.
- O acesso à interface não tem autenticação: qualquer pessoa na mesma rede que alcance a porta
  8765 pode usá-la. Mantenha `host: 127.0.0.1` se estiver em rede compartilhada.
- Interpretação por regras reduz (mas não elimina) o risco de uma frase ambígua virar uma ação
  indesejada — daí a confirmação obrigatória nos níveis 2 e 3.


## Por que criar nota/tarefa é nível 1 e apagar é nível 3

Criar uma anotação, tarefa ou lembrete é uma ação que o usuário pediu explicitamente naquele
comando, reversível e visível na interface — por isso roda direto (nível 1). Já remover dados
(memória, histórico, arquivos) é irreversível: `memory.clear` e exclusões de arquivo são nível 3
com prévia do que será apagado; limpar o histórico de conversas é nível 2 (confirmação simples,
sem dupla checagem), porque não toca na memória de longo prazo.

O interpretador também bloqueia padrões destrutivos conhecidos (`security.forbidden_patterns`)
antes de executar qualquer coisa, mesmo quando a frase casa com uma intenção válida.
