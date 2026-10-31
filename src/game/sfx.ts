/* Procedural sound effects: no downloads and no unbounded audio loops. */
export class Sfx {
  ctx: AudioContext | null = null;
  vol = 0.35;
  private noiseBuffer: AudioBuffer | null = null;
  private nextCreatureAt = 0;
  private nextAnimalAt = 0;
  private nextWindAt = 0;
  private nextWaterAt = 0;
  private nextFireAt = 0;
  private nextBirdAt = 0;
  private nextHitAt = 0;

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
    if (!this.ctx || this.ctx.state !== "running" || this.vol <= 0 || vol <= 0) return;
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
    if (!this.ctx || this.ctx.state !== "running" || this.vol <= 0 || vol <= 0) return;
    const t = this.ctx.currentTime;
    const source = this.noiseSource(this.ctx);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * this.vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    source.connect(gain); gain.connect(this.ctx.destination);
    source.start(t, 0, Math.min(dur, 1));
  }

  private filteredNoise(dur: number, vol: number, frequency: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || vol <= 0) return;
    const t = ctx.currentTime, source = this.noiseSource(ctx), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = 0.6;
    gain.gain.setValueAtTime(this.vol * vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
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
    this.nextWindAt = t + 3 + Math.random() * 2;
    const source = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 420; filter.Q.value = 0.45;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.vol * 0.24, t + 0.4);
    gain.gain.linearRampToValueAtTime(0, t + 0.98);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(t, 0, 1);
  }

  /** Soft birdsong during the day, synthesized in two short phrases. */
  bird() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || ctx.currentTime < this.nextBirdAt) return;
    const t = ctx.currentTime; this.nextBirdAt = t + 10 + Math.random() * 8;
    const root = 1250 + Math.random() * 280;
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.16, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(root * (i ? 1.12 : 1), at);
      osc.frequency.exponentialRampToValueAtTime(root * (i ? 1.3 : 1.16), at + 0.12);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, this.vol * 0.12), at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + 0.15);
    }
  }

  /** Brief, distinct animal calls, louder nearby and throttled across flocks. */
  animal(kind: "rabbit" | "goose" | "goat", proximity: number) {
    const ctx = this.ctx, strength = Math.max(0, Math.min(1, proximity));
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || strength < 0.05 || ctx.currentTime < this.nextAnimalAt) return;
    const t = ctx.currentTime;
    this.nextAnimalAt = t + 3.5 + Math.random() * 2;
    const pitch = kind === "goose" ? 290 : kind === "goat" ? 190 : 720;
    const duration = kind === "goose" ? 0.32 : kind === "goat" ? 0.42 : 0.18;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    oscillator.type = kind === "rabbit" ? "sine" : kind === "goat" ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(pitch, t);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * (kind === "rabbit" ? 1.3 : 0.78), t + duration);
    filter.type = "lowpass"; filter.frequency.value = kind === "goose" ? 1050 : 1600;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, this.vol * strength * 0.42), t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    oscillator.start(t); oscillator.stop(t + duration + 0.01);
  }

  /** Water and fire reuse a one-second noise buffer and stop on their own. */
  water(proximity: number) {
    const ctx = this.ctx, strength = Math.max(0, Math.min(1, proximity));
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || strength < 0.05 || ctx.currentTime < this.nextWaterAt) return;
    const t = ctx.currentTime; this.nextWaterAt = t + 0.95;
    const source = this.noiseSource(ctx), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = "bandpass"; filter.frequency.value = 750; filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.vol * strength * 0.24, t + 0.2);
    gain.gain.linearRampToValueAtTime(0, t + 0.98);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start(t, 0, 1);
  }

  fire(proximity: number) {
    const ctx = this.ctx, strength = Math.max(0, Math.min(1, proximity));
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || strength < 0.05 || ctx.currentTime < this.nextFireAt) return;
    const t = ctx.currentTime; this.nextFireAt = t + 1.3;
    const source = this.noiseSource(ctx), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = "bandpass"; filter.frequency.value = 1300; filter.Q.value = 0.7;
    gain.gain.setValueAtTime(this.vol * strength * 0.15, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.42);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start(t, 0, 0.42);
  }

  chop() { this.tone(180, 0.09, "square", 0.5, -60); this.noise(0.06, 0.3); }
  mine() { this.tone(520, 0.05, "square", 0.35, -200); this.noise(0.08, 0.45); }
  swing() { this.filteredNoise(0.08, 0.14, 1100); }
  hit() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.vol <= 0 || ctx.currentTime < this.nextHitAt) return;
    this.nextHitAt = ctx.currentTime + 0.09;
    this.tone(145, 0.11, "sine", 0.27, -75);
    this.filteredNoise(0.09, 0.24, 750);
  }
  hurt() { this.tone(170, 0.22, "triangle", 0.28, -95); this.filteredNoise(0.12, 0.12, 480); }
  monsterDeath(type: string, proximity: number) {
    const strength = Math.max(0, Math.min(1, proximity));
    if (strength <= 0.05) return;
    const deep = type === "brute" || type === "hulk" || type === "demon" || type === "orc";
    this.tone(deep ? 105 : 190, 0.28, "triangle", 0.24 * strength, deep ? -55 : -100);
    this.filteredNoise(0.18, 0.19 * strength, deep ? 360 : 620);
  }
  structureBreak() { this.tone(100, 0.18, "sine", 0.25, -55); this.filteredNoise(0.18, 0.3, 500); }
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
