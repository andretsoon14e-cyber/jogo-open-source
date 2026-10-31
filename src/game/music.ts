/* Música procedural — sem arquivos externos, leve e infinita. */

import { GAME_TITLE, GAME_TAGLINE } from "./identity";

export type Track = "lobby" | "day" | "night" | "siege" | "none";

interface Pattern {
  bpm: number;
  bass: number[];
  lead: number[][];
  pad: number[][];
  hats: number;
  kick: number[];
  wave: OscillatorType;
  leadWave: OscillatorType;
  gain: number;
}

const A2 = 45, C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, G5 = 79, A5 = 81;

const PATTERNS: Record<Exclude<Track, "none">, Pattern> = {
  // Original, restrained motifs: warm major harmony by day and sparse minor
  // tones at night. These are synthesized locally; no recordings are shipped.
  lobby: {
    bpm: 88, wave: "triangle", leadWave: "sine", gain: 0.36,
    bass: [A2, A2, F3, F3, C3, C3, G3, G3],
    pad: [[A3, C4, E4], [F3, A3, C4], [C4, E4, G4], [G3, B4, D5]],
    lead: [[0, E4, 2], [3, A4, 2], [6, C5, 3], [10, A4, 2], [13, G4, 2], [16, E4, 3], [20, G4, 2], [23, A4, 3], [27, C5, 2], [30, A4, 2]],
    kick: [0, 16], hats: 0,
  },
  day: {
    bpm: 92, wave: "sine", leadWave: "triangle", gain: 0.34,
    bass: [C3, C3, G3, G3, A2, A2, F3, F3],
    pad: [[C4, E4, G4], [G3, B4, D5], [A3, C4, E4], [F3, A3, C4]],
    lead: [[0, E4, 2], [3, G4, 2], [6, C5, 3], [10, B4, 2], [13, G4, 2], [16, A4, 3], [20, C5, 2], [23, E5, 2], [26, D5, 2], [29, C5, 3]],
    kick: [0, 16], hats: 0,
  },
  night: {
    bpm: 62, wave: "triangle", leadWave: "sine", gain: 0.30,
    bass: [A2, A2, F3, F3, E3, E3, A2, A2],
    pad: [[A3, C4, E4], [F3, A3, C4], [E3, G3, B4], [A3, C4, E4]],
    lead: [[0, A3, 6], [8, E4, 5], [16, G4, 3], [21, E4, 4], [27, C4, 5]],
    kick: [], hats: 0,
  },
  siege: {
    bpm: 108, wave: "triangle", leadWave: "triangle", gain: 0.32,
    bass: [A2, A2, A2, A2, F3, F3, G3, G3],
    pad: [[A3, C4, E4], [A3, C4, E4], [F3, A3, C4], [G3, B4, D5]],
    lead: [[0, A4, 2], [3, C5, 1], [4, E5, 3], [8, D5, 2], [11, C5, 1], [12, A4, 4], [16, F4, 2], [19, A4, 2], [22, C5, 3], [26, B4, 2], [29, A4, 3]],
    kick: [0, 8, 16, 24], hats: 8,
  },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class MusicManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private step = 0;
  private track: Track = "none";
  private voiceEnabled = true;
  private spokenLobby = false;
  enabled = true;
  volume = 0.35;

  get current() { return this.track; }

  ensure() {
    if (this.ctx) return this.ctx;
    try {
      type WinAudio = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext || (window as WinAudio).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.enabled ? this.volume * 0.24 : 0;
      this.gain.connect(this.master);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(this.enabled ? this.volume * 0.24 : 0, this.ctx.currentTime, 0.08);
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(on ? this.volume * 0.24 : 0, this.ctx.currentTime, 0.08);
    }
    if (on && this.track !== "none") this.resume();
  }

  setVoice(on: boolean) { this.voiceEnabled = on; }

  play(track: Track) {
    if (this.track === track && this.timer) return;
    this.stop();
    this.track = track;
    if (track === "none") return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const p = PATTERNS[track];
    this.nextNote = ctx.currentTime + 0.12;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 90);
    if (track === "lobby" && this.voiceEnabled && !this.spokenLobby) {
      this.spokenLobby = true;
      this.chant();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.track = "none";
  }

  private chant() {
    if (!this.voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(`${GAME_TITLE}! ${GAME_TAGLINE}!`);
      u.lang = "pt-BR";
      u.rate = 0.78;
      u.pitch = 0.7;
      u.volume = Math.min(1, this.volume * 0.9);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* sem voz */
    }
  }

  speakLobbyChant() {
    if (!this.spokenLobby) { this.spokenLobby = true; this.chant(); }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.track === "none") return;
    const p = PATTERNS[this.track as Exclude<Track, "none">];
    const stepDur = 60 / p.bpm / 2;
    while (this.nextNote < ctx.currentTime + 0.35) {
      const s = this.step;
      const t = this.nextNote;
      // bass
      if (s % 4 === 0) {
        const n = p.bass[(s / 4) % p.bass.length];
        this.note(midi(n - 12), t, stepDur * 3.4, p.wave, 0.16 * p.gain);
      }
      // pad
      if (s % 8 === 0) {
        const chord = p.pad[(s / 8) % p.pad.length];
        for (const n of chord) this.note(midi(n), t, stepDur * 7, "sine", 0.05 * p.gain);
      }
      // drums
      if (p.kick.includes(s)) this.drum(t, 0.18, 90, 0.12 * p.gain);
      if (p.hats && s % p.hats === 0) this.hat(t, 0.05 * p.gain);
      // lead
      for (const [at, note, len] of p.lead) {
        if (at === s) this.note(midi(note), t, stepDur * len * 0.92, p.leadWave, 0.11 * p.gain);
      }
      this.nextNote += stepDur;
      this.step = (s + 1) % 32;
    }
  }

  private note(freq: number, at: number, dur: number, wave: OscillatorType, vol: number) {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, vol), at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.gain);
    o.start(at);
    o.stop(at + dur + 0.03);
  }

  private drum(at: number, dur: number, freq: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(38, at + dur);
    g.gain.setValueAtTime(Math.max(0.0005, vol), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(this.gain);
    o.start(at); o.stop(at + dur + 0.02);
  }

  private hat(at: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const n = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = Math.max(0.0005, vol);
    src.connect(f); f.connect(g); g.connect(this.gain);
    src.start(at);
  }
}

export const music = new MusicManager();
