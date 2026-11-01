import cueData from "./audio-cues.generated.json";
import toolCueData from "./tool-audio-cues.generated.json";

/** Efeitos gravados CC0, reunidos em um único sprite para reduzir requisições.
 * As fontes e transformações estão em public/audio/CREDITOS.md. */
const CUES: Record<string, readonly number[]> = cueData;
export const AUDIO_GROUPS = {
  chop: ["chop1", "chop2", "chop3"], stone: ["stone1", "stone2", "stone3"],
  metal: ["metal1", "metal2"], crystal: ["crystal1", "crystal2"], rustle: ["rustle1", "rustle2"],
  swing: ["swing1", "swing2"], hit: ["hit1", "hit2", "hit3"], hurt: ["hurt1", "hurt2"],
  cloth: ["cloth1", "cloth2"], coin: ["coin1", "coin2"], gem: ["gem1", "gem2"],
  build: ["build1", "build2"], break: ["break1", "break2"], chest: ["chest1", "chest2"],
  equip: ["equip1", "equip2"], ui: ["ui1", "ui2"], quest: ["quest1", "quest2"],
  eat: ["eat1", "eat2"], death: ["death"],
  grass: ["grass1", "grass2", "grass3"], dirt: ["dirt1", "dirt2", "dirt3"],
  snow: ["snow1", "snow2"], bridge: ["bridge1", "bridge2"], rock: ["rock1", "rock2"],
  goat: ["goat1", "goat2", "goat3"], goose: ["goose1", "goose2", "goose3"], bird: ["bird1", "bird2", "bird3"],
  bones: ["bones1", "bones2", "bones3"], slime: ["slime1", "slime2"],
  deep: ["ogre-1", "ogre-4", "ogre-7", "duck-monster10"],
  small: ["duck-monster8", "duck-monster11", "duck-monster15", "ogre-2"],
  spectral: ["duck-monster12", "duck-monster13", "duck-monster14", "duck-monster16"],
  undead: ["ogre-3", "ogre-5", "ogre-9", "ogre-10", "duck-monster9"],
  deathDeep: ["ogre-6", "ogre-8", "duck-roar4"],
  deathOther: ["duck-die1", "duck-die2", "duck-die3"],
} as const;
/** A separate, small bank keeps the original effects unmodified. */
export const TOOL_AUDIO_GROUPS = {
  axeSwing: ["axeSwing1", "axeSwing2"], pickSwing: ["pickSwing1", "pickSwing2"],
  swordSwing: ["swordSwing1", "swordSwing2"], axeHit: ["axeHit1", "axeHit2"],
  pickStone: ["pickStone1", "pickStone2"], pickMetal: ["pickMetal1"], pickCrystal: ["pickCrystal1"],
} as const;
const GROUPS = { ...AUDIO_GROUPS, ...TOOL_AUDIO_GROUPS } as const;
const TOOL_CUES: Record<string, readonly number[]> = toolCueData;
type Group = keyof typeof GROUPS;
export type ToolSound = "axe" | "pick" | "sword" | "bow";
export type AmbientKind = "wind" | "sea" | "water" | "fire";
export type FootSurface = "grass" | "dirt" | "snow" | "bridge" | "rock";
type Ambient = { source: AudioBufferSourceNode; gain: GainNode; timer: ReturnType<typeof setTimeout> | null };
const clamp = (n: number, lo = 0, hi = 1) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;

async function decode(ctx: AudioContext, url: string, signal: AbortSignal): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    // Áudio é opcional: rede, decodificador ou reprodução podem ser bloqueados.
    return null;
  }
}

export class Sfx {
  ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private _vol = 0.35;
  private sprite: AudioBuffer | null = null;
  private spriteLoading: Promise<void> | null = null;
  private toolSprite: AudioBuffer | null = null;
  private toolSpriteLoading: Promise<void> | null = null;
  private abort = new AbortController();
  private closed = false;
  private voices = new Set<AudioBufferSourceNode>();
  private lastChoice = new Map<Group, number>();
  private nextAt = new Map<string, number>();
  private noiseBuffer: AudioBuffer | null = null;
  private ambientBuffers = new Map<AmbientKind, AudioBuffer>();
  private ambientLoading = new Map<AmbientKind, Promise<void>>();
  private ambientRetryAt = new Map<AmbientKind, number>();
  private ambientTargets = new Map<AmbientKind, number>();
  private ambientNodes = new Map<AmbientKind, Ambient>();

  get vol() { return this._vol; }
  set vol(value: number) {
    this._vol = clamp(value);
    if (this.output && this.ctx && this.ctx.state !== "closed") {
      this.output.gain.setTargetAtTime(this._vol, this.ctx.currentTime, 0.025);
    }
    if (!this._vol) this.silenceAmbience();
  }
  get samplesReady() { return !!this.sprite; }
  get toolSamplesReady() { return !!this.toolSprite; }

  /** Called directly from pointer/keyboard/gamepad gestures to unlock browsers. */
  ensure() {
    if (this.closed || typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.output = ctx.createGain();
        this.output.gain.value = this._vol;
        this.output.connect(ctx.destination);
      } catch { return; }
    }
    const ctx = this.ctx;
    if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") void ctx.resume().catch(() => {});
    if (!this.sprite && !this.spriteLoading) {
      this.spriteLoading = decode(ctx, "/audio/effects.mp3", this.abort.signal).then((buffer) => {
        if (!this.closed && this.ctx === ctx && buffer) this.sprite = buffer;
      }).finally(() => { this.spriteLoading = null; });
    }
    if (!this.toolSprite && !this.toolSpriteLoading) {
      this.toolSpriteLoading = decode(ctx, "/audio/tool-effects.mp3", this.abort.signal).then((buffer) => {
        if (!this.closed && this.ctx === ctx && buffer) this.toolSprite = buffer;
      }).finally(() => { this.toolSpriteLoading = null; });
    }
  }

  private play(group: Group, volume: number, pan = 0, rate = 1, cooldown = 0.09, delay = 0): boolean {
    const tool = group in TOOL_AUDIO_GROUPS;
    const ctx = this.ctx, out = this.output, sprite = tool ? this.toolSprite : this.sprite;
    if (!ctx || ctx.state !== "running" || !out || !sprite || this._vol <= 0 || volume <= 0 || this.voices.size >= 16) return false;
    const now = ctx.currentTime;
    if (now < (this.nextAt.get(group) ?? 0)) return false;
    const choices = GROUPS[group];
    let index = Math.floor(Math.random() * choices.length);
    if (choices.length > 1 && index === this.lastChoice.get(group)) index = (index + 1) % choices.length;
    const cue = (tool ? TOOL_CUES : CUES)[choices[index]];
    if (!cue || cue[0] + cue[1] > sprite.duration + 0.02) return false;
    this.lastChoice.set(group, index);
    this.nextAt.set(group, now + cooldown);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = sprite;
    source.playbackRate.value = clamp(rate * (0.96 + Math.random() * 0.08), 0.55, 1.6);
    gain.gain.value = clamp(volume, 0, 1);
    source.connect(gain);
    let panner: StereoPannerNode | null = null;
    if (Math.abs(pan) > 0.02 && typeof ctx.createStereoPanner === "function") {
      panner = ctx.createStereoPanner(); panner.pan.value = clamp(pan, -0.85, 0.85);
      gain.connect(panner); panner.connect(out);
    } else gain.connect(out);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source); source.disconnect(); gain.disconnect(); panner?.disconnect();
    };
    source.start(now + delay, cue[0], cue[1]);
    return true;
  }

  /** Quiet synthetic fallback for the few moments before the sprite loads. */
  tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    const ctx = this.ctx, out = this.output;
    if (!ctx || ctx.state !== "running" || !out || this._vol <= 0 || vol <= 0) return;
    const now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), now + dur);
    gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain); gain.connect(out); osc.start(now); osc.stop(now + dur + 0.02);
  }

  /** Short fallback used by the plane crash; the buffer is shared, never per frame. */
  noise(dur: number, vol: number) {
    const ctx = this.ctx, out = this.output;
    if (!ctx || ctx.state !== "running" || !out || this._vol <= 0 || vol <= 0) return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), now = ctx.currentTime;
    source.buffer = this.noiseBuffer; filter.type = "lowpass"; filter.frequency.value = 900;
    gain.gain.setValueAtTime(clamp(vol) * 0.5, now); gain.gain.linearRampToValueAtTime(0, now + dur);
    source.connect(filter); filter.connect(gain); gain.connect(out); source.start(now, 0, Math.min(dur, 1));
  }

  creature(type: string, proximity: number, pan = 0) {
    const ctx = this.ctx, strength = clamp(proximity);
    if (!ctx || ctx.state !== "running" || this._vol <= 0 || strength < 0.05 || ctx.currentTime < (this.nextAt.get("creature") ?? 0)) return;
    const deep = ["brute", "hulk", "demon", "orc"].includes(type);
    const spectral = ["stalker", "crawler", "spitter", "lich", "vampire"].includes(type);
    const small = ["bat", "imp"].includes(type);
    const group: Group = type === "skeleton" ? "bones" : type === "slime" ? "slime" : deep ? "deep" : spectral ? "spectral" : small ? "small" : "undead";
    const speed = deep ? 0.77 : type === "zombie" ? 0.82 : small ? 1.22 : spectral ? 1.08 : 0.94;
    if (this.play(group, strength * 0.62, pan, speed)) this.nextAt.set("creature", ctx.currentTime + 1.6 + Math.random() * 0.7);
  }

  monsterDeath(type: string, proximity: number, pan = 0) {
    const strength = clamp(proximity);
    if (strength < 0.05) return;
    const deep = ["brute", "hulk", "demon", "orc"].includes(type);
    const group: Group = type === "skeleton" ? "bones" : type === "slime" ? "slime" : deep ? "deathDeep" : "deathOther";
    this.play(group, 0.67 * strength, pan, deep ? 0.82 : 1.08, 0.45);
  }

  animal(kind: "rabbit" | "goose" | "goat", proximity: number, pan = 0) {
    const ctx = this.ctx, strength = clamp(proximity);
    if (!ctx || ctx.state !== "running" || this._vol <= 0 || strength < 0.05 || ctx.currentTime < (this.nextAt.get("animal") ?? 0)) return;
    // Coelhos são discretos: usa farfalhar de vegetação, não um grito artificial.
    const group: Group = kind === "rabbit" ? "rustle" : kind;
    if (this.play(group, strength * (kind === "rabbit" ? 0.28 : 0.42), pan, kind === "goose" ? 0.9 : 1, 0.3)) {
      this.nextAt.set("animal", ctx.currentTime + 9 + Math.random() * 7);
    }
  }
  bird() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this._vol <= 0 || ctx.currentTime < (this.nextAt.get("bird-call") ?? 0)) return;
    if (this.play("bird", 0.23, (Math.random() - 0.5) * 0.7, 1, 0.3)) this.nextAt.set("bird-call", ctx.currentTime + 13 + Math.random() * 10);
  }

  /** Os quatro ambientes são carregados sob demanda, com ganho suavizado.
   * Um timer encerra o loop após sair de perto/desativar o controle. */
  setAmbient(kind: AmbientKind, amount: number) {
    const ctx = this.ctx, strength = this._vol > 0 ? clamp(amount) : 0;
    this.ambientTargets.set(kind, strength);
    const active = this.ambientNodes.get(kind);
    if (active && ctx && ctx.state !== "closed") {
      active.gain.gain.setTargetAtTime(strength, ctx.currentTime, strength ? 0.35 : 0.2);
      if (strength > 0 && active.timer) { clearTimeout(active.timer); active.timer = null; }
      if (!strength && !active.timer) {
        active.timer = setTimeout(() => {
          if ((this.ambientTargets.get(kind) ?? 0) > 0) return;
          if (this.ambientNodes.get(kind) === active) this.ambientNodes.delete(kind);
          try { active.source.stop(); } catch { /* já terminou */ }
          active.source.disconnect(); active.gain.disconnect();
        }, 1200);
      }
      return;
    }
    if (!strength || !ctx || ctx.state !== "running" || !this.output || this.closed) return;
    const buffer = this.ambientBuffers.get(kind);
    if (!buffer) {
      if (!this.ambientLoading.has(kind) && Date.now() >= (this.ambientRetryAt.get(kind) ?? 0)) {
        const loading = decode(ctx, `/audio/ambient/${kind}.mp3`, this.abort.signal).then((audio) => {
          if (this.closed || this.ctx !== ctx) return;
          if (audio) {
            this.ambientBuffers.set(kind, audio);
            this.setAmbient(kind, this.ambientTargets.get(kind) ?? 0);
          } else this.ambientRetryAt.set(kind, Date.now() + 30000);
        }).finally(() => { this.ambientLoading.delete(kind); });
        this.ambientLoading.set(kind, loading);
      }
      return;
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setTargetAtTime(strength, ctx.currentTime, 0.45);
    source.connect(gain); gain.connect(this.output);
    const node: Ambient = { source, gain, timer: null };
    this.ambientNodes.set(kind, node);
    source.start(ctx.currentTime, Math.random() * Math.max(0, buffer.duration - 0.1));
  }
  wind() { this.setAmbient("wind", 0.32); }
  water(proximity: number, kind: "water" | "sea" = "water") { this.setAmbient(kind, clamp(proximity) * (kind === "sea" ? 0.52 : 0.62)); }
  fire(proximity: number) { this.setAmbient("fire", clamp(proximity) * 0.32); }
  silenceAmbience() { for (const kind of ["wind", "sea", "water", "fire"] as const) this.setAmbient(kind, 0); }

  // A brief lead-in lets the selected tool be heard before the material hit.
  chop() { this.play(this.toolSprite ? "axeHit" : "chop", 0.58, 0, 1, 0.1, 0.06); }
  mine(material: "rock" | "ore" | "crystal" = "rock") {
    const group: Group = this.toolSprite
      ? material === "ore" ? "pickMetal" : material === "crystal" ? "pickCrystal" : "pickStone"
      : material === "ore" ? "metal" : material === "crystal" ? "crystal" : "stone";
    this.play(group, 0.55, 0, 1, 0.1, 0.06);
  }
  foliage() { this.play("rustle", 0.36, 0, 1, 0.1); }
  swing(tool?: ToolSound) {
    if (!tool || tool === "bow") { this.play("swing", 0.3, 0, 1, 0.1); return; }
    const group: Group = !this.toolSprite ? "swing" : tool === "axe" ? "axeSwing" : tool === "pick" ? "pickSwing" : "swordSwing";
    this.play(group, 0.38, 0, tool === "axe" ? 0.85 : tool === "pick" ? 0.97 : 1.12, 0.1);
  }
  hit() { this.play("hit", 0.55, 0, 1, 0.1); }
  hurt() { this.play("hurt", 0.58, 0, 0.95, 0.3); }
  structureBreak() { this.play("break", 0.55, 0, 0.86, 0.3); }
  pickup(resource: "wood" | "stone" | "fiber" | "food" | "iron" | "crystal" = "fiber") {
    const group: Group = resource === "iron" ? "coin" : resource === "crystal" ? "gem" : resource === "stone" ? "stone" : resource === "wood" ? "chop" : "cloth";
    this.play(group, 0.22, 0, resource === "wood" ? 1.28 : 1.05, 0.12);
  }
  footstep(surface: FootSurface, running: boolean) { this.play(surface, running ? 0.19 : 0.14, 0, running ? 1.08 : 1, running ? 0.24 : 0.34); }
  build() { this.play("build", 0.42, 0, 1, 0.16); }
  chest() { this.play("chest", 0.42, 0, 1, 0.2); }
  equip() { this.play("equip", 0.3, 0, 1, 0.12); }
  eat() { this.play("eat", 0.34, 0, 1, 0.2); }
  roll() { this.play("swing", 0.23, 0, 0.86, 0.2); }
  die() { this.play("death", 0.4, 0, 0.85, 0.5); }
  quest() { this.play("quest", 0.28, 0, 1, 0.2); }
  night() { this.play("death", 0.22, 0, 0.65, 0.8); }
  ui() { this.play("ui", 0.22, 0, 1, 0.06); }

  destroy() {
    if (this.closed) return;
    this.closed = true; this.abort.abort();
    for (const node of this.ambientNodes.values()) {
      if (node.timer) clearTimeout(node.timer);
      try { node.source.stop(); } catch { /* já terminou */ }
      node.source.disconnect(); node.gain.disconnect();
    }
    this.ambientNodes.clear(); this.ambientTargets.clear(); this.ambientBuffers.clear();
    for (const voice of this.voices) { try { voice.stop(); } catch { /* já terminou */ } }
    this.voices.clear();
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => {});
    this.ctx = null; this.output = null; this.sprite = null; this.toolSprite = null; this.noiseBuffer = null;
  }
}
