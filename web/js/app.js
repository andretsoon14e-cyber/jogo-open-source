/* Ponto de entrada da interface: liga API, orbe, voz e painéis. */

import { api, connectEvents } from './api.js';
import { Orb, SpeechEnergy } from './orb.js';
import { VoiceIO, Speaker } from './audio.js';
import { ui } from './ui.js';

const DEFAULT_SUGGESTIONS = [
  'que horas são',
  'como está o desempenho do computador',
  'abre a pasta de downloads',
  'quais são minhas tarefas',
  'me lembre de estudar amanhã às 14 horas',
  'organize a pasta de downloads',
  'quais rotinas eu tenho',
];

const state = {
  orb: null,
  miniOrb: null,
  speaker: null,
  energy: null,
  voice: null,
  status: null,
  settings: null,
  commands: [],
  micReady: false,
  awaitingCommand: false,
  warnShown: false,
  speaking: false,
  pendingShown: false,
  lastReply: '',
  busy: false,
  wsOnline: false,
  booted: false,
  tab: 'agenda',
};

/* ------------------------------------------------------------------ inicialização */
async function boot() {
  if (state.booted) return;      // protege contra inicialização dupla
  state.booted = true;
  ui.init();

  state.orb = new Orb(document.getElementById('orb'));
  state.miniOrb = new Orb(document.getElementById('mini-orb-canvas'), { compact: true });
  state.energy = new SpeechEnergy(state.orb);
  state.speaker = new Speaker({
    onStart: () => {
      state.speaking = true;
      ui.setState('speaking');
      state.orb.setState('speaking');
      state.miniOrb.setState('speaking');
      state.energy.start();
    },
    onEnd: () => {
      state.speaking = false;
      state.energy.stop();
      state.orb.setEnergy(0);
      if (!state.busy) setState('idle');
    },
    onError: (message) => ui.toast('Voz', message, 'error'),
  });

  state.voice = new VoiceIO({
    onLevel: (level) => {
      state.orb.setLevel(level);
      state.miniOrb.setLevel(level);
    },
    onStatus: (status) => {
      if (status === 'speech' && state.speaking) stopSpeaking(true);
    },
    onUtterance: (blob) => handleUtterance(blob),
    onError: (message) => {
      ui.toast('Microfone', message, 'error');
      setMicButton(false);
    },
  });

  bindEvents();
  setState('idle');

  try {
    const [status, settings, commands] = await Promise.all([
      api.status(), api.settings(), api.commands(),
    ]);
    state.status = status;
    state.settings = settings.settings;
    state.commands = commands.commands;
    window.__jarvisCommands = commands.commands.length;
    setState(status.assistant?.state?.state === 'offline' ? 'idle'
      : (status.assistant?.state?.state || 'idle'));
    ui.renderModules(status);
    ui.renderSettings(state.settings);
    applyVoiceSettings();
    ui.renderHelp(commands.commands);
    ui.renderSuggestions(DEFAULT_SUGGESTIONS);
    ui.message('assistant', status.assistant?.name
      ? `${greetingText()}. Todos os sistemas ativos. Como posso ajudar?`
      : 'Sistemas inicializados. Como posso ajudar?', { intent: 'startup' });
    await refreshAll();
  } catch (error) {
    ui.toast('Conexão', `Não consegui falar com o núcleo: ${error.message}`, 'error', 12000);
  }

  connectEvents(handleEvent, (status) => {
    state.wsOnline = status === 'online';
    const chip = document.getElementById('status-state');
    if (chip && status === 'offline') chip.textContent = 'conexão perdida — reconectando…';
  });

  try {
    if (localStorage.getItem('jarvis.mini') === '1') ui.openMini(true);
  } catch { /* */ }

  setInterval(refreshStatus, 15000);
  setInterval(() => refreshTab(state.tab), 30000);
}

function applyVoiceSettings() {
  const tts = state.settings?.voice?.tts || {};
  state.speaker.setConfig({
    rate: tts.rate, pitch: tts.pitch, volume: tts.volume,
    browser_voice: tts.browser_voice,
  });
  ui.renderVoices(state.speaker.voicesList(), tts.browser_voice || '');
  const select = document.getElementById('tts-browser-voice');
  if (select) {
    select.onchange = () => {
      state.speaker.setVoice(select.value);
      state.speaker.speak('Assim está melhor? Posso ajustar velocidade e tom também.');
    };
  }
}

function greetingText() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* --------------------------------------------------------------------- eventos */
function handleEvent(event) {
  switch (event.type) {
    case 'snapshot':
      state.status = event.data;
      ui.renderModules(state.status);
      ui.renderMetrics(state.status.system);
      break;

    case 'state':
      if (event.data?.state) setState(event.data.state, event.data.error);
      break;

    case 'user_message':
      if (event.data?.source !== 'interface' || event.data?.text) {
        ui.message('user', event.data.text, { ts: event.ts });
      }
      break;

    case 'assistant_message': {
      const data = event.data || {};
      state.lastReply = data.text;
      const role = data.error ? 'assistant error' : 'assistant';
      ui.message(role, data.text, { intent: data.intent, ts: event.ts });
      ui.setMiniText(data.text);
      if (data.pending) showConfirmation(data.pending);
      if (data.followups?.length) ui.renderSuggestions(data.followups);
      refreshTab(state.tab, { silent: true });
      break;
    }

    case 'notification':
      ui.toast(event.data?.title || 'Aviso', event.data?.message || '', 'info', 9000);
      break;

    case 'speak':
      if (event.data?.text) speak(event.data);
      break;

    case 'metrics':
      ui.renderMetrics(event.data);
      break;

    case 'system':
      state.status = event.data;
      ui.renderModules(state.status);
      break;

    case 'settings':
      refreshStatus();
      break;

    case 'routine':
      if (event.data?.status === 'iniciando') {
        ui.toast('Rotina', `Executando “${event.data.name}”…`);
      }
      break;

    case 'stop':
      state.speaker.stop();
      break;

    case 'voice':
      state.status = { ...(state.status || {}), voice: event.data };
      ui.renderModules(state.status);
      break;

    default:
      break;
  }
}

function setState(name, error) {
  ui.setState(name, { error });
  state.orb?.setState(name);
  state.miniOrb?.setState(name);
}

/* ----------------------------------------------------------------------- fala */
function speak(data) {
  if (!data?.text) return;
  let blob = null;
  if (data.audio_b64) {
    try {
      const bytes = Uint8Array.from(atob(data.audio_b64), (char) => char.charCodeAt(0));
      blob = new Blob([bytes], { type: data.mime || 'audio/wav' });
    } catch { blob = null; }
  }
  setState('speaking');
  state.speaker.speak(data.text, blob);
}

function stopSpeaking(keepState = false) {
  state.speaker.stop();
  api.stopSpeaking().catch(() => {});
  state.energy.stop();
  if (!keepState) setState('idle');
}

/* ------------------------------------------------------------------ comandos */
async function sendCommand(text, options = {}) {
  const command = (text || '').trim();
  if (!command || state.busy) return;
  state.busy = true;
  stopSpeaking(true);
  setState('processing');
  try {
    const response = await api.command(command, { source: options.source || 'interface' });
    if (!state.wsOnline && response?.reply) {
      ui.message('user', command, {});
      ui.message(response.error ? 'assistant error' : 'assistant', response.reply,
        { intent: response.intent });
      if (response.pending) showConfirmation(response.pending);
    }
  } catch (error) {
    ui.toast('Falha', error.message, 'error');
    setState('error', error.message);
    setTimeout(() => setState('idle'), 2200);
  } finally {
    state.busy = false;
    const input = document.getElementById('input-command');
    if (input) { input.value = ''; input.focus(); }
    refreshTab(state.tab, { silent: true });
  }
}

async function showConfirmation(pending) {
  if (!pending || state.pendingShown) return;
  state.pendingShown = true;
  state.pending = pending;
  setState('confirming');
  const approved = await ui.showConfirm(pending);
  state.pendingShown = false;
  try {
    const response = await api.confirm(pending.id, approved);
    if (!state.wsOnline && response?.reply) {
      ui.message(response.error ? 'assistant error' : 'assistant', response.reply,
        { intent: response.intent });
    }
    setState(response?.error ? 'error' : 'idle');
    if (response?.error) setTimeout(() => setState('idle'), 1800);
  } catch (error) {
    ui.toast('Confirmação', error.message, 'error');
    setState('idle');
  } finally {
    refreshTab(state.tab, { silent: true });
  }
}

/* --------------------------------------------------------------------- áudio */
async function toggleMic() {
  if (state.voice.active) {
    state.voice.disable();
    state.micReady = false;
    setMicButton(false);
    setState('idle');
    ui.toast('Microfone', 'Escuta desativada. Nenhum áudio é capturado.', 'info', 4000);
    return;
  }
  const stt = state.status?.voice?.stt;
  if (stt && !stt.available) {
    ui.toast(
      'Reconhecimento indisponível',
      `${stt.reason} Instale o modelo local (scripts/setup_models.py) ou continue digitando.`,
      'error', 12000,
    );
    setState('idle');
    return;
  }
  const ok = await state.voice.enable();
  if (!ok) return;
  state.micReady = true;
  state.orb.setAnalyser(state.voice.analyser);
  state.miniOrb.setAnalyser(null);
  setMicButton(true);
  setState('listening');
  ui.toast('Microfone', 'Estou ouvindo. Diga “jarvis” seguido do comando.', 'info', 5000);
}

function setMicButton(active) {
  document.getElementById('btn-mic')?.classList.toggle('active', active);
  document.getElementById('mini-mic')?.classList.toggle('active', active);
}

async function handleUtterance(blob) {
  if (!blob || state.busy) return;
  state.busy = true;
  setState('processing');
  try {
    const requireWake = !!state.status?.voice?.wake_word?.enabled && !state.awaitingCommand;
  const payload = await api.transcribe(blob, requireWake);
    if (!payload) return;
    if (payload?.ignored) {
      ui.setMiniText('Diga “jarvis” para me ativar.');
      setState('listening');
      return;
    }
    if (!payload.text) {
      ui.toast(
        'Não entendi',
        payload.message || 'Não captei nenhuma fala. Tente novamente.',
        'error', 5000,
      );
      return;
    }
    if (payload.wake && !payload.result) {
      const greeting = payload.reply || 'Pois não?';
      state.awaitingCommand = true;
      ui.message('assistant', greeting, { intent: 'wake' });
      speak({ text: greeting, use_browser: true });
      return;
    }
    if (payload.result) {
      state.awaitingCommand = false;
      if (!state.wsOnline) {
        ui.message('user', payload.text, {});
        ui.message(payload.result.error ? 'assistant error' : 'assistant',
          payload.result.reply, { intent: payload.result.intent });
      }
    }
    if (payload.text && !payload.wake) {
      ui.message('user', payload.text, {});
    }
  } catch (error) {
    ui.toast('Reconhecimento', error.message, 'error');
  } finally {
    state.busy = false;
    if (state.voice.active) setState('listening');
    else setState('idle');
  }
}

/* ------------------------------------------------------------------- painéis */
async function refreshStatus() {
  try {
    state.status = await api.status();
    ui.renderModules(state.status);
    ui.renderMetrics(state.status.system);
    ui.renderSystem(state.status.system);
  } catch { /* silencioso */ }
}

async function refreshAll() {
  await refreshStatus();
  await refreshTab(state.tab, { silent: true });
}

async function refreshTab(tab, options = {}) {
  state.tab = tab;
  try {
    if (tab === 'agenda') {
      const payload = await api.tasks();
      ui.renderAgenda(payload);
    } else if (tab === 'tasks') {
      const [tasks, goals] = await Promise.all([api.tasks(), api.goals()]);
      ui.renderTasks(tasks, goals.goals || []);
      ui.renderAgenda(tasks);
    } else if (tab === 'memory') {
      const [memory, notes] = await Promise.all([api.memory(), api.notes()]);
      ui.renderMemory(memory.memories || [], notes.notes || []);
    } else if (tab === 'routines') {
      const routines = await api.routines();
      ui.renderRoutines(routines.routines || []);
    } else if (tab === 'system') {
      const status = await api.status();
      ui.renderSystem(status.system);
    } else if (tab === 'logs') {
      const [audit, logs] = await Promise.all([api.audit(), api.logs()]);
      ui.renderAudit(audit.entries || []);
      ui.renderLogs(logs.lines || []);
    }
  } catch (error) {
    if (!options.silent) ui.toast('Painel', error.message, 'error');
  }
}

/* --------------------------------------------------------------------- ações */
async function handleAction(detail) {
  try {
    switch (detail.action) {
      case 'task.complete':
        await api.completeTask(detail.id);
        break;
      case 'task.delete':
        await api.delTask(detail.id);
        break;
      case 'goal.progress':
        await api.setGoal(detail.id, detail.progress);
        break;
      case 'memory.delete':
        await api.delMemory(detail.id);
        break;
      case 'routine.run': {
        const response = await api.runRoutine(detail.name);
        if (!state.wsOnline && response?.reply) {
          ui.message('assistant', response.reply, { intent: 'routine.run' });
        }
        break;
      }
      case 'routine.toggle':
        await api.toggleRoutine(detail.name, detail.enabled);
        break;
      case 'routine.delete':
        await api.delRoutine(detail.name);
        break;
      default:
        break;
    }
    refreshTab(state.tab, { silent: true });
  } catch (error) {
    ui.toast('Ação', error.message, 'error');
  }
}

/* ------------------------------------------------------------------ bindings */
function bindEvents() {
  document.getElementById('composer')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('input-command');
    sendCommand(input.value);
  });

  document.getElementById('btn-mic')?.addEventListener('click', toggleMic);
  document.getElementById('mini-mic')?.addEventListener('click', toggleMic);
  document.getElementById('btn-stop')?.addEventListener('click', () => stopSpeaking());
  document.getElementById('btn-mini')?.addEventListener('click', () => ui.openMini(true));
  document.getElementById('mini-expand')?.addEventListener('click', () => ui.openMini(false));
  document.getElementById('btn-help')?.addEventListener('click', () => ui.showHelp());

  document.addEventListener('jarvis:suggest', (event) => {
    const input = document.getElementById('input-command');
    if (input) input.value = event.detail;
    sendCommand(event.detail);
  });
  document.addEventListener('jarvis:action', (event) => handleAction(event.detail));
  document.addEventListener('jarvis:tab', (event) => refreshTab(event.detail));

  document.getElementById('form-reminder')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = document.getElementById('reminder-text').value.trim();
    const when = document.getElementById('reminder-time').value;
    if (!text) return;
    const due = when ? new Date(when).getTime() / 1000 : Date.now() / 1000 + 3600;
    try {
      await api.addReminder(text, due);
      document.getElementById('reminder-text').value = '';
      ui.toast('Agenda', 'Lembrete criado.', 'info', 4000);
      refreshTab('agenda');
    } catch (error) { ui.toast('Agenda', error.message, 'error'); }
  });

  document.getElementById('form-memory')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = document.getElementById('memory-value').value.trim();
    const category = document.getElementById('memory-category').value;
    if (!value) return;
    try {
      await api.addMemory(value, category);
      document.getElementById('memory-value').value = '';
      refreshTab('memory');
      ui.toast('Memória', 'Informação registrada localmente.');
    } catch (error) { ui.toast('Memória', error.message, 'error'); }
  });

  document.getElementById('form-task')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('task-title');
    if (!input.value.trim()) return;
    try {
      await api.addTask(input.value.trim());
      input.value = '';
      refreshTab('tasks');
    } catch (error) { ui.toast('Tarefas', error.message, 'error'); }
  });

  document.getElementById('form-routine')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('routine-name').value.trim();
    const steps = document.getElementById('routine-steps').value
      .split('\n').map((line) => line.trim()).filter(Boolean);
    if (!name || !steps.length) return;
    try {
      await api.addRoutine(name, steps);
      document.getElementById('routine-name').value = '';
      document.getElementById('routine-steps').value = '';
      refreshTab('routines');
      ui.toast('Rotinas', `Rotina “${name}” criada com ${steps.length} passo(s).`);
    } catch (error) { ui.toast('Rotinas', error.message, 'error'); }
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    try {
      const payload = ui.collectSettings();
      const voiceSelect = document.getElementById('tts-browser-voice');
      if (voiceSelect) payload['voice.tts.browser_voice'] = voiceSelect.value || '';
      const result = await api.saveSettings(payload);
      state.settings = result.settings;
      applyVoiceSettings();
      ui.toast('Ajustes', 'Preferências salvas.', 'info', 4000);
      refreshStatus();
    } catch (error) { ui.toast('Ajustes', error.message, 'error'); }
  });

  document.getElementById('btn-test-voice')?.addEventListener('click', () => {
    const sobre = document.getElementById('tts-browser-voice')?.selectedOptions?.[0]?.text || 'padrão';
    state.speaker.speak('Boa tarde. Sou o Jarvis. Esta é a voz que vou usar para falar com você.');
    ui.toast('Voz', `Testando: ${sobre}`, 'info', 4000);
  });

  document.getElementById('btn-refresh-agenda')?.addEventListener('click', () => refreshTab('agenda'));
  document.getElementById('btn-refresh-logs')?.addEventListener('click', () => refreshTab('logs'));

  const input = document.getElementById('input-command');
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.value = ''; }
    if (event.key === 'ArrowUp' && !input.value) { input.placeholder = 'histórico disponível via painéis'; }
  });

  document.querySelector('.col-center')?.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 820) document.body.classList.remove('right-open');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { stopSpeaking(); ui.hideHelp(); }
    if (event.ctrlKey && event.code === 'Space') { event.preventDefault(); toggleMic(); }
    if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault();
      input?.focus();
    }
  });

  // pequeno ajuste: re-renderiza gauges ao redimensionar
  window.addEventListener('resize', () => ui._drawSpark && ui._drawSpark());
}

document.addEventListener('DOMContentLoaded', boot);
