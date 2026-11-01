/* Composições originais para o lobby e o ciclo do jogo.
 * Piano/violão amostrados em CC0; partitura e fontes em public/audio/CREDITOS.md. */
import { GAME_TITLE, GAME_TAGLINE } from "./identity";

export type Track = "lobby" | "day" | "night" | "siege" | "none";
type PlayingTrack = { track: Exclude<Track, "none">; source: AudioBufferSourceNode; gain: GainNode };

export class MusicManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gain: GainNode | null = null;
  private track: Track = "none";
  private active: PlayingTrack | null = null;
  private fading: PlayingTrack | null = null;
  private buffers = new Map<Exclude<Track, "none">, AudioBuffer>();
  private loading = new Map<Exclude<Track, "none">, Promise<AudioBuffer | null>>();
  private generation = 0;
  private voiceEnabled = true;
  private spokenLobby = false;
  enabled = true;
  volume = 0.35;

  get current() { return this.track; }

  ensure() {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    if (typeof window === "undefined") return null;
    try {
      type WinAudio = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext || (window as WinAudio).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = 1; this.master.connect(ctx.destination);
      this.gain = ctx.createGain(); this.gain.gain.value = this.enabled ? this.volume * 0.55 : 0; this.gain.connect(this.master);
      return ctx;
    } catch { this.ctx = null; return null; }
  }

  setVolume(v: number) {
    const wasSilent = this.volume <= 0;
    this.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.updateGain();
    if (this.volume <= 0) {
      this.generation++;
      this.fadeCurrent();
      this.cancelVoice();
    } else if (wasSilent && this.enabled) this.startDesired();
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.updateGain();
    if (!on) { this.generation++; this.fadeCurrent(); this.cancelVoice(); }
    else if (this.volume > 0) this.startDesired();
  }

  private updateGain() {
    if (this.gain && this.ctx && this.ctx.state !== "closed") {
      this.gain.gain.setTargetAtTime(this.enabled ? this.volume * 0.55 : 0, this.ctx.currentTime, 0.04);
    }
  }

  setVoice(on: boolean) {
    this.voiceEnabled = on;
    if (!on) this.cancelVoice();
  }

  private cancelVoice() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch { /* voz opcional */ }
    }
  }

  /** The desired track changes immediately; stale network/decode results cannot
   * start later. The old track fades only once the new one is ready. */
  play(track: Track) {
    if (this.track === track) return;
    this.track = track;
    this.generation++;
    if (track !== "lobby") this.cancelVoice();
    if (track === "none" || !this.enabled || this.volume <= 0) this.fadeCurrent();
    else this.startDesired();
  }

  private startDesired() {
    const track = this.track, token = this.generation;
    if (track === "none" || !this.enabled || this.volume <= 0 || this.active?.track === track) return;
    const ctx = this.ensure();
    if (!ctx) return;
    void this.load(ctx, track).then((buffer) => {
      if (!buffer || this.ctx !== ctx || ctx.state === "closed" || token !== this.generation ||
          this.track !== track || !this.enabled || this.volume <= 0 || this.active?.track === track || !this.gain) return;
      this.fadeCurrent();
      const source = ctx.createBufferSource(), gain = ctx.createGain(), now = ctx.currentTime;
      source.buffer = buffer; source.loop = true;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.8);
      source.connect(gain); gain.connect(this.gain);
      const playing: PlayingTrack = { track, source, gain };
      this.active = playing;
      source.onended = () => {
        if (this.active === playing) this.active = null;
        if (this.fading === playing) this.fading = null;
        source.disconnect(); gain.disconnect();
      };
      source.start(now);
    });
  }

  private load(ctx: AudioContext, track: Exclude<Track, "none">): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(track);
    if (cached) { this.buffers.delete(track); this.buffers.set(track, cached); return Promise.resolve(cached); }
    const pending = this.loading.get(track);
    if (pending) return pending;
    const request = fetch(`/audio/music/${track}.mp3`).then(async (response) => {
      if (!response.ok) return null;
      return await ctx.decodeAudioData(await response.arrayBuffer());
    }).then((buffer) => {
      if (buffer && this.ctx === ctx && ctx.state !== "closed") {
        this.buffers.set(track, buffer);
        // Two decoded tracks are enough for transitions; the browser keeps its HTTP cache.
        while (this.buffers.size > 2) {
          const oldest = this.buffers.keys().next().value;
          if (oldest) this.buffers.delete(oldest); else break;
        }
      }
      return buffer;
    }).catch(() => null).finally(() => { this.loading.delete(track); });
    this.loading.set(track, request);
    return request;
  }

  private fadeCurrent() {
    const ctx = this.ctx;
    if (this.fading) {
      try { this.fading.source.stop(); } catch { /* já terminou */ }
      this.fading = null;
    }
    const current = this.active;
    this.active = null;
    if (!current || !ctx || ctx.state === "closed") return;
    this.fading = current;
    const now = ctx.currentTime;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + 0.7);
    try { current.source.stop(now + 0.75); } catch { /* já terminou */ }
  }

  /** Call from an actual gesture; browsers may suspend audio until then. */
  resume() {
    // This is called from a user gesture. Unlock the shared context even if
    // music is disabled: sound effects have their own independent volume.
    const ctx = this.ensure();
    if (ctx && (ctx.state === "suspended" || (ctx.state as string) === "interrupted")) void ctx.resume().catch(() => {});
    if (this.enabled && this.volume > 0 && this.track !== "none") {
      if (!this.active) this.startDesired();
    }
    if (this.enabled && this.track === "lobby" && !this.spokenLobby && this.voiceEnabled && this.volume > 0) this.speakLobbyChant();
  }

  stop() {
    this.generation++; this.track = "none"; this.fadeCurrent(); this.cancelVoice();
  }

  speakLobbyChant() {
    if (this.spokenLobby || !this.voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(`${GAME_TITLE}! ${GAME_TAGLINE}!`);
      u.lang = "pt-BR"; u.rate = 0.78; u.pitch = 0.7; u.volume = Math.min(1, this.volume * 0.9);
      this.spokenLobby = true;
      window.speechSynthesis.speak(u);
    } catch { /* o navegador pode não ter voz */ }
  }
}

export const music = new MusicManager();
