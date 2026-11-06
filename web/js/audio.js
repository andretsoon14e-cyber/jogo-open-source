/* Captura de microfone com detecção de fala (VAD) e síntese local.
   O áudio nunca é enviado para a internet: vai apenas para o servidor local,
   que roda o reconhecimento (Vosk/whisper.cpp) na própria máquina. */

function encodeWav(float32, sampleRate) {
  const target = 16000;
  const ratio = sampleRate / target;
  const length = Math.max(1, Math.floor(float32.length / ratio));
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = float32[index] || 0;
    const b = float32[index + 1] ?? a;
    const sample = a + (b - a) * frac;
    pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: 'audio/wav' });
}

export class VoiceIO {
  constructor(options = {}) {
    this.onLevel = options.onLevel || (() => {});
    this.onUtterance = options.onUtterance || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onError = options.onError || (() => {});
    this.silenceMs = options.silenceMs ?? 950;
    this.threshold = options.threshold ?? 0.022;
    this.maxMs = options.maxMs ?? 15000;
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.processor = null;
    this.source = null;
    this.chunks = [];
    this.sampleCount = 0;
    this.utteranceStart = 0;
    this.recording = false;
    this.speech = false;
    this.startedAt = 0;
    this.lastVoice = 0;
    this.level = 0;
    this.loop = null;
    this.busy = false;
  }

  get active() { return !!this.stream; }

  async enable() {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onError('Este navegador não expõe acesso ao microfone. Use o campo de texto.');
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      this.onError(`Não consegui acessar o microfone: ${error.message}`);
      return false;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioCtx();
    if (this.context.state === 'suspended') await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.72;
    this.source.connect(this.analyser);

    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.recording) return;
      const data = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.sampleCount += data.length;
      // mantém no máximo ~20s de áudio em memória
      const maxSamples = this.context.sampleRate * 20;
      while (this.sampleCount > maxSamples && this.chunks.length > 2) {
        this.sampleCount -= this.chunks.shift().length;
      }
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);

    this.recording = true;
    this.onStatus('active');
    this._startLoop();
    return true;
  }

  _startLoop() {
    cancelAnimationFrame(this.loop);
    const buffer = new Float32Array(this.analyser.fftSize);
    const tick = () => {
      this.loop = requestAnimationFrame(tick);
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      // suaviza para a animação não tremer demais
      this.level = this.level * 0.72 + Math.min(1, rms * 9) * 0.28;
      this.onLevel(this.level);
      this._detect(rms);
    };
    tick();
  }

  _detect(rms) {
    const now = performance.now();
    const loud = rms > this.threshold;
    if (loud) {
      this.lastVoice = now;
      if (!this.speech) {
        this.speech = true;
        this.startedAt = now;
        // guarda ~300 ms de pré-roll para não cortar o início da palavra
        this.utteranceStart = Math.max(0, this.sampleCount - Math.floor(this.context.sampleRate * 0.3));
        this.onStatus('speech');
      }
    }
    if (this.speech) {
      const silentFor = now - this.lastVoice;
      const duration = now - this.startedAt;
      if (silentFor > this.silenceMs || duration > this.maxMs) {
        this.speech = false;
        this._finalize(duration);
      }
    }
  }

  _finalize(duration) {
    if (!this.chunks.length) return;
    const total = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (total < this.context.sampleRate * 0.3) return; // curto demais
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const dropped = Math.max(0, this.sampleCount - merged.length);
    const start = Math.max(0, (this.utteranceStart || 0) - dropped);
    const slice = merged.slice(start);
    this.chunks = [];
    this.sampleCount = 0;
    const blob = encodeWav(slice, this.context.sampleRate);
    this.onStatus('processing');
    this.onUtterance(blob, { duration: duration / 1000 });
  }

  setBusy(value) { this.busy = value; }

  disable() {
    cancelAnimationFrame(this.loop);
    this.loop = null;
    if (this.processor) { try { this.processor.disconnect(); } catch { /* */ } }
    if (this.source) { try { this.source.disconnect(); } catch { /* */ } }
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    if (this.context) { try { this.context.close(); } catch { /* */ } }
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.processor = null;
    this.source = null;
    this.chunks = [];
    this.speech = false;
    this.recording = false;
    this.level = 0;
    this.onLevel(0);
    this.onStatus('inactive');
  }
}

/* ------------------------------------------------------------------- síntese */
export class Speaker {
  constructor(options = {}) {
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onError = options.onError || (() => {});
    this.audio = null;
    this.utterance = null;
    this.url = null;
    this.enabled = true;
    this.preferredVoice = null;
    this.voices = [];
    this.voiceHint = '';
    this.rate = 1;
    this.pitch = 0.95;
    this.volume = 1;
    this._loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }
  }

  /* Pontuação de qualidade: vozes neurais/naturais ganham, robóticas perdem. */
  static scoreVoice(voice) {
    const blob = `${voice.name} ${voice.lang}`.toLowerCase();
    const isPt = /pt[-_]?br|pt[-_]?pt|portugu/.test(blob);
    if (!isPt) return -1;
    let score = 10;
    if (/natural|neural|online|premium|enhanced|expressive/.test(blob)) score += 12;
    if (/google/.test(blob)) score += 8;
    if (/microsoft/.test(blob)) score += 6;
    if (/daniel|antonio|antônio|ricardo|felipe|thiago|homem|male|joaquim/.test(blob)) score += 4;
    if (voice.localService === false) score += 1;
    if (/espeak|robot|compact|eloquence|deepl/.test(blob)) score -= 20;
    if (voice.default) score += 1;
    return score;
  }

  _loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    this.voices = voices.slice().sort((a, b) => Speaker.scoreVoice(b) - Speaker.scoreVoice(a));
    const hint = (this.voiceHint || '').toLowerCase();
    let escolhida = null;
    if (hint) {
      escolhida = this.voices.find((v) => `${v.name} ${v.lang}`.toLowerCase().includes(hint)) || null;
    }
    if (!escolhida) escolhida = this.voices.find((v) => Speaker.scoreVoice(v) > 0) || null;
    this.preferredVoice = escolhida;
  }

  setConfig(config = {}) {
    if (!config) return;
    if (typeof config.rate === 'number' && config.rate > 0) this.rate = config.rate;
    if (typeof config.pitch === 'number' && config.pitch > 0) this.pitch = config.pitch;
    if (typeof config.volume === 'number') this.volume = config.volume;
    if (typeof config.browser_voice === 'string') this.voiceHint = config.browser_voice;
    this._loadVoices();
  }

  setVoice(name) {
    this.voiceHint = name || '';
    this._loadVoices();
  }

  voicesList() {
    return (this.voices || []).filter((v) => Speaker.scoreVoice(v) > 0)
      .map((v) => ({ name: v.name, lang: v.lang, label: `${v.name} — ${v.lang}` }));
  }

  get status() {
    return {
      available: 'speechSynthesis' in window || !!this.audio,
      voice: this.preferredVoice ? `${this.preferredVoice.name} (${this.preferredVoice.lang})` : null,
    };
  }

  stop() {
    if (this.audio) {
      try { this.audio.pause(); } catch { /* */ }
      this.audio = null;
    }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.onEnd();
  }

  async speak(text, blob = null) {
    if (!this.enabled || !text) { this.onEnd(); return; }
    this.stop();
    this.onStart();
    if (blob) {
      try {
        this.url = URL.createObjectURL(blob);
        this.audio = new Audio(this.url);
        this.audio.onended = () => { this.stop(); };
        this.audio.onerror = () => { this.onError('falha ao reproduzir o áudio'); this.onEnd(); };
        await this.audio.play();
        return;
      } catch {
        /* segue para a síntese do navegador */
      }
    }
    this._speakBrowser(text);
  }

  _speakBrowser(text) {
    if (!('speechSynthesis' in window)) {
      this.onError('Este navegador não possui síntese de voz. O texto continua disponível na tela.');
      this.onEnd();
      return;
    }
    // divide textos longos: alguns navegadores cortam falas extensas
    const sentences = text.match(/[^.!?;:]+[.!?;:]?/g) || [text];
    const parts = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > 220) { parts.push(current); current = sentence; }
      else current += sentence;
    }
    if (current.trim()) parts.push(current);

    let index = 0;
    const next = () => {
      if (index >= parts.length) { this.onEnd(); return; }
      const part = parts[index++];
      const utterance = new SpeechSynthesisUtterance(part.trim());
      utterance.lang = 'pt-BR';
      utterance.rate = Math.max(0.5, Math.min(2, this.rate));
      utterance.pitch = Math.max(0.1, Math.min(2, this.pitch));
      utterance.volume = Math.max(0, Math.min(1, this.volume));
      if (this.preferredVoice) utterance.voice = this.preferredVoice;
      utterance.onend = next;
      utterance.onerror = () => { this.onEnd(); };
      this.utterance = utterance;
      window.speechSynthesis.speak(utterance);
    };
    next();
  }
}
