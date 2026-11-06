/* Camada de interface: transcrição, painéis, modais, avisos e telemetria. */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const STATE_TEXT = {
  offline: ['OFFLINE', 'sistemas desligados'],
  idle: ['INATIVO', 'diga “jarvis” ou escreva um comando'],
  wake: ['ATIVO', 'pode falar'],
  listening: ['ESCUTANDO', 'fale naturalmente — detecto quando terminar'],
  processing: ['PROCESSANDO', 'interpretando seu pedido'],
  executing: ['EXECUTANDO', 'aplicando a ação no computador'],
  speaking: ['FALANDO', 'diga “jarvis, pare” para interromper'],
  confirming: ['AGUARDANDO AUTORIZAÇÃO', 'confirme na tela ou diga “confirmo”'],
  error: ['ERRO', 'algo impediu a ação — veja os detalhes'],
};

const LEVEL_LABEL = { 1: 'nível 1 · simples', 2: 'nível 2 · altera dados', 3: 'nível 3 · crítica' };

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function timeLabel(timestamp) {
  const date = timestamp ? new Date(timestamp * 1000) : new Date();
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function whenLabel(timestamp) {
  if (!timestamp) return 'sem data';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `hoje ${time}`;
  if (tomorrow) return `amanhã ${time}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export const ui = {
  state: 'idle',
  cpuHistory: [],
  confirmResolver: null,
  confirmTimer: null,

  init() {
    this.transcriptEl = $('#transcript');
    this.stateLabelEl = $('#state-label');
    this.stateHintEl = $('#state-hint');
    this.toastsEl = $('#toasts');
    this.clockTimeEl = $('#clock-time');
    this.clockDateEl = $('#clock-date');

    this._bindTabs();
    this._bindModals();
    this._tickClock();
    setInterval(() => this._tickClock(), Number(this.clockInterval || 1000));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hideConfirm(false);
        this.hideHelp();
      }
    });
  },

  /* ------------------------------------------------------------------ estado */
  setState(state, extra = {}) {
    this.state = state;
    document.body.dataset.state = state;
    const [label, hint] = STATE_TEXT[state] || STATE_TEXT.idle;
    if (this.stateLabelEl) this.stateLabelEl.textContent = label;
    if (this.stateHintEl) this.stateHintEl.textContent = extra.error || hint;
    const statusEl = $('#status-state');
    if (statusEl) {
      statusEl.textContent = `estado: ${label.toLowerCase()}`;
      statusEl.className = state === 'error' ? 'warn' : 'on';
    }
    const miniState = $('#mini-state');
    if (miniState) miniState.textContent = label.toLowerCase();
    const mic = $('#btn-mic');
    if (mic) mic.classList.toggle('active', state === 'listening' || state === 'wake');
    const miniMic = $('#mini-mic');
    if (miniMic) miniMic.classList.toggle('active', state === 'listening' || state === 'wake');
  },

  /* ------------------------------------------------------------- transcrição */
  clearTranscript() {
    if (this.transcriptEl) this.transcriptEl.innerHTML = '';
  },

  message(role, text, meta = {}) {
    if (!this.transcriptEl || !text) return null;
    const wrap = el('div', { class: `msg ${role}` });
    const labels = { user: 'você', assistant: 'jarvis', system: 'sistema' };
    const label = el('div', { class: 'meta' }, [
      el('span', { text: labels[role] || role }),
      el('span', { text: timeLabel(meta.ts) }),
    ]);
    if (meta.intent && role === 'assistant') {
      label.append(el('span', { class: 'confidence', text: meta.intent }));
    }
    wrap.append(label, el('div', { class: 'bubble', text }));
    this.transcriptEl.append(wrap);
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    const miniText = $('#mini-text');
    if (miniText && role !== 'user') miniText.textContent = text;
    return wrap;
  },

  updateLastMessage(text) {
    const bubbles = $$('.msg .bubble', this.transcriptEl || document);
    if (!bubbles.length) return;
    bubbles[bubbles.length - 1].textContent = text;
  },

  /* ------------------------------------------------------------------ avisos */
  toast(title, message, type = 'info', ttl = 6500) {
    if (!this.toastsEl) return;
    const node = el('div', { class: `toast ${type}` }, [
      el('strong', { text: title }),
      el('span', { text: message }),
    ]);
    this.toastsEl.append(node);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 260);
    }, ttl);
    if (type !== 'error') {
      const miniText = $('#mini-text');
      if (miniText && message) miniText.textContent = message;
    }
  },

  /* ----------------------------------------------------------------- gauges */
  setGauge(metric, percent) {
    const node = $(`.gauge[data-metric="${metric}"] .gauge-fill`);
    const value = $(`.gauge [id="g-${metric}"]`);
    const capped = Math.max(0, Math.min(100, percent || 0));
    if (node) node.style.strokeDashoffset = String(264 - (264 * capped) / 100);
    if (value) value.textContent = Math.round(capped);
    const gauge = $(`.gauge[data-metric="${metric}"]`);
    if (gauge) {
      gauge.classList.toggle('high', capped >= 75 && capped < 90);
      gauge.classList.toggle('critical', capped >= 90);
    }
  },

  renderMetrics(data) {
    if (!data) return;
    const cpu = data.cpu?.percent ?? 0;
    this.setGauge('cpu', cpu);
    this.setGauge('ram', data.memory?.percent ?? 0);
    const disk = (data.disks || [])[0];
    this.setGauge('disk', disk?.percent ?? 0);

    this.cpuHistory.push(cpu);
    if (this.cpuHistory.length > 90) this.cpuHistory.shift();
    this._drawSpark();

    const set = (id, text) => { const node = $(id); if (node) node.textContent = text; };
    set('#v-mem', data.memory ? `${data.memory.used_gb} / ${data.memory.total_gb} GB` : '—');
    set('#v-proc', data.processes ?? '—');
    const temp = (data.temperatures || [])[0];
    set('#v-temp', temp ? `${temp.current} °C` : 'sem sensor');
    set('#v-uptime', this._uptime(data.uptime_seconds));
    const battery = data.battery;
    set('#v-battery', battery ? `${battery.percent}% ${battery.plugged ? '⚡' : ''}` : 'sem bateria');
    set('#host-name', data.hostname || '—');
    set('#sys-os', `${data.os || ''} ${data.os_version || ''}`.trim());
    set('#status-commands', `${window.__jarvisCommands ?? '—'} comandos`);
  },

  _uptime(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  },

  _drawSpark() {
    const canvas = $('#spark');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    if (this.cpuHistory.length < 2) return;
    const points = this.cpuHistory;
    const step = w / (points.length - 1);
    ctx.beginPath();
    points.forEach((value, index) => {
      const x = index * step;
      const y = h - (value / 100) * h * 0.9 - 2;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(53, 230, 255, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(53, 230, 255, 0.22)');
    gradient.addColorStop(1, 'rgba(53, 230, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  },

  /* ----------------------------------------------------------------- módulos */
  renderModules(status) {
    const list = $('#modules');
    if (!list || !status) return;
    const voice = status.voice || {};
    const stt = voice.stt || {};
    const tts = voice.tts || {};
    const modules = [
      { name: 'Núcleo', ok: true, value: status.assistant?.state?.state || 'ativo' },
      { name: 'Interpretador', ok: true, value: `${status.commands || 0} intenções` },
      {
        name: 'Reconhecimento de voz',
        ok: !!stt.available,
        warn: !stt.available,
        value: stt.available ? stt.engine : 'digite comandos',
      },
      {
        name: 'Síntese de voz',
        ok: !!(tts.available && tts.engine !== 'disabled'),
        value: tts.available ? tts.engine : 'texto apenas',
      },
      { name: 'Microfone', ok: !!voice.microphone_enabled, value: voice.microphone_enabled ? 'habilitado' : 'desligado' },
      { name: 'Palavra de ativação', ok: !!voice.wake_word?.enabled, value: voice.wake_word?.enabled ? '“jarvis”' : 'off' },
      { name: 'Memória local', ok: true, value: `${(status.storage?.memories ?? 0)} registros` },
      { name: 'Agendador', ok: !!status.scheduler?.running, value: `${status.scheduler?.upcoming?.length ?? 0} próximos` },
      { name: 'Segurança', ok: true, value: `confirma ≥ nível ${status.security?.confirm_level ?? 2}` },
      { name: 'Auditoria', ok: !!status.security?.audit_enabled, value: status.security?.audit_enabled ? 'gravando' : 'desligada' },
    ];
    list.innerHTML = '';
    for (const module of modules) {
      const led = el('i', { class: `led ${module.ok ? '' : module.warn ? 'warn' : 'off'}` });
      list.append(el('li', {}, [
        el('span', { class: 'name' }, [led, module.name]),
        el('span', { class: 'val', text: module.value }),
      ]));
    }
    const count = $('#mod-count');
    if (count) count.textContent = `${modules.filter((m) => m.ok).length}/${modules.length} ativos`;

    const chips = [
      ['#chip-voice', tts.available && tts.engine !== 'disabled', tts.engine === 'browser' ? 'voz do sistema' : (tts.engine || 'mudo')],
      ['#chip-mic', !!voice.microphone_enabled, voice.microphone_enabled ? 'microfone' : 'microfone off'],
      ['#chip-security', true, `confirma ≥ ${status.security?.confirm_level ?? 2}`],
    ];
    for (const [selector, on, label] of chips) {
      const chip = $(selector);
      if (!chip) continue;
      chip.classList.toggle('on', !!on);
      const span = chip.querySelector('span');
      if (span) span.textContent = label;
    }
    const sttStatus = $('#status-stt');
    if (sttStatus) {
      sttStatus.textContent = stt.available ? `reconhecimento: ${stt.engine}` : 'reconhecimento: indisponível';
      sttStatus.className = stt.available ? 'on' : 'warn';
    }
    const voiceStatus = $('#status-voice');
    if (voiceStatus) {
      voiceStatus.textContent = `voz: ${tts.available ? tts.engine : 'texto'}`;
      voiceStatus.className = tts.available ? 'on' : '';
    }
  },

  /* ------------------------------------------------------------------ painéis */
  _empty(list, text) {
    list.innerHTML = '';
    list.append(el('li', { class: 'empty', text }));
  },

  renderAgenda(payload) {
    const list = $('#list-agenda');
    if (!list) return;
    const items = [];
    for (const reminder of payload.reminders || []) {
      items.push({ kind: 'lembrete', id: reminder.id, label: reminder.message, when: reminder.due_at });
    }
    for (const task of payload.tasks || []) {
      if (task.due_at) items.push({ kind: 'tarefa', id: task.id, label: task.title, when: task.due_at });
    }
    items.sort((a, b) => a.when - b.when);
    if (!items.length) { this._empty(list, 'Nada agendado. Sua agenda está livre.'); return; }
    list.innerHTML = '';
    for (const item of items) {
      list.append(el('li', {}, [
        el('div', { class: 'row' }, [
          el('strong', { text: item.label }),
          el('span', { class: 'when', text: whenLabel(item.when) }),
        ]),
        el('div', { class: 'desc', text: item.kind }),
      ]));
    }
  },

  renderTasks(payload, goals = []) {
    const list = $('#list-tasks');
    if (list) {
      const tasks = payload.tasks || [];
      const count = $('#task-count');
      if (count) count.textContent = `${tasks.length} pendente(s)`;
      if (!tasks.length) this._empty(list, 'Nenhuma tarefa pendente.');
      else {
        list.innerHTML = '';
        for (const task of tasks) {
          list.append(el('li', {}, [
            el('div', { class: 'row' }, [
              el('strong', { text: task.title }),
              el('span', { class: 'when', text: task.due_at ? whenLabel(task.due_at) : 'sem data' }),
            ]),
            el('div', { class: 'actions' }, [
              el('button', {
                text: 'concluir',
                onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
                  detail: { action: 'task.complete', id: task.id },
                })),
              }),
              el('button', {
                class: 'danger', text: 'remover',
                onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
                  detail: { action: 'task.delete', id: task.id },
                })),
              }),
            ]),
          ]));
        }
      }
    }
    const goalList = $('#list-goals');
    if (goalList) {
      if (!goals.length) this._empty(goalList, 'Nenhum objetivo ativo.');
      else {
        goalList.innerHTML = '';
        for (const goal of goals) {
          goalList.append(el('li', {}, [
            el('div', { class: 'row' }, [
              el('strong', { text: goal.title }),
              el('span', { class: 'when', text: `${goal.progress}%` }),
            ]),
            el('div', { class: 'actions' }, [
              el('button', {
                text: '+10%',
                onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
                  detail: { action: 'goal.progress', id: goal.id, progress: Math.min(100, goal.progress + 10) },
                })),
              }),
            ]),
          ]));
        }
      }
    }
  },

  renderMemory(memories, notes = []) {
    const list = $('#list-memory');
    const count = $('#mem-count');
    if (count) count.textContent = `${memories.length} registro(s)`;
    if (!list) return;
    if (!memories.length && !notes.length) {
      this._empty(list, 'Nada guardado ainda. Diga “lembre-se de que…” ou use o campo acima.');
      return;
    }
    list.innerHTML = '';
    for (const memory of memories) {
      list.append(el('li', {}, [
        el('div', { class: 'row' }, [
          el('strong', { text: memory.value }),
          el('span', { class: 'when', text: memory.category }),
        ]),
        el('div', { class: 'actions' }, [
          el('button', {
            class: 'danger', text: 'apagar',
            onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
              detail: { action: 'memory.delete', id: memory.id },
            })),
          }),
        ]),
      ]));
    }
    for (const note of notes.slice(0, 6)) {
      list.append(el('li', {}, [
        el('div', { class: 'row' }, [
          el('strong', { text: note.body }),
          el('span', { class: 'when', text: 'anotação' }),
        ]),
      ]));
    }
  },

  renderRoutines(routines) {
    const list = $('#list-routines');
    if (!list) return;
    if (!routines.length) {
      this._empty(list, 'Nenhuma rotina. Crie uma por voz ou pelo formulário acima.');
      return;
    }
    list.innerHTML = '';
    for (const routine of routines) {
      const steps = (routine.steps || []).map((step) => step.text || step).join(' · ');
      list.append(el('li', {}, [
        el('div', { class: 'row' }, [
          el('strong', { text: routine.name }),
          el('span', { class: 'when', text: routine.enabled ? 'ativa' : 'inativa' }),
        ]),
        el('div', { class: 'desc', text: steps || '(sem passos)' }),
        el('div', { class: 'actions' }, [
          el('button', {
            text: 'executar',
            onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
              detail: { action: 'routine.run', name: routine.name },
            })),
          }),
          el('button', {
            text: routine.enabled ? 'desativar' : 'ativar',
            onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
              detail: { action: 'routine.toggle', name: routine.name, enabled: !routine.enabled },
            })),
          }),
          el('button', {
            class: 'danger', text: 'excluir',
            onclick: () => document.dispatchEvent(new CustomEvent('jarvis:action', {
              detail: { action: 'routine.delete', name: routine.name },
            })),
          }),
        ]),
      ]));
    }
  },

  renderSystem(data) {
    const kv = $('#kv-system');
    if (!kv || !data) return;
    kv.innerHTML = '';
    const rows = [
      ['Máquina', data.hostname],
      ['Sistema', `${data.os} ${data.os_version || ''}`.trim()],
      ['Usuário', data.user || '—'],
      ['Processador', `${data.cpu?.cores_physical} núcleos · ${data.cpu?.freq_mhz || '—'} MHz`],
      ['Uso de CPU', `${data.cpu?.percent}%`],
      ['Memória', `${data.memory?.used_gb} / ${data.memory?.total_gb} GB (${data.memory?.percent}%)`],
      ['Processos', data.processes],
      ['Uptime', this._uptime(data.uptime_seconds)],
    ];
    for (const [key, value] of rows) {
      kv.append(el('div', {}, [el('dt', { text: key }), el('dd', { text: value ?? '—' })]));
    }
    const list = $('#list-processes');
    if (list) {
      list.innerHTML = '';
      for (const process of (data.top_processes || []).slice(0, 8)) {
        list.append(el('li', {}, [
          el('div', { class: 'row' }, [
            el('strong', { text: process.name }),
            el('span', { class: 'when', text: `${process.memory_mb} MB` }),
          ]),
        ]));
      }
    }
  },

  renderAudit(entries) {
    const list = $('#list-audit');
    if (!list) return;
    if (!entries.length) { this._empty(list, 'Nenhuma ação registrada ainda.'); return; }
    list.innerHTML = '';
    for (const entry of entries.slice(0, 40)) {
      const time = new Date(entry.ts * 1000).toLocaleTimeString('pt-BR');
      list.append(el('li', {}, [
        el('div', { class: 'row' }, [
          el('strong', { text: entry.action }),
          el('span', { class: `when ${entry.result === 'ok' ? 'ok' : 'err'}`, text: `${time} · ${entry.result}` }),
        ]),
        el('div', { class: 'desc', text: `${entry.detail || ''} ${entry.confirmed ? '[confirmado]' : ''}`.trim() }),
      ]));
    }
  },

  renderLogs(lines) {
    const box = $('#logbox');
    if (!box) return;
    box.textContent = lines.length ? lines.slice(-60).join('\n') : '(sem registros)';
    box.scrollTop = box.scrollHeight;
  },

  /* ------------------------------------------------------------------ ajustes */
  renderSettings(settings) {
    if (!settings) return;
    const get = (path) => path.split('.').reduce((node, key) => (node ? node[key] : undefined), settings);
    for (const input of $$('[data-setting]')) {
      const path = input.dataset.setting;
      const value = get(path);
      if (input.type === 'checkbox') {
        input.checked = path === 'voice.tts.enabled'
          ? String(get('voice.tts.engine')) !== 'disabled'
          : !!value;
        continue;
      }
      if (input.type === 'range') {
        const numeric = typeof value === 'number' ? value : 0.5;
        input.value = input.dataset.decimal
          ? String(numeric)
          : String(Math.round(numeric * 100));
        this._updateRangeLabel(input);
        continue;
      }
      if (value !== undefined && value !== null) input.value = value;
    }
    for (const input of $$('[data-setting][type="range"]')) {
      input.oninput = () => this._updateRangeLabel(input);
    }
  },

  _updateRangeLabel(input) {
    const map = {
      'personality.formality': '#lbl-formality',
      'personality.humor': '#lbl-humor',
      'personality.verbosity': '#lbl-verbosity',
      'voice.tts.rate': '#lbl-tts-rate',
      'voice.tts.pitch': '#lbl-tts-pitch',
    };
    const target = $(map[input.dataset.setting]);
    if (!target) return;
    if (input.dataset.decimal) {
      const sufixo = input.dataset.setting === 'voice.tts.rate' ? '×' : '';
      target.textContent = `${Number(input.value).toFixed(2)}${sufixo}`;
    } else {
      target.textContent = `${input.value}%`;
    }
  },

  collectSettings() {
    const payload = {};
    for (const input of $$('[data-setting]')) {
      const path = input.dataset.setting;
      if (input.type === 'checkbox') {
        if (path === 'voice.tts.enabled') {
          payload['voice.tts.engine'] = input.checked ? 'auto' : 'disabled';
        } else {
          payload[path] = input.checked;
        }
        continue;
      }
      if (input.type === 'range') {
        payload[path] = input.dataset.decimal ? Number(input.value) : Number(input.value) / 100;
        continue;
      }
      if (input.type === 'number' || input.type === 'select-one') {
        const numeric = Number(input.value);
        payload[path] = Number.isNaN(numeric) || input.value === '' ? input.value : numeric;
        continue;
      }
      if (path === 'security.confirm_level' || path === 'llm.enabled') {
        const numeric = Number(input.value);
        payload[path] = Number.isNaN(numeric) ? input.value : numeric;
        continue;
      }
      payload[path] = input.value;
    }
    return payload;
  },

  renderVoices(voices, selected = '') {
    const select = $('#tts-browser-voice');
    if (!select) return;
    const atual = selected || select.value || '';
    select.innerHTML = '';
    const auto = el('option', { value: '', text: 'automática (melhor voz pt-BR disponível)' });
    select.append(auto);
    for (const voice of voices || []) {
      select.append(el('option', { value: voice.name, text: voice.label }));
    }
    const match = [...select.options].find((opt) => opt.value && atual &&
      opt.value.toLowerCase().includes(atual.toLowerCase()));
    select.value = match ? match.value : '';
  },

  /* --------------------------------------------------------------- sugestões */
  renderSuggestions(suggestions) {
    const box = $('#suggestions');
    if (!box) return;
    box.innerHTML = '';
    for (const text of suggestions) {
      box.append(el('button', {
        type: 'button',
        text,
        onclick: () => document.dispatchEvent(new CustomEvent('jarvis:suggest', { detail: text })),
      }));
    }
  },

  renderHelp(commands) {
    const grid = $('#help-grid');
    if (!grid) return;
    const categories = {
      conversa: 'Conversa e informação',
      sistema: 'Computador',
      aplicativos: 'Programas e janelas',
      arquivos: 'Arquivos',
      memoria: 'Memória',
      organizacao: 'Organização pessoal',
      automacao: 'Automações e rotinas',
      conselheiro: 'Conselheiro pessoal',
      voz: 'Voz',
      configuracao: 'Configurações',
    };
    grid.innerHTML = '';
    const grouped = {};
    for (const command of commands) {
      if (!command.examples?.length) continue;
      grouped[command.category] = grouped[command.category] || [];
      grouped[command.category].push(command);
    }
    for (const [category, items] of Object.entries(grouped)) {
      grid.append(el('article', {}, [
        el('h4', { text: categories[category] || category }),
        el('ul', {}, items.slice(0, 6).map((item) => el('li', {
          text: `“${item.examples[0]}”`,
        }))),
      ]));
    }
  },

  showHelp() { $('#modal-help')?.classList.add('open'); },
  hideHelp() { $('#modal-help')?.classList.remove('open'); },

  /* ------------------------------------------------------------- modais/tabs */
  _bindTabs() {
    for (const tab of $$('.tab')) {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((node) => node.classList.toggle('active', node === tab));
        $$('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
        });
        document.body.classList.add('right-open');
        document.dispatchEvent(new CustomEvent('jarvis:tab', { detail: tab.dataset.tab }));
      });
    }
  },

  _bindModals() {
    $('#confirm-allow')?.addEventListener('click', () => this.hideConfirm(true));
    $('#confirm-deny')?.addEventListener('click', () => this.hideConfirm(false));
    $('#help-close')?.addEventListener('click', () => this.hideHelp());
    $('#modal-help')?.addEventListener('click', (event) => {
      if (event.target.id === 'modal-help') this.hideHelp();
    });
    $('#modal-confirm')?.addEventListener('click', (event) => {
      if (event.target.id === 'modal-confirm') this.hideConfirm(false);
    });
  },

  showConfirm(pending, ttl = 180) {
    const modal = $('#modal-confirm');
    if (!modal || !pending) return Promise.resolve(false);
    $('#confirm-desc').textContent = pending.description || 'Confirma a execução?';
    $('#confirm-level').textContent = LEVEL_LABEL[pending.level] || `nível ${pending.level}`;
    const preview = $('#confirm-preview');
    preview.innerHTML = '';
    const data = pending.preview || {};
    const items = data.items || [];
    if (items.length) {
      for (const item of items) preview.append(el('li', { text: item }));
      if (data.truncated) preview.append(el('li', { text: `… e mais ${data.truncated} item(ns)` }));
    } else if (data.notes?.length) {
      for (const note of data.notes) preview.append(el('li', { text: note }));
    } else {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' || typeof value === 'number') {
          preview.append(el('li', { text: `${key}: ${value}` }));
        }
      }
    }
    if (!preview.children.length) preview.append(el('li', { text: 'Nenhuma prévia adicional disponível.' }));
    modal.classList.add('open');

    clearInterval(this.confirmTimer);
    const bar = $('#confirm-bar');
    let remaining = ttl;
    const tick = () => {
      remaining -= 1;
      if (bar) bar.style.width = `${Math.max(0, (remaining / ttl) * 100)}%`;
      if (remaining <= 0) this.hideConfirm(false);
    };
    if (bar) bar.style.width = '100%';
    this.confirmTimer = setInterval(tick, 1000);

    return new Promise((resolve) => { this.confirmResolver = resolve; });
  },

  hideConfirm(approved) {
    const modal = $('#modal-confirm');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    clearInterval(this.confirmTimer);
    const resolver = this.confirmResolver;
    this.confirmResolver = null;
    if (resolver) resolver(!!approved);
  },

  openMini(open) {
    document.body.classList.toggle('mini-mode', !!open);
    try { localStorage.setItem('jarvis.mini', open ? '1' : '0'); } catch { /* */ }
  },

  setMiniText(text) {
    const node = $('#mini-text');
    if (node && text) node.textContent = text;
  },

  _tickClock() {
    const now = new Date();
    if (this.clockTimeEl) {
      this.clockTimeEl.textContent = now.toLocaleTimeString('pt-BR', { hour12: false });
    }
    if (this.clockDateEl) {
      const text = now.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      });
      this.clockDateEl.textContent = text;
    }
  },
};

export { el, whenLabel, timeLabel };
