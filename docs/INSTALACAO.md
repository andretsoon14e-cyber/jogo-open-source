# Instalação e uso

## Requisitos

- **Windows 10/11** (alvo principal) · Linux · macOS
- **Python 3.10+** (testado em 3.11)
- Navegador moderno (Chrome, Edge, Firefox)
- Microfone (opcional, para comandos por voz)

---

## Windows — passo a passo

### 1. Instalar o Python

Baixe em [python.org](https://www.python.org/downloads/) e **marque “Add Python to PATH”** na
primeira tela do instalador. Confira em um terminal:

```bat
python --version
```

### 2. Obter o projeto e instalar as dependências

```bat
cd C:\caminho\do\jogo-open-source
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> Alternativa: dê dois cliques em **`jarvis.bat`**. Ele cria o ambiente virtual, instala as
> dependências e inicia o assistente automaticamente.

### 3. (Opcional, recomendado) instalar os modelos de voz

```bat
python scripts\setup_models.py
```

O script explica o que será baixado, pede confirmação e instala:

- **Vosk** `vosk-model-small-pt-0.3` (~50 MB) → reconhecimento offline;
- **Piper** + voz `pt_BR-faber-medium` (~65 MB) → voz neural masculina.

Se preferir instalar manualmente, coloque os arquivos em `models/` e ajuste
`config/user.yaml` (o script já faz isso por você).

### 4. Iniciar

```bat
python jarvis.py
```

A interface abre em `http://127.0.0.1:8765`. Para escolher porta/endereço:

```bat
python jarvis.py --port 9000 --no-browser
```

### 5. Iniciar com o Windows (opcional)

Peça ao assistente: **“Jarvis, inicia com o Windows”** (nível 3, pedirá confirmação), ou
marque manualmente `jarvis.bat` na pasta Inicializar (`shell:startup`).

---

## Linux / macOS

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/setup_models.py     # baixa Vosk; Piper precisa de build próprio no Linux
./jarvis.sh
```

No Linux, o controle de janelas requer `wmctrl` (`sudo apt install wmctrl`) e o volume usa
`pactl`/`amixer`. No macOS, o volume usa `osascript`.

---

## Verificação do ambiente

```bash
python jarvis.py --diagnose
```

Mostra Python, sistema, dependências presentes/ausentes, estado dos motores de voz, métricas
do computador e testa o interpretador com frases reais. Nada é enviado para a internet.

```bash
python jarvis.py --test-command "desliga o computador daqui a 30 minutos"
# intent .....: system.power
# confiança ..: 0.65
# nível ......: 3
# slots ......: {'duration': 1800, ...}
```

---

## Modos de uso

| Comando | O que faz |
| --- | --- |
| `python jarvis.py` | interface completa no navegador |
| `python jarvis.py --console` | conversa no terminal |
| `python jarvis.py --diagnose` | diagnóstico do ambiente |
| `python jarvis.py --test-command "..."` | testa o reconhecimento de uma frase |
| `python jarvis.py --port 9000` | porta alternativa |
| `python jarvis.py --no-browser` | não abre o navegador |

---

## Configuração

`config/default.yaml` guarda os padrões (versionados). Suas mudanças vão para
`config/user.yaml` (ignorado pelo git) e podem ser feitas pela aba **Ajustes** da interface.

Ajustes mais úteis:

| Chave | Efeito |
| --- | --- |
| `assistant.user_title` | como ele se refere a você (“Senhor”, “Doutor”, …) |
| `personality.formality` / `humor` / `verbosity` | tom das respostas |
| `voice.wake_word.enabled` | liga/desliga a palavra “Jarvis” |
| `voice.stt.engine` | `auto`, `vosk`, `whisper_cpp` ou `disabled` |
| `voice.tts.engine` | `auto`, `piper`, `pyttsx3`, `espeak`, `browser` ou `disabled` |
| `security.confirm_level` | a partir de qual nível pede confirmação (1, 2 ou 3) |
| `security.allowed_roots` | pastas onde operações de arquivo são permitidas |
| `system.apps` | apelidos de programas (“discord”, “vscode”, …) |
| `llm.enabled` | ativa o modelo de linguagem **local** (opt-in explícito) |

Adicionar um programa ao dicionário:

```yaml
system:
  apps:
    meu jogo: "C:/Games/MeuJogo/jogo.exe"
```

Depois basta dizer: **“Jarvis, abre meu jogo”**.

---

## Problemas comuns

| Sintoma | Solução |
| --- | --- |
| “Modelo Vosk não encontrado” | `python scripts/setup_models.py --vosk` |
| Microfone não ativa | o navegador exige permissão; em `http://127.0.0.1` a permissão é aceita. Verifique se não há outro app usando o microfone |
| Não ouve nada | aba Anônima e acessos por IP de rede bloqueiam o microfone; use `127.0.0.1` |
| Voz robótica | instale o Piper (`--piper`) ou uma voz pt-BR no Windows (Configurações → Hora e idioma → Fala) |
| Voz não sai | `voice.tts.engine: disabled` em `config/user.yaml`, ou o navegador está sem vozes locais — digite e leia as respostas |
| “não encontrei nenhum programa chamado X” | cadastre o caminho em `system.apps` |
| Acesso negado a um caminho | adicione a pasta em `security.allowed_roots` |
| Porta 8765 ocupada | `python jarvis.py --port 8899` |
| Interface sem dados de sistema | rode novamente `--diagnose`; `psutil` precisa estar instalado |
| Antivírus reclama do atalho de inicialização | a alteração é apenas uma entrada `HKCU\...\Run` — removível com “Jarvis, desativa a inicialização automática” |

---

## Desinstalação

1. Desative a inicialização automática (“Jarvis, desativa a inicialização automática”).
2. Apague a pasta do projeto.
3. Se quiser remover seus dados, apague `data/` (banco, logs, auditoria) e `models/`.

Nenhum serviço é instalado e nenhuma chave de registro extra é criada além da entrada de
inicialização opcional.
