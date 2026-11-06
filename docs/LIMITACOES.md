# Limitações e alternativas locais

Documento para deixar claro **o que o J.A.R.V.I.S. não é**, e o que fazer quando você precisar
de algo além do escopo atual. Nada aqui é promessa vaga: cada item descreve o comportamento real.

---

## 1. Compreensão de linguagem

**O que existe:** 81 intenções programadas, normalização de português, sinônimos, tolerância a
erros de reconhecimento, extração de datas/durações/números/caminhos, encadeamento de frases
compostas (“anote X e quais são minhas tarefas”).

**O que não existe:** compreensão de linguagem aberta. Perguntas fora dos padrões recebem:

> “Não tenho certeza de como interpretar esse pedido… Diga ‘ajuda’ para ver tudo o que sei fazer.”

Isso é intencional: sem IA generativa, fingir compreensão seria inventar. O sistema nunca gera
uma resposta como se tivesse entendido algo que não entendeu.

**Alternativa:** cadastrar mais padrões (é uma linha de código por variação) ou habilitar o
modelo local (item 3).

---

## 2. Conhecimento geral

O assistente **não** tem base enciclopédica. “Qual a capital da Mongólia?” recebe uma resposta
honesta de limitação, não um chute.

O que ele faz no lugar:

- estrutura o **raciocínio** (critérios, riscos, próximos passos, vícios de raciocínio);
- consulta sua **memória local** e suas anotações;
- explica o **próprio funcionamento** (memória, voz, segurança, arquitetura, privacidade);
- transforma objetivos em tarefas e marcos.

---

## 3. Conversa aberta: modelo de linguagem **local** (opt-in)

Se você quiser diálogo aberto de verdade, é possível rodar um modelo **na sua máquina**:

```bash
# exemplo com Ollama (127.0.0.1:11434) — instalação por sua conta
ollama pull qwen2.5:3b-instruct
```

Depois, na aba **Ajustes**:

- marque **“Modelo de linguagem local (opt-in)”**;
- endpoint: `http://127.0.0.1:11434`;
- modelo: `qwen2.5:3b-instruct`.

O assistente passa a usar esse modelo apenas quando habilitado, e o tráfego é `localhost` —
nada sai para a internet. **Ele não instala nem ativa nada sozinho**: a decisão e a instalação
são suas. Sem o endpoint respondendo, o sistema volta ao comportamento por regras.

Requisitos aproximados para um modelo de 3B quantizado: 4–6 GB de RAM livre (ou GPU com 6 GB),
~2 GB de disco. Respostas em CPU são lentas (segundos por frase) — use modelos pequenos.

> O adaptador está implementado em `jarvis/advisor/advisor.py` (`local_chat`). Nesta entrega ele
> permanece **desativado por padrão**, exatamente como você pediu.

---

## 4. Voz

| Item | Realidade |
| --- | --- |
| Reconhecimento | precisa do modelo Vosk (ou whisper.cpp) instalado; sem ele, o microfone informa indisponibilidade |
| Precisão | boa para comandos curtos em ambiente silencioso; nomes próprios e números ainda erram |
| Ruído | microfone distante ou ar-condicionado aumentam erros |
| Latência | Vosk pequeno: ~0,3–1 s para uma frase curta em CPU |
| Síntese | Piper soa natural; pyttsx3/SAPI5 é aceitável; espeak é robótico; vozes do navegador variam por sistema |
| Vozes “Google” do Chrome | são sintetizadas na nuvem — o projeto prioriza vozes **locais** (`localService`) |
| Interrupção | funciona por detecção de voz e por “jarvis, pare” |
| Sotaques regionais | o modelo Vosk é pt-BR genérico; sotaques fortes podem reduzir a precisão |

---

## 5. Controle do computador

| Recurso | Windows | Linux | macOS |
| --- | --- | --- | --- |
| Abrir/fechar programas | ✅ nativo | ✅ | ✅ |
| Janelas (minimizar/maximizar/alternar) | ✅ API nativa | ⚠️ requer `wmctrl` | ❌ |
| Volume preciso | ✅ com `pycaw` (senão teclas de mídia) | ✅ `pactl`/`amixer` | ✅ `osascript` |
| Desligar/reiniciar/suspender | ✅ | ✅ (systemctl) | ✅ |
| Bloquear tela | ✅ | ✅ (loginctl/xdg-screensaver) | ✅ |
| Temperatura | ⚠️ depende de sensores expostos | ⚠️ idem | ⚠️ idem |
| Inicialização automática | ✅ registro HKCU | ✅ `.desktop` | ❌ |
| Lixeira ao excluir | ✅ com `send2trash` | ✅ | ✅ |

Além disso: alterar **janela específica** depende do título — programas com títulos dinâmicos
podem não ser encontrados pelo nome. O assistente avisa quando não localiza.

---

## 6. Arquivos

- Busca por **nome** (não por conteúdo, exceto em anotações/memória).
- Profundidade limitada (5 níveis) e sem entrar em `node_modules`, `AppData`, `Windows`.
- Duplicados por tamanho + SHA-256 (confiável, mas lê os arquivos).
- Organização por categoria move arquivos para subpastas (`Imagens`, `Documentos`, …); não apaga
  nada sem confirmação de nível 3.
- Operações são síncronas: mover milhares de arquivos grandes pode levar alguns segundos e a
  interface fica no estado “executando”.

---

## 7. Agendamentos

Enquanto o programa estiver aberto, os lembretes disparam normalmente. Se o computador estiver
desligado no horário, o lembrete dispara na próxima abertura (o banco guarda a data original e a
tela mostra o atraso). Não há serviço do Windows — é decisão de projeto para não instalar nada
no sistema sem autorização explícita.

`desligar às 23h` usa o agendador nativo do sistema operacional (`shutdown /t`, `systemctl`), então
funciona mesmo se o assistente for fechado depois.

---

## 8. Interface

- Feita para desktop; em telas pequenas os painéis laterais se recolhem.
- Modo compacto é uma janela do navegador — não é uma janela “always on top” do Windows.
- Sem notificações nativas do sistema operacional; os avisos aparecem na própria interface
  (e são falados, se a voz estiver ativa).
- Vários navegadores exigem `localhost/127.0.0.1` ou HTTPS para liberar o microfone.

---

## 9. O que nunca será prometido

- Compreensão de qualquer pergunta sem base local.
- Instalação de programas, alteração de registro, envio de e-mail ou compras.
- Conexão com serviços de IA na nuvem.
- “Aprender sozinho” com suas conversas: a memória só guarda o que você pedir explicitamente.


## Identificação de locutor

Não há verificação de quem está falando: qualquer voz ao alcance do microfone pode dar comandos,
inclusive de nível 1. Se isso importa para você, use `security.confirm_level: 3`, mantenha o
microfone desligado por padrão e ative-o pelo botão apenas quando for usar.

## Abrir um arquivo específico por voz

Pastas são abertas ("abre a pasta de documentos", "abre downloads"), mas abrir **um arquivo**
("abre o relatorio.pdf") não tem comando próprio: o programa tenta interpretar como aplicativo e
responde que não conhece. Use o explorador de arquivos ou a busca por nome.

## Agendamentos recorrentes

"Me avisa às 18h" cria um aviso único; "toda sexta às 18h" não é interpretado como recorrência.
A tabela `schedules` existe e a interface lista o que está programado, mas o parser de recorrência
por voz é uma evolução planejada — não uma funcionalidade entregue.
