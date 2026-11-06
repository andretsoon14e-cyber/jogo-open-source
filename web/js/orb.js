/* Núcleo animado do J.A.R.V.I.S. — canvas 2D, sem dependências externas.
   Cada estado tem uma linguagem visual própria:
   idle · listening · processing · speaking · executing · confirming · error      */

const PALETTES = {
  idle: { base: '#35e6ff', accent: '#1a7dff', speed: 0.18, glow: 0.32 },
  offline: { base: '#2a5666', accent: '#123a4a', speed: 0.06, glow: 0.12 },
  wake: { base: '#7ef0ff', accent: '#35e6ff', speed: 0.5, glow: 0.55 },
  listening: { base: '#35e6ff', accent: '#7ef0ff', speed: 0.55, glow: 0.62 },
  processing: { base: '#5aa9ff', accent: '#1a7dff', speed: 1.5, glow: 0.55 },
  speaking: { base: '#4bffc4', accent: '#35e6ff', speed: 0.75, glow: 0.68 },
  executing: { base: '#ffb648', accent: '#ff8a3d', speed: 1.05, glow: 0.5 },
  confirming: { base: '#ffb648', accent: '#ffd08a', speed: 0.32, glow: 0.45 },
  error: { base: '#ff5a6e', accent: '#ff8a9a', speed: 0.9, glow: 0.5 },
};

function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export class Orb {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.compact = !!options.compact;
    this.state = 'idle';
    this.level = 0;          // 0..1 — volume do microfone
    this.energy = 0;         // 0..1 — intensidade de fala
    this.palette = PALETTES.idle;
    this.analyser = null;
    this.frequency = null;
    this.t = 0;
    this.pulse = 0;
    this.particles = Array.from({ length: this.compact ? 14 : 34 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.42 + Math.random() * 0.3,
      speed: 0.12 + Math.random() * 0.4,
      size: 0.6 + Math.random() * 1.6,
      drift: Math.random() * Math.PI * 2,
    }));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this._tick = this._tick.bind(this);
    this.raf = requestAnimationFrame(this._tick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dpr = dpr;
    this.w = rect.width;
    this.h = rect.height;
  }

  setState(state) {
    if (!PALETTES[state]) return;
    this.state = state;
    this.palette = PALETTES[state];
    if (state === 'processing' || state === 'executing') this.pulse = 1;
  }

  setLevel(value) {
    this.level = Math.max(0, Math.min(1, value || 0));
  }

  setEnergy(value) {
    this.energy = Math.max(0, Math.min(1, value || 0));
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    this.frequency = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  _spectrum() {
    if (!this.analyser || !this.frequency) return null;
    this.analyser.getByteFrequencyData(this.frequency);
    return this.frequency;
  }

  _tick(now) {
    this.raf = requestAnimationFrame(this._tick);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000 || 0.016);
    this._last = now;
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.draw(dt);
  }

  draw(dt) {
    const { ctx, w, h } = this;
    if (!ctx || !w || !h) return;
    const cx = w / 2;
    const cy = h / 2;
    const unit = Math.min(w, h) / 2;
    const p = this.palette;
    const state = this.state;
    const spectrum = this._spectrum();

    ctx.clearRect(0, 0, w, h);

    // intensidade global: base + voz + fala
    const breathing = state === 'idle' ? 0.5 + Math.sin(this.t * 1.1) * 0.5
      : 0.65 + Math.sin(this.t * (state === 'processing' ? 6 : 2.4)) * 0.35;
    const voice = state === 'listening' ? this.level : 0;
    const energy = state === 'speaking' ? Math.max(this.energy, 0.12 + Math.abs(Math.sin(this.t * 7)) * 0.16) : 0;
    const intensity = Math.min(1, 0.24 + breathing * 0.3 + voice * 0.7 + energy * 0.6 + this.pulse * 0.25);
    const glowAlpha = p.glow * (0.7 + intensity * 0.6);
    const jitter = state === 'error' ? (Math.random() - 0.5) * 7 : 0;

    // ------------------------------------------------------------------ halo
    const halo = ctx.createRadialGradient(cx + jitter, cy, unit * 0.05, cx, cy, unit);
    halo.addColorStop(0, rgba(p.base, 0.34 * intensity));
    halo.addColorStop(0.42, rgba(p.accent, 0.12 * intensity));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, unit, 0, Math.PI * 2);
    ctx.fill();

    // -------------------------------------------------------------- anéis base
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';

    const rings = this.compact ? 2 : 4;
    for (let i = 0; i < rings; i += 1) {
      const radius = unit * (0.52 + i * 0.115);
      const rotation = this.t * p.speed * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.22);
      const dashCount = 4 + i * 5;
      const gap = (Math.PI * 2) / dashCount;
      ctx.save();
      ctx.rotate(rotation);
      ctx.strokeStyle = rgba(p.base, (0.3 - i * 0.05) * (0.6 + intensity));
      ctx.lineWidth = (1.1 - i * 0.15) * (this.canvas.width / 900) * 2;
      for (let d = 0; d < dashCount; d += 1) {
        const start = d * gap + gap * 0.12;
        const end = start + gap * 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, radius, start, end);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---------------------------------------------------------------- tick ring
    if (!this.compact) {
      const ticks = 72;
      for (let i = 0; i < ticks; i += 1) {
        const angle = (i / ticks) * Math.PI * 2 + this.t * p.speed * 0.25;
        const active = spectrum
          ? (spectrum[Math.floor((i / ticks) * (spectrum.length * 0.55))] || 0) / 255
          : (Math.sin(this.t * 1.6 + i * 0.4) + 1) / 2 * 0.35;
        const strength = 0.14 + active * 0.85;
        const inner = unit * 0.80;
        const outer = unit * (0.82 + strength * 0.055);
        ctx.strokeStyle = rgba(p.base, 0.16 + strength * 0.5);
        ctx.lineWidth = (i % 6 === 0 ? 1.7 : 0.8) * (this.canvas.width / 1000);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
    }

    // ------------------------------------------------------- espectro circular
    if (spectrum && (state === 'listening' || state === 'speaking' || state === 'wake')) {
      const bars = 88;
      const inner = unit * 0.62;
      for (let i = 0; i < bars; i += 1) {
        // metade esquerda/direita espelhada para simetria visual
        const index = Math.floor((i < bars / 2 ? i : bars - i) / (bars / 2) * (spectrum.length * 0.5));
        const value = (spectrum[index] || 0) / 255;
        const angle = -Math.PI / 2 + (i / bars) * Math.PI * 2;
        const length = unit * (0.035 + value * 0.2);
        ctx.strokeStyle = rgba(i % 2 ? p.base : p.accent, 0.25 + value * 0.75);
        ctx.lineWidth = unit * 0.012;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
        ctx.stroke();
      }
    }

    // --------------------------------------------------------- ondas de áudio
    if (state === 'listening' && this.level > 0.02) {
      const waves = 3;
      for (let i = 0; i < waves; i += 1) {
        const phase = (this.t * 0.6 + i * 0.33) % 1;
        const radius = unit * (0.6 + phase * 0.45);
        ctx.strokeStyle = rgba(p.base, (1 - phase) * 0.32 * this.level);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (state === 'speaking') {
      for (let i = 0; i < 3; i += 1) {
        const phase = (this.t * 0.85 + i * 0.33) % 1;
        const radius = unit * (0.58 + phase * 0.5);
        ctx.strokeStyle = rgba(p.base, (1 - phase) * 0.3);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // -------------------------------------------------------- varredura / scan
    if (state === 'processing' || state === 'executing') {
      const sweep = ctx.createConicGradient
        ? ctx.createConicGradient(this.t * 2.4, 0, 0)
        : null;
      if (sweep) {
        sweep.addColorStop(0, rgba(p.base, 0.0));
        sweep.addColorStop(0.06, rgba(p.base, 0.35));
        sweep.addColorStop(0.18, rgba(p.accent, 0.05));
        sweep.addColorStop(0.6, 'rgba(0,0,0,0)');
        sweep.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sweep;
        ctx.beginPath();
        ctx.arc(0, 0, unit * 0.78, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(p.base, 0.55);
      ctx.lineWidth = 1.6;
      const start = this.t * 3.4;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, unit * (0.66 + i * 0.05), start + i * 0.7, start + i * 0.7 + 1.1);
        ctx.stroke();
      }
    }

    // ------------------------------------------------------------- núcleo
    const corePulse = 1 + Math.sin(this.t * (state === 'processing' ? 5.5 : 2.1)) * 0.055
      + (voice + energy) * 0.16 + this.pulse * 0.1;
    const coreRadius = unit * 0.3 * corePulse;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
    core.addColorStop(0, rgba('#ffffff', 0.92));
    core.addColorStop(0.22, rgba(p.base, 0.92));
    core.addColorStop(0.62, rgba(p.accent, 0.35));
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // anel interno fino
    ctx.strokeStyle = rgba('#ffffff', 0.28 + intensity * 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    // ----------------------------------------------------------- partículas
    if (!this.compact) {
      for (const particle of this.particles) {
        particle.angle += particle.speed * dt * (state === 'processing' ? 1.8 : 0.7);
        const wobble = Math.sin(this.t * 0.9 + particle.drift) * 0.012;
        const radius = unit * (particle.radius + wobble + voice * 0.05);
        const x = Math.cos(particle.angle) * radius;
        const y = Math.sin(particle.angle) * radius * 0.98;
        ctx.fillStyle = rgba(p.base, 0.18 + intensity * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, particle.size * (this.canvas.width / 900), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // ------------------------------------------------------- marcas de eixo
    if (!this.compact) {
      ctx.strokeStyle = rgba(p.base, 0.12);
      ctx.lineWidth = 1;
      const marks = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const angle of marks) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * unit * 0.86, cy + Math.sin(angle) * unit * 0.86);
        ctx.lineTo(cx + Math.cos(angle) * unit * 0.94, cy + Math.sin(angle) * unit * 0.94);
        ctx.stroke();
      }
      // pequenos rótulos técnicos
      ctx.fillStyle = rgba(p.base, 0.25);
      ctx.font = `${Math.max(8, unit * 0.05)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const label = state === 'idle' ? 'STANDBY' : state.toUpperCase();
      ctx.fillText(label, cx, cy + unit * 0.99);
    }
  }
}

/* Fala sintética para o núcleo quando não há análise de áudio disponível:
   simula energia vocal para que a animação acompanhe o ritmo da voz. */
export class SpeechEnergy {
  constructor(orb) {
    this.orb = orb;
    this.timer = null;
  }
  start() {
    this.stop();
    let phase = 0;
    this.timer = setInterval(() => {
      phase += 0.14;
      const base = 0.35 + Math.abs(Math.sin(phase)) * 0.5;
      const tremble = Math.random() * 0.18;
      this.orb.setEnergy(Math.min(1, base + tremble));
    }, 70);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.orb.setEnergy(0);
  }
}
