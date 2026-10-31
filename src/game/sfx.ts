/* Procedural sound effects: no downloads and no unbounded audio loops. */
export class Sfx {
  ctx: AudioContext | null = null;
  vol = 0.35;
  private noiseBuffer: AudioBuffer | null = null;
  private nextCreatureAt = 0;
  private nextWindAt = 0;

  ensure() {
    if (!this.ctx && typeof window !== "undefined") {
      try {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtor) this.ctx = new AudioCtor();
      } catch { /* audio is optional */ }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    if (!this.noiseBuffer) {
      // Share a short buffer across sounds instead of allocating one per hit.
      this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    return source;
  }

  tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (!this.ctx || this.vol <= 0 || vol <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol * this.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur: number, vol: number) {
    if (!this.ctx || this.vol <= 0 || vol <= 0) return;
    const t = this.ctx.currentTime;
    const source = this.noiseSource(this.ctx);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * this.vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    source.connect(gain); gain.connect(this.ctx.destination);
    source.start(t, 0, Math.min(dur, 1));
  }

  /** Short positional warning; the cooldown prevents hordes from piling up audio nodes. */
  creature(type: string, proximity: number) {
    const ctx = this.ctx;
    const strength = Math.max(0, Math.min(1, proximity));
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || strength < 0.04 || ctx.currentTime < this.nextCreatureAt) return;
    const t = ctx.currentTime;
    this.nextCreatureAt = t + 1.6;
    const deep = type === "brute" || type === "hulk" || type === "demon" || type === "orc";
    const spectral = type === "bat" || type === "stalker" || type === "crawler" || type === "spitter";
    const duration = spectral ? 0.52 : 0.38;
    const pitch = deep ? 86 : spectral ? 270 : 150;
    const oscillator = ctx.createOscillator();
    oscillator.type = spectral ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(pitch, t);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * (spectral ? 1.35 : 0.55), t + duration);

    // A soft low-frequency wobble and filtered hiss give a growl/whisper
    // without large sound files or an oscillator per monster per frame.
    const wobble = ctx.createOscillator(), depth = ctx.createGain();
    wobble.type = "sine"; wobble.frequency.value = deep ? 19 : spectral ? 8 : 25;
    depth.gain.value = spectral ? 17 : 26;
    wobble.connect(depth); depth.connect(oscillator.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = deep ? 430 : spectral ? 1100 : 650;
    const gain = ctx.createGain();
    const level = this.vol * strength;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * (spectral ? 0.28 : 0.34)), t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    oscillator.start(t); oscillator.stop(t + duration + 0.01);
    wobble.start(t); wobble.stop(t + duration + 0.01);

    const hiss = this.noiseSource(ctx);
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass"; hissFilter.frequency.value = spectral ? 1500 : 520; hissFilter.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(level * 0.14, t);
    hissGain.gain.linearRampToValueAtTime(0, t + duration);
    hiss.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(ctx.destination);
    hiss.start(t, 0, duration);
  }

  /** An occasional soft gust. It reuses the noise buffer, finishes on its
   * own, and never creates nodes while muted or the browser is suspended. */
  wind() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || ctx.currentTime < this.nextWindAt) return;
    const t = ctx.currentTime;
    this.nextWindAt = t + 7 + Math.random() * 5;
    const source = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 420; filter.Q.value = 0.45;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.vol * 0.12, t + 0.4);
    gain.gain.linearRampToValueAtTime(0, t + 0.98);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(t, 0, 1);
  }

  chop() { this.tone(180, 0.09, "square", 0.5, -60); this.noise(0.06, 0.3); }
  mine() { this.tone(520, 0.05, "square", 0.35, -200); this.noise(0.08, 0.45); }
  swing() { this.noise(0.05, 0.18); }
  hit() { this.tone(140, 0.12, "sawtooth", 0.6, -70); this.noise(0.08, 0.4); }
  hurt() { this.tone(220, 0.25, "sawtooth", 0.55, -140); }
  pickup() { this.tone(660, 0.07, "sine", 0.4, 220); this.tone(990, 0.09, "sine", 0.25, 120); }
  build() { this.tone(330, 0.12, "triangle", 0.5, 80); this.tone(440, 0.18, "triangle", 0.35, 110); }
  eat() { this.tone(300, 0.08, "sine", 0.4, 60); this.tone(380, 0.1, "sine", 0.3, 60); }
  roll() { this.noise(0.12, 0.22); }
  die() { this.tone(300, 0.6, "sawtooth", 0.6, -260); }
  quest() { this.tone(523, 0.12, "sine", 0.45); this.tone(659, 0.12, "sine", 0.45); this.tone(784, 0.25, "sine", 0.45); }
  night() { this.tone(110, 0.8, "sawtooth", 0.25, -40); }
  ui() { this.tone(500, 0.05, "sine", 0.3, 100); }

  destroy() {
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    this.ctx = null;
    this.noiseBuffer = null;
  }
}
