/* Cliente da API local. Nenhuma requisição sai para a internet. */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = (data && (data.detail || data.message)) || response.statusText;
    throw new Error(detail || 'falha na requisição');
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) }),
  del: (path) => request(path, { method: 'DELETE' }),

  status: () => request('/api/status'),
  commands: () => request('/api/commands'),
  settings: () => request('/api/settings'),
  saveSettings: (payload) => request('/api/settings', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(payload) }),

  command: (text, options = {}) => request('/api/command', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ text, source: options.source || 'interface', speak: options.speak !== false }),
  }),
  confirm: (id, approved) => request('/api/confirm', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ id, approved }),
  }),
  history: (limit = 60) => request(`/api/history?limit=${limit}`),

  memory: () => request('/api/memory'),
  addMemory: (value, category) => request('/api/memory', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ value, category }),
  }),
  delMemory: (id) => request(`/api/memory/${id}`, { method: 'DELETE' }),

  tasks: () => request('/api/tasks'),
  addTask: (title) => request('/api/tasks', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title }) }),
  completeTask: (id) => request(`/api/tasks/${id}/complete`, { method: 'POST' }),
  delTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),

  addReminder: (message, dueAt) => request('/api/reminders', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ message, due_at: dueAt }),
  }),
  delReminder: (id) => request(`/api/reminders/${id}`, { method: 'DELETE' }),

  notes: () => request('/api/notes'),
  addNote: (body) => request('/api/notes', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ body }) }),

  goals: () => request('/api/goals'),
  setGoal: (id, progress) => request(`/api/goals/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ progress }) }),

  routines: () => request('/api/routines'),
  addRoutine: (name, steps) => request('/api/routines', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name, steps }),
  }),
  toggleRoutine: (name, enabled) => request(`/api/routines/${encodeURIComponent(name)}`, {
    method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ enabled }),
  }),
  delRoutine: (name) => request(`/api/routines/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  runRoutine: (name) => request(`/api/routines/${encodeURIComponent(name)}/run`, { method: 'POST' }),

  audit: () => request('/api/audit'),
  logs: () => request('/api/logs'),
  voiceStatus: () => request('/api/voice/status'),
  stopSpeaking: () => request('/api/voice/stop', { method: 'POST' }),

  async transcribe(blob, requireWake = false) {
    return request(`/api/voice/transcribe?require_wake=${requireWake ? 'true' : 'false'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: blob,
    });
  },

  async tts(text) {
    const response = await fetch('/api/voice/tts', {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ text }),
    });
    if (!response.ok || response.status === 204) return null;
    return response.blob();
  },
};

/* ------------------------------------------------------------------ WebSocket */
export function connectEvents(onEvent, onStatus) {
  let socket = null;
  let retry = 0;
  let heartbeat = null;

  const page = window.location;
  const url = `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}/ws`;

  function open() {
    socket = new WebSocket(url);
    socket.onopen = () => {
      retry = 0;
      onStatus?.('online');
      heartbeat = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };
    socket.onmessage = (message) => {
      try { onEvent(JSON.parse(message.data)); } catch { /* ignora */ }
    };
    socket.onclose = () => {
      onStatus?.('offline');
      clearInterval(heartbeat);
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 400 * retry + 400);
    };
    socket.onerror = () => socket.close();
  }

  open();
  return {
    send: (data) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); },
    close: () => { clearInterval(heartbeat); socket?.close(); },
  };
}
