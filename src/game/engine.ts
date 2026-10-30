/* =========================================================
   UMBRA — A ÚLTIMA CLAREIRA · survival engine (canvas 2D)
   ========================================================= */

import { drawSign, drawFlag } from "@/game/art";
import { drawSprite, drawCharacter, drawToolSprite, spriteSize, getBaked, SPRITES, SCALE } from "@/game/sprites";
import { Terrain, drawWaterAnim } from "@/game/terrain";
import { MusicManager } from "@/game/music";
import { GameSettings, DEFAULT_SETTINGS } from "@/game/settings";
import { SITES, GLACIER, EQUIPMENT, type EquipmentKey } from "@/game/world-content";

export type Difficulty = "dificil" | "muito-dificil" | "impossivel";
export type Mode = "single" | "multi";
export type GameState = "cutscene" | "playing" | "paused" | "gameover" | "victory";
export type ResKey = "wood" | "stone" | "fiber" | "food" | "iron" | "crystal";
export type ToolKey = "axe" | "pick" | "sword";
export type FenceStyle = "rustic" | "palisade" | "stone" | "hedge";

export const RES_LABEL: Record<ResKey, string> = {
  wood: "Madeira", stone: "Pedra", fiber: "Fibra", food: "Comida", iron: "Ferro", crystal: "Cristal",
};
export const RES_ICON: Record<ResKey, string> = {
  wood: "🪵", stone: "🪨", fiber: "🌾", food: "🍖", iron: "⛓️", crystal: "💎",
};
export const TOOL_LABEL: Record<ToolKey, string> = { axe: "Machado", pick: "Picareta", sword: "Espada" };
export const TOOL_ICON: Record<ToolKey, string> = { axe: "🪓", pick: "⛏️", sword: "⚔️" };

export type GamePanel = "build" | "forge" | "inventory" | "bestiary" | "none";

export interface BuildOption {
  id: string; name: string; icon: string; desc: string;
  cost: Partial<Record<ResKey, number>>;
  affordable: boolean; locked: boolean; lockReason: string;
}
export interface UpgradeOption {
  tool: ToolKey; level: number; nextLevel: number;
  cost: Partial<Record<ResKey, number>>;
  affordable: boolean; locked: boolean; lockReason: string;
}
export interface QuestView {
  id: string; name: string; desc: string; done: boolean; progress: number; target: number; reward: string;
}
export interface Snapshot {
  state: GameState;
  hp: number; maxHp: number; stamina: number;
  inv: Record<ResKey, number>;
  tools: Record<ToolKey, number>;
  day: number; phaseLabel: string; isNight: boolean;
  score: number; kills: number; deaths: number;
  quests: QuestView[];
  allies: string[];
  baseLevel: number;
  buildOptions: BuildOption[];
  upgradeOptions: UpgradeOption[];
  raftReasons: string[];
  canRespawn: boolean;
  outcome: "morte" | "vitoria" | null;
  teamScore: number;
  mpCount: number;
  zone: string;
  fps: number;
  tutorial: TutorialView | null;
  underAttack: boolean;
  gateState: "nenhum" | "aberto" | "fechado";
  walls: number;
  controlHints: string[];
  placing: { id: string; name: string; valid: boolean; reason: string; facing: "frente" | "lado" | "círculo" } | null;
  escort: boolean;
  seenCreatures: string[];
  creatureKills: Record<string, number>;
  discoveredSites: string[];
  claimedSites: string[];
  equipment: Record<EquipmentKey, boolean>;
  heldTool: ToolKey;
  renderScale: number;
  fenceStyle: FenceStyle;
  fenceStyles: { id: FenceStyle; name: string; desc: string; hp: number; cost: Partial<Record<ResKey, number>>; locked: boolean }[];
}
export interface TutorialView {
  id: string; title: string; text: string; keys: string[]; step: number; total: number;
}
export type UiEvent =
  | { type: "snapshot"; snap: Snapshot }
  | { type: "state"; state: GameState }
  | { type: "panel"; panel: GamePanel }
  | { type: "toast"; text: string; who?: string };

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  mode: Mode;
  difficulty: Difficulty;
  playerName: string;
  seed: number;
  continueSave: boolean;
  mp?: { code: string; playerId: string };
  settings?: GameSettings;
  music?: MusicManager;
  onUi: (ev: UiEvent) => void;
}

/* ---------------- RNG / noise ---------------- */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- constants ---------------- */
const TILE = 32;
const W = 190, H = 190;
const WPX = W * TILE, HPX = H * TILE;

const T_WATER = 0, T_SAND = 1, T_GRASS = 2, T_DARK = 3, T_PATH = 4, T_ROCK = 5, T_CAVE = 6, T_BRIDGE = 7, T_SNOW = 8, T_ICE = 9, T_RUIN = 10, T_SNOW_PATH = 11, T_NECRO = 12;

const VILLAGE = { x: 58 * TILE, y: 122 * TILE, r: 13 * TILE };
const BASE = { x: 104 * TILE, y: 88 * TILE, r: 15 * TILE };
const CAVE = { x: 98 * TILE, y: 30 * TILE, r: 13 * TILE };
const CRASH = { x: 97 * TILE, y: 171 * TILE };
// Wake up beside the wreck, never inside it. The landing is made walkable
// after procedural generation, for every seed and for older saves.
const WAKE = { x: CRASH.x - 72, y: CRASH.y - 104 };
const RIAN_START = { x: WAKE.x + 50, y: WAKE.y - 24 };
const ESCORT_ROUTE = [
  { x: CRASH.x - 32, y: CRASH.y - 190, line: "Me segue! A clareira fica ao norte, depois do vilarejo." },
  { x: VILLAGE.x + 60, y: VILLAGE.y + 120, line: "Este é Porto Cinza. Gente boa — fale com eles quando puder." },
  { x: VILLAGE.x + 190, y: VILLAGE.y - 40, line: "Vê a trilha de terra? Ela leva direto à nossa clareira." },
  { x: BASE.x - 120, y: BASE.y + 120, line: "Quase lá. Cuidado com os goblins, eles andam em bando." },
  { x: BASE.x - 30, y: BASE.y + 40, line: "Chegamos! Esta clareira é nossa base. Abra o baú — deixei um kit pra você." },
];

const MORNING_LEN = 480;
const AFTERNOON_LEN = 170;
const DAY_LEN = MORNING_LEN + AFTERNOON_LEN;
const DUSK_LEN = 55, NIGHT_LEN = 420, DAWN_LEN = 90;
const CYCLE = DAY_LEN + DUSK_LEN + NIGHT_LEN + DAWN_LEN;
const NIGHT_DARK = 0.94;
// 31 double-wall purchases (62 posts) + one gate close the entire ring.
const FENCE_SLOTS = 63;
const FENCE_RADIUS = BASE.r * 0.73;

interface DiffCfg { resMult: number; mHp: number; mDmg: number; spawn: number; permadeath: boolean; lossOnDeath: number; }
const DIFF: Record<Difficulty, DiffCfg> = {
  "dificil": { resMult: 1, mHp: 1.35, mDmg: 1.3, spawn: 1.2, permadeath: false, lossOnDeath: 0.35 },
  "muito-dificil": { resMult: 2, mHp: 1.9, mDmg: 1.85, spawn: 1.6, permadeath: false, lossOnDeath: 0.6 },
  "impossivel": { resMult: 3.5, mHp: 2.7, mDmg: 2.6, spawn: 2.2, permadeath: true, lossOnDeath: 1 },
};
export const DIFF_LABEL: Record<Difficulty, string> = {
  "dificil": "Difícil", "muito-dificil": "Muito Difícil", "impossivel": "Impossível",
};

/* ---------------- entity types ---------------- */
type NodeType = "tree" | "pine" | "rock" | "ore" | "crystal" | "bush" | "berry";
interface RNode { type: NodeType; x: number; y: number; hp: number; maxHp: number; respawn: number; wob: number; skin?: string; }
interface Drop { res: ResKey; x: number; y: number; vx: number; vy: number; n: number; t: number; }
type MonType = "imp" | "crawler" | "stalker" | "brute" | "hulk" | "spitter" | "bat" | "slime" | "demon" | "lizard";
interface Monster {
  type: MonType; x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; dmg: number; speed: number; r: number;
  state: "idle" | "chase" | "windup" | "attack" | "hurt";
  t: number; atkCd: number; flash: number; home: { x: number; y: number };
  dir: number;
  siege: boolean;
  skin: string;
  defeated?: boolean;
}
interface Projectile { x: number; y: number; vx: number; vy: number; t: number; dmg: number; }
type StructType = "campfire" | "wall" | "gate" | "workbench" | "house" | "farm" | "sawmill" | "quarry" | "forge" | "tower" | "raft";
interface Structure { type: StructType; x: number; y: number; prodT: number; hp: number; maxHp: number; open: boolean; rotation: number; fenceStyle: FenceStyle; }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; c: string; s: number; grav: number; }
interface Floater { x: number; y: number; t: number; text: string; c: string; }
interface Ally { id: string; name: string; color: string; x: number; y: number; vx: number; vy: number; atkCd: number; downT: number; dir: number; }
interface RemotePlayer { id: string; name: string; x: number; y: number; hp: number; tx: number; ty: number; }
interface Villager { x: number; y: number; vx: number; vy: number; t: number; c: string; look: string; line: string; }
type AnimalKind = "rabbit" | "goose" | "goat";
interface Animal { kind: AnimalKind; x: number; y: number; vx: number; vy: number; t: number; hp: number; dir: number; flee: number; }
interface Chest { x: number; y: number; opened: boolean; loot: Partial<Record<ResKey, number>>; label: string; }
interface WorldProp { sprite: string; x: number; y: number; }
interface Bubble { who: string; text: string; t: number; dur: number; }
interface Escort { active: boolean; wp: { x: number; y: number; line: string }[]; i: number; waitT: number; }

interface QuestDef { id: string; name: string; desc: string; target: number; reward: string; }
const QUESTS: QuestDef[] = [
  { id: "q1", name: "Primeiros Passos", desc: "Colete madeira e pedra (total)", target: 60, reward: "Desbloqueia a Bancada" },
  { id: "q2", name: "Caçador", desc: "Derrote monstros", target: 20, reward: "Maya, a Caçadora, se junta" },
  { id: "q3", name: "Construtor", desc: "Construa estruturas", target: 7, reward: "Tito, o Construtor (-20% custos)" },
  { id: "q4", name: "Ferreiro", desc: "Colete ferro", target: 40, reward: "Bren, o Ferreiro (melhorias nv.4+)" },
  { id: "q5", name: "Explorador", desc: "Visite vilarejo, caverna e floresta sombria", target: 3, reward: "+40 de vida máxima" },
  { id: "q6", name: "Rei da Ilha", desc: "Alcance base nível 12", target: 12, reward: "Coroa do Reino (+5000 pts)" },
  { id: "q7", name: "A Fuga", desc: "Construa a balsa e escape da ilha", target: 1, reward: "Liberdade" },
];

const STRUCT_DEF: Record<StructType, { name: string; icon: string; desc: string; cost: Partial<Record<ResKey, number>>; lvl: number }> = {
  campfire: { name: "Fogueira", icon: "🔥", desc: "Luz, cura lenta e salva o jogo ao interagir", cost: { wood: 20, stone: 10 }, lvl: 1 },
  wall: { name: "Cerca dupla", icon: "🧱", desc: "2 trechos conectados no círculo da base. Repare com E", cost: { wood: 12, stone: 4 }, lvl: 1 },
  gate: { name: "Portão", icon: "🚪", desc: "Porta da cerca: você passa, eles quebram. E abre/fecha", cost: { wood: 30, stone: 10 }, lvl: 1 },
  workbench: { name: "Bancada", icon: "🛠️", desc: "Desbloqueia construções avançadas", cost: { wood: 45, stone: 25, fiber: 10 }, lvl: 2 },
  farm: { name: "Fazenda", icon: "🌱", desc: "Produz comida durante o dia", cost: { wood: 35, fiber: 20 }, lvl: 1 },
  sawmill: { name: "Serraria", icon: "🪚", desc: "Produz madeira lentamente", cost: { wood: 65, stone: 30 }, lvl: 2 },
  quarry: { name: "Pedreira", icon: "⚒️", desc: "Produz pedra lentamente", cost: { wood: 50, stone: 65 }, lvl: 2 },
  house: { name: "Casa", icon: "🏠", desc: "+12 vida máxima (até 5 casas)", cost: { wood: 85, stone: 45, fiber: 20 }, lvl: 2 },
  forge: { name: "Forja", icon: "🔨", desc: "Permite melhorar ferramentas e armas", cost: { wood: 35, stone: 70, iron: 12 }, lvl: 3 },
  tower: { name: "Torre de Vigia", icon: "🗼", desc: "Revela monstros no minimapa", cost: { wood: 75, stone: 55, iron: 10 }, lvl: 2 },
  raft: { name: "Balsa de Fuga", icon: "⛵", desc: "Sua passagem para fora da ilha (construa na praia)", cost: { wood: 600, stone: 280, fiber: 260, iron: 160, crystal: 60 }, lvl: 4 },
};
const BUILD_ORDER: StructType[] = ["campfire", "wall", "gate", "farm", "workbench", "house", "sawmill", "quarry", "tower", "forge", "raft"];
const FENCE_DEF: Record<FenceStyle, { name: string; desc: string; hp: number; cost: Partial<Record<ResKey, number>>; lockLevel: number }> = {
  rustic: { name: "Cerca rústica", desc: "Tábuas claras com travessas. Barata e rápida de reparar.", hp: 245, cost: { wood: 9, fiber: 2 }, lockLevel: 0 },
  palisade: { name: "Paliçada reforçada", desc: "Estacas afiadas, ferragens, cordas e escoras.", hp: 390, cost: { wood: 13, stone: 3, iron: 1 }, lockLevel: 0 },
  stone: { name: "Muralha de pedra", desc: "Blocos cinza com pilares. Resiste melhor aos colossos.", hp: 640, cost: { stone: 18, iron: 2 }, lockLevel: 3 },
  hedge: { name: "Cerca viva", desc: "Treliça coberta por folhas; recupera vida lentamente durante o dia.", hp: 310, cost: { wood: 8, fiber: 12, food: 2 }, lockLevel: 2 },
};

/* ---------------- audio ---------------- */
class Sfx {
  ctx: AudioContext | null = null;
  vol = 0.35;
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* noop */ }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (!this.ctx) return;
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
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol * this.vol;
    s.connect(g); g.connect(this.ctx.destination); s.start(t);
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
}

/* ---------------- helpers ---------------- */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
};

interface SaveData {
  v: number; seed: number;
  px: number; py: number; hp: number; maxHp: number;
  inv: Record<ResKey, number>; tools: Record<ToolKey, number>;
  time: number; day: number; score: number; kills: number; deaths: number;
  structures: { type: StructType; x: number; y: number; hp?: number; open?: boolean; rotation?: number; fenceStyle?: FenceStyle }[];
  questP: number[]; questDone: boolean[];
  allies: string[]; visited: string[];
  nodeHp: [number, number, number][];
  chests?: boolean[];
  escortDone?: boolean;
  escortIndex?: number;
  discoveredSites?: string[];
  claimedSites?: string[];
  seenCreatures?: string[];
  creatureKills?: Record<string, number>;
  equipment?: Partial<Record<EquipmentKey, boolean>>;
  fenceStyle?: FenceStyle;
}

/* =========================================================
   ENGINE
   ========================================================= */
export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  opts: EngineOptions;
  diff: DiffCfg;
  sfx = new Sfx();
  running = false;
  destroyed = false;
  state: GameState = "cutscene";
  softPause = false;
  activePanel: GamePanel = "none";

  // world
  tiles = new Uint8Array(W * H);
  nodes: RNode[] = [];
  nodeBuckets = new Map<number, RNode[]>();
  depletedNodes = new Set<RNode>();
  monsters: Monster[] = [];
  drops: Drop[] = [];
  projectiles: Projectile[] = [];
  structures: Structure[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  allies: Ally[] = [];
  villagers: Villager[] = [];
  remotes: RemotePlayer[] = [];
  animals: Animal[] = [];
  chests: Chest[] = [];
  bubbles: Bubble[] = [];
  escort: Escort = { active: false, wp: [], i: 0, waitT: 0 };
  terrain: Terrain | null = null;
  placing: StructType | null = null;
  placeX = 0; placeY = 0; placeReason = "";
  placeRotation = 0;
  fenceSlot = 0;
  fenceStyle: FenceStyle = "palisade";
  lastTutId = "";
  animalT = 0;
  worldProps: WorldProp[] = [];
  seenCreatures = new Set<string>();
  creatureKills: Record<string, number> = {};
  discoveredSites = new Set<string>();
  claimedSites = new Set<string>();
  equipment: Record<EquipmentKey, boolean> = { harness: true, coat: false, charm: false };
  explorationT = 0;

  // player
  px = WAKE.x; py = WAKE.y; pvx = 0; pvy = 0; pdir = -Math.PI / 2;
  hp = 100; maxHp = 100; stamina = 100;
  inv: Record<ResKey, number> = { wood: 0, stone: 0, fiber: 0, food: 0, iron: 0, crystal: 0 };
  tools: Record<ToolKey, number> = { axe: 1, pick: 1, sword: 1 };
  attackT = 0; attackCd = 0; rollT = 0; rollCd = 0; invulnT = 0; hurtFlash = 0;
  walkCycle = 0; moving = false; running_ = false;
  heldTool: ToolKey = "axe";
  swingTool: ToolKey = "axe";
  mapOpen = false;
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  music: MusicManager | null = null;
  fps = 60; fpsFrames = 0; fpsAcc = 0;
  particleCap = 420;
  survivedNight = false;
  mouseX = 0; mouseY = 0; mouseValid = false;
  aimTarget: number | null = null;
  baseHpIcon = 0;

  // progress
  time = DAY_LEN - 30; // starts at dusk (cutscene says anoitecendo)
  day = 1; score = 0; kills = 0; deaths = 0;
  questP: number[] = QUESTS.map(() => 0);
  questDone: boolean[] = QUESTS.map(() => false);
  visited = new Set<string>();
  gatheredWoodStone = 0;
  outcome: "morte" | "vitoria" | null = null;
  teamScore = 0;

  // camera/fx
  camX = 0; camY = 0; shake = 0; hitstop = 0; flashWhite = 0;
  viewW = 1280; viewH = 720; dpr = 1;

  // input
  keys = new Set<string>();
  touchMove = { x: 0, y: 0 };
  touchBtn = { attack: false, roll: false, interact: false, eat: false, run: false };
  padConnected = false;
  lastPadButtons: boolean[] = [];

  // cutscene
  cutT = 0; cutPhase = 0; dialogueIdx = -1;
  dialogue: { who: string; text: string }[] = [
    { who: "???", text: "Ei! Acorda! Você está vivo?!" },
    { who: "Rian", text: "Vi o avião cair no mar... Nadei até aqui achando que não sobrava ninguém." },
    { who: "Rian", text: "Meu nome é Rian. Estou preso nesta ilha há meses. À noite... ELES saem das sombras." },
    { who: "Você", text: "Eles...? O que é esse barulho na floresta?" },
    { who: "Rian", text: "Monstros. A ilha é deles depois do pôr do sol. Venha, tenho uma clareira segura na floresta." },
    { who: "Rian", text: "Juntos podemos construir uma base, coletar madeira, pedra e ferro... e um dia, escapar daqui." },
    { who: "Rian", text: "Pegue estas ferramentas. Corte árvores com o machado, quebre rochas com a picareta. E corra quando escurecer!" },
  ];

  // timers
  lastT = 0; acc = 0; snapT = 0; saveT = 0; mpT = 0; rafId = 0;
  prodToastT = 0;

  // minimap
  mini: HTMLCanvasElement | null = null;

  // light canvas
  lightCv: HTMLCanvasElement | null = null;
  lightStamp: HTMLCanvasElement | null = null;
  hudCv: HTMLCanvasElement | null = null;
  hudAt = -1000;
  hudHp = -1;

  interactHint = "";
  nearForge = false; nearBench = false;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.canvas = opts.canvas;
    const ctx = opts.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d ctx");
    this.ctx = ctx;
    this.diff = DIFF[opts.difficulty];
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) };
    this.music = opts.music ?? null;
    if (this.music) {
      this.music.setEnabled(this.settings.music);
      this.music.setVolume(this.settings.musicVol);
      this.music.setVoice(this.settings.voice);
    }
    this.applyQuality();
    this.genWorld(opts.seed);
    this.spawnVillagers();
    // Rian starts on the same dry beach, a few steps ahead of the player.
    this.allies.push({ id: "rian", name: "Rian", color: "#e8a33d", x: RIAN_START.x, y: RIAN_START.y, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: -Math.PI / 2 });
    this.spawnAnimals(90);
    this.placeChests();

    let loaded = false;
    if (opts.continueSave) loaded = this.loadSave();
    if (loaded) {
      this.state = "playing";
      this.emitState();
    } else {
      this.state = "cutscene";
      this.cutT = 0; this.cutPhase = 0;
      this.escort = { active: true, i: 0, waitT: 0, wp: ESCORT_ROUTE.map((point) => ({ ...point })) };
    }
    this.bindInput();
    this.resize();
    this.centerCamera();
  }

  /* ---------------- world gen ---------------- */
  genWorld(seed: number) {
    const rng = mulberry32(seed);
    const cx = W / 2, cy = H / 2;
    // island ellipse + noise edge
    const bump: number[] = [];
    for (let i = 0; i < 64; i++) bump.push(0.82 + rng() * 0.3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / (W * 0.46), dy = (y - cy) / (H * 0.46);
        const ang = Math.atan2(dy, dx);
        const bi = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 64) % 64;
        const d = Math.sqrt(dx * dx + dy * dy) / bump[bi];
        let t: number = T_GRASS;
        if (d > 1) t = T_WATER;
        else if (d > 0.93) t = T_SAND;
        this.tiles[y * W + x] = t;
      }
    }
    // rocky north (cave biome)
    for (let y = 6; y < 52; y++) for (let x = 40; x < 150; x++) {
      const i = y * W + x;
      if (this.tiles[i] === T_GRASS) {
        const d = Math.hypot(x - 95, y - 28);
        if (d < 34 + rng() * 4) this.tiles[i] = T_ROCK;
      }
    }
    // cave mouth (dark floor)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x * TILE - CAVE.x, y * TILE - CAVE.y);
      if (d < CAVE.r * 0.72 && this.tiles[y * W + x] !== T_WATER) this.tiles[y * W + x] = T_CAVE;
    }
    // dark forest east
    for (let y = 40; y < 160; y++) for (let x = 138; x < W; x++) {
      const i = y * W + x;
      if (this.tiles[i] === T_GRASS && rng() > 0.04) this.tiles[i] = T_DARK;
    }
    // village & base clearings paths
    const carvePath = (x1: number, y1: number, x2: number, y2: number) => {
      let x = x1, y = y1;
      let steps = 0;
      while ((Math.abs(x - x2) > 1 || Math.abs(y - y2) > 1) && steps++ < 900) {
        const i = Math.round(y) * W + Math.round(x);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const j = i + oy * W + ox;
          if (j >= 0 && j < W * H && this.tiles[j] !== T_WATER) this.tiles[j] = T_PATH;
        }
        const ang = Math.atan2(y2 - y, x2 - x) + (rng() - 0.5) * 0.9;
        x += Math.cos(ang) * 1.4; y += Math.sin(ang) * 1.4;
      }
    };
    carvePath(CRASH.x / TILE, CRASH.y / TILE - 3, VILLAGE.x / TILE, VILLAGE.y / TILE);
    carvePath(VILLAGE.x / TILE, VILLAGE.y / TILE, BASE.x / TILE, BASE.y / TILE);
    carvePath(BASE.x / TILE, BASE.y / TILE, CAVE.x / TILE, CAVE.y / TILE + 8);
    carvePath(BASE.x / TILE, BASE.y / TILE, 142, 95);

    // rivers (carved after paths; where a path crosses, a bridge appears)
    const carveRiver = (pts: [number, number][], width: number) => {
      for (let k = 0; k < pts.length - 1; k++) {
        let x = pts[k][0], y = pts[k][1];
        const [x2, y2] = pts[k + 1];
        let steps = 0;
        while ((Math.abs(x - x2) > 1 || Math.abs(y - y2) > 1) && steps++ < 1200) {
          const ang = Math.atan2(y2 - y, x2 - x) + (rng() - 0.5) * 0.7;
          x += Math.cos(ang) * 1.2; y += Math.sin(ang) * 1.2;
          const wv = width + (rng() < 0.15 ? 1 : 0);
          for (let oy = -wv; oy <= wv; oy++) for (let ox = -wv; ox <= wv; ox++) {
            if (ox * ox + oy * oy > wv * wv + 0.5) continue;
            const tx = Math.round(x) + ox, ty = Math.round(y) + oy;
            if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
            const px = tx * TILE, py = ty * TILE;
            if (dist2(px, py, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r * 0.7) continue;
            if (dist2(px, py, BASE.x, BASE.y) < BASE.r * BASE.r * 0.75) continue;
            const i = ty * W + tx;
            // Repeated river passes must not erase a bridge already laid down.
            this.tiles[i] = this.tiles[i] === T_PATH || this.tiles[i] === T_BRIDGE ? T_BRIDGE : T_WATER;
          }
        }
      }
    };
    carveRiver([[78, 44], [66, 66], [48, 82], [26, 90], [8, 94]], 1);
    carveRiver([[116, 44], [126, 70], [134, 98], [146, 126], [166, 150], [182, 160]], 1);
    // bridges must be contiguous: widen them to the river width where paths crossed
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (this.tiles[y * W + x] !== T_BRIDGE) continue;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const j = (y + oy) * W + (x + ox);
        if (this.tiles[j] === T_WATER) {
          // only fill water pixels that are between bridge tiles (keep river look)
          const a = this.tiles[j - 1] === T_BRIDGE || this.tiles[j + 1] === T_BRIDGE;
          const b = this.tiles[j - W] === T_BRIDGE || this.tiles[j + W] === T_BRIDGE;
          if (a && b) this.tiles[j] = T_BRIDGE;
        }
      }
    }

    // resource nodes
    const addNode = (type: NodeType, x: number, y: number, hp: number) => {
      this.nodes.push({ type, x, y, hp, maxHp: hp, respawn: 0, wob: rng() * Math.PI * 2 });
    };
    for (let i = 0; i < 5200; i++) {
      const x = rng() * WPX, y = rng() * HPX;
      const t = this.tileAt(x, y);
      const inVillage = dist2(x, y, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r * 0.55;
      const inBase = dist2(x, y, BASE.x, BASE.y) < BASE.r * BASE.r * 0.42;
      if (inVillage || inBase) continue;
      if (t === T_GRASS) {
        const r = rng();
        if (r < 0.52) addNode(rng() < 0.75 ? "tree" : "pine", x, y, 24);
        else if (r < 0.62) addNode("rock", x, y, 30);
        else if (r < 0.78) addNode("bush", x, y, 10);
        else if (r < 0.86) addNode("berry", x, y, 8);
      } else if (t === T_DARK) {
        const r = rng();
        if (r < 0.6) addNode("pine", x, y, 30);
        else if (r < 0.7) addNode("rock", x, y, 34);
        else if (r < 0.76) addNode("ore", x, y, 44);
      } else if (t === T_ROCK) {
        const r = rng();
        if (r < 0.4) addNode("rock", x, y, 30);
        else if (r < 0.62) addNode("ore", x, y, 44);
      } else if (t === T_CAVE) {
        const r = rng();
        if (r < 0.3) addNode("ore", x, y, 44);
        else if (r < 0.52) addNode("crystal", x, y, 56);
        else if (r < 0.62) addNode("rock", x, y, 32);
      } else if (t === T_SAND && rng() < 0.06) {
        addNode("rock", x, y, 26);
      }
    }
    // few starter trees near crash
    addNode("tree", CRASH.x - 120, CRASH.y - 90, 24);
    addNode("tree", CRASH.x + 130, CRASH.y - 110, 24);
    addNode("rock", CRASH.x + 60, CRASH.y - 140, 30);

    // Repair the landing after resource generation. This does not consume RNG
    // or change node ordering, so existing saves keep their resource progress.
    this.prepareLandingAndRoute();
    this.expandWorld();
    this.rebuildNodeBuckets();
    this.buildMinimap();
    this.terrain = new Terrain(this.tiles, W, H, TILE);
  }

  private prepareLandingAndRoute() {
    const cx = CRASH.x / TILE, cy = CRASH.y / TILE;
    // A generous sandy beach around the wreck and both starting positions.
    for (let y = Math.floor(cy - 9); y <= Math.ceil(cy + 9); y++) {
      for (let x = Math.floor(cx - 12); x <= Math.ceil(cx + 12); x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const d = ((x - cx) / 12) ** 2 + ((y - cy) / 9) ** 2;
        if (d > 1) continue;
        const i = y * W + x;
        if (this.tiles[i] === T_WATER || d < 0.48) this.tiles[i] = T_SAND;
      }
    }

    // The guide walks these exact segments. A wide, continuous dry trail (and
    // bridges where it crosses rivers) guarantees a route to village and base.
    const points = [WAKE, RIAN_START, ...ESCORT_ROUTE];
    for (let p = 0; p < points.length - 1; p++) {
      const from = points[p], to = points[p + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (TILE / 3)));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const tx = Math.floor((from.x + (to.x - from.x) * t) / TILE);
        const ty = Math.floor((from.y + (to.y - from.y) * t) / TILE);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 4) continue;
          const x = tx + dx, y = ty + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const i = y * W + x;
          const byBeach = ((x - cx) / 12) ** 2 + ((y - cy) / 9) ** 2 < 0.75;
          if (byBeach) {
            if (this.tiles[i] === T_WATER) this.tiles[i] = T_SAND;
          } else if (this.tiles[i] === T_WATER || this.tiles[i] === T_BRIDGE) {
            this.tiles[i] = T_BRIDGE;
          } else {
            this.tiles[i] = T_PATH;
          }
        }
      }
    }

    // Preserve node indices for old saves, but keep the starting area clear.
    const nearbySpots = [
      { x: CRASH.x - 168, y: CRASH.y - 145 },
      { x: CRASH.x + 148, y: CRASH.y - 150 },
      { x: CRASH.x - 184, y: CRASH.y - 35 },
      { x: CRASH.x + 160, y: CRASH.y - 45 },
    ];
    this.nodes.forEach((node, index) => {
      if (dist2(node.x, node.y, WAKE.x, WAKE.y) < 68 * 68 ||
          dist2(node.x, node.y, RIAN_START.x, RIAN_START.y) < 56 * 56) {
        const spot = nearbySpots[index % nearbySpots.length];
        node.x = spot.x + (index % 3 - 1) * 12;
        node.y = spot.y + (index % 5 - 2) * 7;
      }
    });
  }

  private expandWorld() {
    this.worldProps = [];
    // Snow is a permanent northern biome; no global season work per frame.
    for (let y = 12; y < 72; y++) for (let x = 110; x < 168; x++) {
      const d = Math.hypot(x * TILE - GLACIER.x, y * TILE - GLACIER.y);
      if (d > GLACIER.radius + Math.sin(x * 0.43 + y * 0.17) * 42) continue;
      const i = y * W + x;
      if (this.tiles[i] === T_WATER) continue;
      this.tiles[i] = this.tiles[i] === T_PATH ? T_SNOW_PATH : T_SNOW;
      const lake = Math.hypot(x - 143, (y - 37) * 1.15);
      if (lake < 5.5) this.tiles[i] = T_ICE;
    }
    for (const site of SITES) {
      // A walkable platform with an approach from the south.
      const tx = Math.floor(site.x / TILE), ty = Math.floor(site.y / TILE);
      const snowy = Math.hypot(site.x - GLACIER.x, site.y - GLACIER.y) < GLACIER.radius;
      const necro = site.id === "necropolis";
      const siteRadius = necro ? 8 : 5;
      for (let dy = -siteRadius; dy <= siteRadius; dy++) for (let dx = -siteRadius; dx <= siteRadius; dx++) {
        if (dx * dx + dy * dy > siteRadius * siteRadius + 1) continue;
        this.tiles[(ty + dy) * W + tx + dx] = necro ? T_NECRO : snowy ? T_SNOW : T_RUIN;
      }
      const steps = Math.ceil(Math.hypot(site.x - BASE.x, site.y + 100 - BASE.y) / 14);
      for (let i = 0; i <= steps; i++) {
        const x = Math.floor((BASE.x + (site.x - BASE.x) * i / steps) / TILE);
        const y = Math.floor((BASE.y + (site.y + 100 - BASE.y) * i / steps) / TILE);
        for (let d = -1; d <= 1; d++) {
          const j = y * W + x + d;
          if (this.tiles[j] === T_SNOW || this.tiles[j] === T_ICE) this.tiles[j] = T_SNOW_PATH;
          else if (this.tiles[j] === T_WATER || this.tiles[j] === T_BRIDGE) this.tiles[j] = T_BRIDGE;
          else if (this.tiles[j] !== T_RUIN && this.tiles[j] !== T_NECRO) this.tiles[j] = T_PATH;
        }
      }
      this.worldProps.push({ sprite: site.sprite, x: site.x, y: site.y + 16 });
      if (site.id === "necropolis") {
        this.worldProps.push(
          { sprite: "necro_tower", x: site.x - 175, y: site.y - 80 },
          { sprite: "necro_shrine", x: site.x + 170, y: site.y - 55 },
          { sprite: "necro_shrine", x: site.x - 205, y: site.y + 125 },
          { sprite: "necro_tree", x: site.x + 210, y: site.y + 125 },
          { sprite: "necro_tree", x: site.x + 65, y: site.y - 180 },
          { sprite: "toxic_pool", x: site.x - 65, y: site.y + 155 },
          { sprite: "toxic_pool", x: site.x + 135, y: site.y + 175 },
        );
        for (let grave = 0; grave < 13; grave++) {
          const a = grave / 13 * Math.PI * 2 + 0.3, r = 145 + (grave % 3) * 28;
          this.worldProps.push({ sprite: "necro_grave", x: site.x + Math.cos(a) * r, y: site.y + Math.sin(a) * r * 0.68 });
        }
      }
    }
    this.worldProps.push(
      { sprite: "ice_deity", x: GLACIER.x + 80, y: GLACIER.y - 200 },
      { sprite: "winter_totem", x: GLACIER.x - 130, y: GLACIER.y - 45 },
      { sprite: "winter_totem", x: GLACIER.x + 210, y: GLACIER.y + 90 },
      { sprite: "snowman", x: GLACIER.x + 40, y: GLACIER.y + 160 },
      { sprite: "snowman", x: GLACIER.x - 170, y: GLACIER.y + 210 },
    );
    this.nodes.forEach((n, index) => {
      // Deterministic art variation without consuming the generation RNG:
      // old resource indices and saves are preserved.
      const nearSite = SITES.find((site) => dist2(n.x, n.y, site.x, site.y) < 105 * 105);
      if (nearSite) {
        const a = index * 2.39996;
        n.x = nearSite.x + Math.cos(a) * 170;
        n.y = nearSite.y + Math.sin(a) * 170;
      }
      const t = this.tileAt(n.x, n.y);
      if ((t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) && (n.type === "rock" || n.type === "ore" || n.type === "bush" || n.type === "berry")) {
        n.skin = n.type === "rock" ? "frost_rock" : n.type === "ore" ? "frost_ore" : "snow_bush";
      }
      if (n.type === "tree" || n.type === "pine") {
        if (t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) n.skin = index % 5 === 0 ? "tree_bare_snow" : "tree_snow";
        else if (t === T_DARK) n.skin = index % 6 === 0 ? "tree_dead" : index % 3 === 0 ? "tree_moss" : "pine_dark";
        else if (dist2(n.x,n.y,114*TILE,122*TILE) < 700*700) n.skin = "tree_cherry";
        else if (dist2(n.x,n.y,54*TILE,101*TILE) < 680*680) n.skin = "tree_autumn";
        else if (n.y > 156*TILE || t === T_SAND) n.skin = "tree_palm";
        else if (index % 11 === 0) n.skin = "tree_fruit";
        else if (index % 9 === 0) n.skin = "tree_moss";
        else n.skin = n.type;
      }
    });
    // Extra harvestable mineral deposits around the glacier.
    for (let i = 0; i < 24; i++) {
      const a = i * 2.39996, r = 230 + (i % 5) * 55;
      const x = GLACIER.x + Math.cos(a) * r, y = GLACIER.y + Math.sin(a) * r;
      if (this.tileAt(x,y) === T_WATER) continue;
      this.nodes.push({ type: i % 3 === 0 ? "crystal" : "ore", x, y, hp: 44, maxHp: 44, respawn: 0, wob: 0 });
    }
  }

  private rebuildNodeBuckets() {
    this.nodeBuckets.clear();
    for (const n of this.nodes) {
      const key = Math.floor(n.x / 128) + Math.floor(n.y / 128) * 64;
      let bucket = this.nodeBuckets.get(key);
      if (!bucket) { bucket = []; this.nodeBuckets.set(key, bucket); }
      bucket.push(n);
    }
  }
  private nearbyNodes(x: number, y: number): RNode[] {
    const bx = Math.floor(x / 128), by = Math.floor(y / 128);
    const found: RNode[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const bucket = this.nodeBuckets.get(bx + dx + (by + dy) * 64);
      if (bucket) found.push(...bucket);
    }
    return found;
  }

  spawnAnimals(n: number) {
    for (let i = 0; i < n * 6 && this.animals.length < n; i++) {
      const x = Math.random() * WPX, y = Math.random() * HPX;
      if (this.tileAt(x, y) !== T_GRASS) continue;
      if (dist2(x, y, BASE.x, BASE.y) < BASE.r * BASE.r) continue;
      const r = Math.random();
      const kind: AnimalKind = r < 0.5 ? "rabbit" : r < 0.8 ? "goose" : "goat";
      this.animals.push({ kind, x, y, vx: 0, vy: 0, t: Math.random() * 3, hp: kind === "goat" ? 26 : kind === "goose" ? 14 : 10, dir: 1, flee: 0 });
    }
  }

  placeChests() {
    this.chests = [
      { x: CRASH.x + 110, y: CRASH.y - 60, opened: false, loot: { wood: 10, fiber: 6, food: 4 }, label: "Bagagem do avião" },
      { x: BASE.x + 20, y: BASE.y - 40, opened: false, loot: { wood: 24, stone: 12, food: 3 }, label: "Kit do Rian" },
      { x: VILLAGE.x + 70, y: VILLAGE.y + 30, opened: false, loot: { stone: 10, fiber: 8, food: 6 }, label: "Baú do vilarejo" },
      { x: CAVE.x + 40, y: CAVE.y + CAVE.r * 0.6, opened: false, loot: { iron: 10, crystal: 2 }, label: "Baú da caverna" },
      { x: 150 * TILE, y: 102 * TILE, opened: false, loot: { iron: 6, food: 3, fiber: 10 }, label: "Baú sombrio" },
    ];
  }

  spawnVillagers() {
    const lines = [
      "Bem-vindo ao vilarejo, forasteiro. Poucos de nós restam...",
      "A caverna ao norte guarda ferro e cristais. E coisas piores.",
      "Nunca entre na floresta escura do leste sem uma boa espada.",
      "Dizem que com uma balsa reforçada dá para cruzar o mar...",
      "A fogueira salva seu progresso. Nunca durma sem uma!",
    ];
    const cols = ["#c98c5a", "#8ab0c9", "#b5c95a", "#c95a9b", "#9b5ac9"];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.villagers.push({
        x: VILLAGE.x + Math.cos(a) * VILLAGE.r * 0.4,
        y: VILLAGE.y + Math.sin(a) * VILLAGE.r * 0.4,
        vx: 0, vy: 0, t: Math.random() * 4, c: cols[i], look: `v${i}`, line: lines[i],
      });
    }
  }

  buildMinimap() {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    if (!c) return;
    const cols = ["#2f6c9c", "#e3d191", "#6f9a44", "#2f5230", "#b99a67", "#8d8678", "#3b3744", "#a87a48", "#d4e4e3", "#67b1cd", "#a29c86", "#bdac87", "#565e57"];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      c.fillStyle = cols[this.tiles[y * W + x]];
      c.fillRect(x, y, 1, 1);
    }
    this.mini = cv;
  }

  tileAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return T_WATER;
    return this.tiles[ty * W + tx];
  }

  /* ---------------- input ---------------- */
  onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    this.sfx.ensure();
    if (this.state === "cutscene") {
      if (k === " " || k === "e" || k === "enter") this.advanceDialogue();
      if (k === "escape") this.skipCutscene();
      e.preventDefault();
      return;
    }
    if (k === "escape") {
      if (this.activePanel !== "none") { this.closePanel(); e.preventDefault(); return; }
      if (this.placing) { this.cancelPlace(); e.preventDefault(); return; }
      if (this.mapOpen) { this.mapOpen = false; if (this.state === "playing") this.softPause = false; e.preventDefault(); return; }
      this.togglePause(); e.preventDefault(); return;
    }
    if (this.state !== "playing") return;
    if (k === "i") { this.openPanel("inventory"); e.preventDefault(); return; }
    if (k === "n") { this.openPanel("bestiary"); e.preventDefault(); return; }
    if (this.activePanel !== "none" || this.softPause) { this.keys.clear(); return; }
    if (this.placing) {
      if ((this.placing === "wall" || this.placing === "gate") && ["q", "arrowleft", "e", "arrowright"].includes(k)) {
        this.rotateFence(k === "q" || k === "arrowleft" ? -1 : 1); e.preventDefault(); return;
      }
      if (k === "r") { this.rotateStructure(1); e.preventDefault(); return; }
      if (k === "j" || k === "k" || k === "enter" || (k === "e" && this.placing !== "wall" && this.placing !== "gate")) { this.confirmPlace(); e.preventDefault(); return; }
      if (k === "b") { this.cancelPlace(); e.preventDefault(); return; }
    }
    if (k === "m" || k === "tab") { this.toggleMap(); e.preventDefault(); return; }
    if (k === "1") { this.setTool("axe"); return; }
    if (k === "2") { this.setTool("pick"); return; }
    if (k === "3") { this.setTool("sword"); return; }
    if (k === "b") { this.openPanel("build"); e.preventDefault(); }
    if (k === "f" || k === "q") this.eatFood();
    if (k === " ") { this.tryRoll(); e.preventDefault(); }
    if (k === "e") this.tryInteract();
    if (k === "j" || k === "k") this.tryAttack();
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  onBlur = () => { this.keys.clear(); };

  bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.onResize);
    this.canvas.addEventListener("pointerdown", this.onPointer);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("contextmenu", this.onCtx);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  onResize = () => this.resize();
  onPointer = (e: PointerEvent) => {
    this.sfx.ensure();
    if (this.state === "cutscene") { this.advanceDialogue(); return; }
    if (this.state !== "playing") return;
    if (this.placing && e.pointerType === "mouse") {
      if (e.button === 2) this.cancelPlace(); else this.confirmPlace();
      return;
    }
    if (this.settings.controls === "kb-mouse" && e.pointerType === "mouse") {
      const rect = this.canvas.getBoundingClientRect();
      const wx = e.clientX - rect.left + this.camX;
      const wy = e.clientY - rect.top + this.camY;
      this.pdir = Math.atan2(wy - this.py, wx - this.px);
      this.tryAttack();
    }
  };
  onCtx = (e: Event) => { e.preventDefault(); };
  onWheel = (e: WheelEvent) => {
    if (this.placing === "wall" || this.placing === "gate") {
      e.preventDefault();
      this.rotateFence(e.deltaY > 0 ? 1 : -1);
    }
  };
  onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.mouseValid = true;
    if (this.state === "playing" && this.settings.controls === "kb-mouse") {
      this.aimTarget = Math.atan2(this.mouseY + this.camY - this.py, this.mouseX + this.camX - this.px);
    }
  };

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(320, rect.width);
    this.viewH = Math.max(240, rect.height);
    // Pixel art stays crisp at 1x; do not spend 4x the fill-rate on Retina.
    const ceiling = this.settings.quality === "alta" ? 1.5 : this.settings.quality === "leve" ? 0.8 : 1;
    this.dpr = Math.max(0.65, Math.min(window.devicePixelRatio || 1, ceiling, Math.sqrt(2300000 / (this.viewW * this.viewH))));
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.hudCv = document.createElement("canvas");
    this.hudCv.width = Math.round(this.viewW); this.hudCv.height = Math.round(this.viewH);
    this.hudAt = -1000;
    this.lightCv = document.createElement("canvas");
    this.lightCv.width = Math.ceil(this.viewW / 3);
    this.lightCv.height = Math.ceil(this.viewH / 3);
    if (!this.lightStamp) {
      this.lightStamp = document.createElement("canvas");
      this.lightStamp.width = 160; this.lightStamp.height = 160;
      const mask = this.lightStamp.getContext("2d");
      if (mask) {
        const g = mask.createRadialGradient(80,80,0,80,80,80);
        g.addColorStop(0,"rgba(0,0,0,1)"); g.addColorStop(0.35,"rgba(0,0,0,0.91)"); g.addColorStop(1,"rgba(0,0,0,0)");
        mask.fillStyle = g; mask.fillRect(0,0,160,160);
      }
    }
  }

  private centerCamera() {
    this.camX = clamp(this.px - this.viewW / 2, 0, Math.max(0, WPX - this.viewW));
    this.camY = clamp(this.py - this.viewH / 2, 0, Math.max(0, HPX - this.viewH));
  }

  /** Move a stranded old save to nearby dry, unobstructed ground. */
  private ensurePlayablePosition(): boolean {
    const onWreck = Math.abs(this.px - CRASH.x) < 72 && Math.abs(this.py - CRASH.y) < 48;
    const invalid = !Number.isFinite(this.px) || !Number.isFinite(this.py) || this.tileAt(this.px, this.py) === T_WATER;
    if (!onWreck && !invalid) return false;

    const target = onWreck || !Number.isFinite(this.px) || !Number.isFinite(this.py)
      ? WAKE : { x: this.px, y: this.py };
    const isClear = (x: number, y: number) => {
      if (this.tileAt(x, y) === T_WATER) return false;
      if (Math.abs(x - CRASH.x) < 72 && Math.abs(y - CRASH.y) < 48) return false;
      if (this.nodes.some((n) => n.hp > 0 && n.type !== "bush" && n.type !== "berry" && dist2(n.x, n.y, x, y) < 26 * 26)) return false;
      if (this.structures.some((s) => (s.type === "wall" || s.type === "house" || s.type === "tower" || s.type === "forge") && dist2(s.x, s.y, x, y) < 28 * 28)) return false;
      return [[TILE, 0], [-TILE, 0], [0, TILE], [0, -TILE]].some(([dx, dy]) => this.tileAt(x + dx, y + dy) !== T_WATER);
    };
    if (isClear(target.x, target.y)) {
      this.px = target.x; this.py = target.y;
    } else {
      const tx = Math.floor(target.x / TILE), ty = Math.floor(target.y / TILE);
      let found = false;
      for (let r = 1; r < Math.max(W, H) && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
          if (x < TILE || y < TILE || x >= WPX - TILE || y >= HPX - TILE || !isClear(x, y)) continue;
          this.px = x; this.py = y; found = true; break;
        }
      }
      if (!found) { this.px = WAKE.x; this.py = WAKE.y; }
    }
    this.pvx = 0; this.pvy = 0;
    return true;
  }

  setTouchMove(x: number, y: number) { this.touchMove.x = x; this.touchMove.y = y; }
  touchAction(a: "attack" | "roll" | "interact" | "eat") {
    this.sfx.ensure();
    if (this.state === "cutscene") { this.advanceDialogue(); return; }
    if (this.state !== "playing") return;
    if (this.placing && a === "attack") { this.confirmPlace(); return; }
    if (a === "attack") this.tryAttack();
    if (a === "roll") this.tryRoll();
    if (a === "interact") this.tryInteract();
    if (a === "eat") this.eatFood();
  }
  setTouchRun(v: boolean) { this.touchBtn.run = v; }

  applySettings(next: GameSettings) {
    const resized = this.settings.quality !== next.quality;
    this.settings = { ...next };
    this.applyQuality();
    if (resized) this.resize();
    this.music?.setEnabled(next.music);
    this.music?.setVolume(next.musicVol);
    this.music?.setVoice(next.voice);
    this.sfx.vol = Math.max(0, Math.min(1, next.sfxVol)) * 0.5;
  }

  applyQuality() {
    const q = this.settings.quality;
    this.particleCap = q === "leve" ? 150 : q === "alta" ? 520 : this.fps < 45 ? 220 : 420;
  }

  pollGamepad() {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[0];
    if (!p) { this.padConnected = false; return { mx: 0, my: 0 }; }
    this.padConnected = true;
    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const mx = dead(p.axes[0] ?? 0), my = dead(p.axes[1] ?? 0);
    const btn = (i: number) => !!p.buttons[i]?.pressed;
    const was = (i: number) => !!this.lastPadButtons[i];
    const pressed = (i: number) => btn(i) && !was(i);
    if (this.state === "cutscene") {
      if (pressed(0) || pressed(2)) this.advanceDialogue();
      if (pressed(9)) this.skipCutscene();
    } else if (this.state === "playing") {
      if (pressed(0)) { if (this.placing) this.confirmPlace(); else this.tryAttack(); }
      if (pressed(1)) { if (this.placing) this.cancelPlace(); else this.tryRoll(); }
      if (pressed(2)) this.tryInteract();
      if (pressed(3)) this.openPanel("build");
      if (pressed(4)) { if (this.placing === "wall" || this.placing === "gate") this.rotateFence(-1); else this.cycleTool(-1); }
      if (pressed(5)) { if (this.placing === "wall" || this.placing === "gate") this.rotateFence(1); else this.cycleTool(1); }
      if (pressed(6) && this.placing) this.rotateStructure(1);
      if (pressed(8)) this.toggleMap();
      if (pressed(9)) this.togglePause();
      if (pressed(12)) this.eatFood();
    } else if (this.state === "paused" && pressed(9)) this.togglePause();
    this.lastPadButtons = p.buttons.map((b) => b.pressed);
    return { mx, my, run: btn(10) || (p.buttons[7]?.value ?? 0) > 0.4 };
  }

  /* ---------------- UI control from React ---------------- */
  openPanel(panel: Exclude<GamePanel, "none">) {
    if (this.state !== "playing") return;
    this.mapOpen = false;
    this.activePanel = panel;
    this.keys.clear();
    this.softPause = this.opts.mode === "single";
    this.opts.onUi({ type: "panel", panel });
    this.sfx.ui();
  }
  closePanel() { this.activePanel = "none"; this.keys.clear(); this.softPause = false; this.opts.onUi({ type: "panel", panel: "none" }); }
  setUiPause(v: boolean) {
    this.softPause = (v || this.activePanel !== "none" || this.mapOpen) && this.opts.mode === "single";
    if (v) this.keys.clear();
  }
  toggleMap() {
    if (this.state !== "playing") return;
    this.mapOpen = !this.mapOpen;
    this.softPause = this.mapOpen && this.opts.mode === "single";
    this.sfx.ui();
  }
  setTool(t: ToolKey) {
    this.heldTool = t;
    this.toast(`${TOOL_ICON[t]} ${TOOL_LABEL[t]} na mão`);
  }
  cycleTool(dir = 1) {
    const order: ToolKey[] = ["axe", "pick", "sword"];
    const i = order.indexOf(this.heldTool);
    this.setTool(order[(i + dir + order.length) % order.length]);
  }
  togglePause() {
    if (this.state === "playing") { this.state = "paused"; this.saveGame(); this.emitState(); }
    else if (this.state === "paused") { this.state = "playing"; this.emitState(); }
    this.sfx.ui();
  }

  emitState() { this.opts.onUi({ type: "state", state: this.state }); this.emitSnapshot(); }
  toast(text: string, who?: string) { this.opts.onUi({ type: "toast", text, who }); }

  /* ---------------- cutscene ---------------- */
  advanceDialogue() {
    if (this.state !== "cutscene") return;
    if (this.cutPhase < 3) return; // timed phases
    if (this.dialogueIdx < this.dialogue.length - 1) {
      this.dialogueIdx++;
      this.sfx.ui();
    } else {
      this.endCutscene();
    }
  }
  skipCutscene() { if (this.state === "cutscene") this.endCutscene(); }
  endCutscene() {
    this.state = "playing";
    this.time = MORNING_LEN - 200;
    this.ensurePlayablePosition();
    this.centerCamera();
    this.toast("Levanta! Me segue até a clareira — e não saia da trilha.", "rian");
    this.say("rian", "Levanta! Me segue até a clareira.", 5);
    this.sfx.quest();
    this.emitState();
  }

  /* ---------------- actions ---------------- */
  facingPoint(r: number) { return { x: this.px + Math.cos(this.pdir) * r, y: this.py + Math.sin(this.pdir) * r }; }

  tryAttack() {
    if (this.activePanel !== "none" || this.softPause || this.state !== "playing") return;
    if (this.attackCd > 0 || this.rollT > 0) return;
    this.attackCd = 0.38;
    this.attackT = 0.22;
    this.swingTool = this.heldTool;
    this.stamina = Math.max(0, this.stamina - 4);
    this.sfx.swing();
    const reach = 58;
    const fp = this.facingPoint(34);
    let hitSomething = false;

    // monsters
    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      if (dist2(m.x, m.y, fp.x, fp.y) < (reach + m.r) * (reach + m.r) * 0.6) {
        const dmg = 6 + this.tools.sword * 5 + Math.floor(Math.random() * 4);
        m.hp -= dmg; m.flash = 0.12; m.state = "hurt"; m.t = 0.18;
        const kb = 240;
        const a = Math.atan2(m.y - this.py, m.x - this.px);
        m.vx += Math.cos(a) * kb; m.vy += Math.sin(a) * kb;
        this.spawnParticles(m.x, m.y, "#b13ae0", 10, 180);
        this.floaters.push({ x: m.x, y: m.y - 20, t: 0, text: `${dmg}`, c: "#ffd34d" });
        this.shake = Math.min(10, this.shake + 5);
        this.hitstop = 0.045;
        this.sfx.hit();
        hitSomething = true;
        if (m.hp <= 0) this.killMonster(m);
      }
    }
    if (hitSomething) return;

    // animals (hunting)
    for (const a of this.animals) {
      if (dist2(a.x, a.y, fp.x, fp.y) < 40 * 40) {
        this.hitAnimal(a, 6 + this.tools.sword * 4);
        this.swingTool = "sword";
        return;
      }
    }

    // nodes: only adjacent sectors, not every tree on the island
    let best: RNode | null = null; let bd = reach * reach;
    for (const n of this.nearbyNodes(fp.x, fp.y)) {
      if (n.hp <= 0) continue;
      const d = dist2(n.x, n.y, fp.x, fp.y);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) {
      if (best.type === "tree" || best.type === "pine" || best.type === "bush" || best.type === "berry") this.swingTool = "axe";
      else this.swingTool = "pick";
      this.harvest(best);
    }
  }

  harvest(n: RNode) {
    let tool: ToolKey = "axe"; let ok = true; let needMsg = "";
    if (n.type === "tree" || n.type === "pine") tool = "axe";
    else if (n.type === "rock" || n.type === "ore" || n.type === "crystal") tool = "pick";
    else tool = "axe";
    if (n.type === "ore" && this.tools.pick < 2) { ok = false; needMsg = "Precisa de Picareta nível 2+"; }
    if (n.type === "crystal" && this.tools.pick < 3) { ok = false; needMsg = "Precisa de Picareta nível 3+"; }
    if (!ok) { this.floaters.push({ x: n.x, y: n.y - 26, t: 0, text: needMsg, c: "#ff8080" }); this.sfx.ui(); return; }

    const power = 5 + this.tools[tool] * 4;
    n.hp -= power;
    n.wob = 0.001 + Math.random() * 0.1;
    const colors: Record<NodeType, string> = {
      tree: "#8a5a2b", pine: "#6b4a22", rock: "#9a9a9a", ore: "#c9a26a", crystal: "#7de0e8", bush: "#71b840", berry: "#d04560",
    };
    this.spawnParticles(n.x, n.y - 10, colors[n.type], 8, 150);
    this.shake = Math.min(6, this.shake + 2.5);
    if (tool === "axe") this.sfx.chop(); else this.sfx.mine();

    if (n.hp <= 0) {
      n.respawn = 70 + Math.random() * 90;
      this.depletedNodes.add(n);
      const yield_: Record<NodeType, { res: ResKey; n: number }> = {
        tree: { res: "wood", n: 6 }, pine: { res: "wood", n: 7 },
        rock: { res: "stone", n: 6 }, ore: { res: "iron", n: 4 },
        crystal: { res: "crystal", n: 2 }, bush: { res: "fiber", n: 4 }, berry: { res: "food", n: 3 },
      };
      if (n.skin === "tree_fruit") this.drops.push({ res: "food", x: n.x, y: n.y, vx: 20, vy: -50, n: 3, t: 0 });
      const y = yield_[n.type];
      const bonus = this.allies.some((a) => a.id === "tito") ? 1 : 0;
      const count = Math.max(1, Math.round((y.n + bonus) * (n.type === "crystal" || n.type === "ore" ? 1 : 1)));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        this.drops.push({ res: y.res, x: n.x, y: n.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 50, n: 1, t: 0 });
      }
      this.spawnParticles(n.x, n.y, colors[n.type], 16, 220);
      this.shake = Math.min(9, this.shake + 4);
    }
  }

  killMonster(m: Monster) {
    if (m.defeated) return;
    m.defeated = true;
    this.seenCreatures.add(m.skin);
    this.creatureKills[m.skin] = (this.creatureKills[m.skin] ?? 0) + 1;
    this.kills++;
    this.questP[1] = Math.min(QUESTS[1].target, this.questP[1] + 1);
    this.addScore(25);
    this.spawnParticles(m.x, m.y, "#b13ae0", 22, 260);
    this.spawnParticles(m.x, m.y, "#30102d", 12, 160);
    this.sfx.die();
    // loot
    const r = Math.random();
    if (r < 0.35) this.drops.push({ res: "fiber", x: m.x, y: m.y, vx: 0, vy: -60, n: 1, t: 0 });
    else if (r < 0.5) this.drops.push({ res: "food", x: m.x, y: m.y, vx: 20, vy: -60, n: 1, t: 0 });
    else if (r < 0.58 && m.type !== "crawler") this.drops.push({ res: "iron", x: m.x, y: m.y, vx: -20, vy: -60, n: 1, t: 0 });
    this.checkQuests();
  }

  tryRoll() {
    if (this.rollCd > 0 || this.stamina < 15) return;
    this.rollT = 0.26; this.rollCd = 0.85; this.invulnT = 0.32;
    this.stamina -= 15;
    this.sfx.roll();
    this.spawnParticles(this.px, this.py + 10, "#d8cfa8", 8, 120);
  }

  eatFood() {
    if (this.inv.food <= 0) { this.toast("Sem comida! Colete frutas 🍖"); return; }
    if (this.hp >= this.maxHp) return;
    this.inv.food--;
    this.hp = Math.min(this.maxHp, this.hp + 22 + (this.equipment.charm ? 8 : 0));
    this.sfx.eat();
    this.floaters.push({ x: this.px, y: this.py - 30, t: 0, text: "+22 ❤", c: "#7de87d" });
    this.spawnParticles(this.px, this.py - 10, "#7de87d", 8, 120);
  }

  tryInteract() {
    if (this.placing) { this.confirmPlace(); return; }
    for (const site of SITES) {
      if (dist2(site.x, site.y + 45, this.px, this.py) < 120 * 120) { this.inspectSite(site.id); return; }
    }
    for (const ch of this.chests) {
      if (!ch.opened && dist2(ch.x, ch.y, this.px, this.py) < 64 * 64) { this.openChest(ch); return; }
    }
    // 1) reparar cerca/estrutura danificada com madeira
    let damaged: Structure | null = null;
    let dmgD = 74 * 74;
    for (const s of this.structures) {
      const d = dist2(s.x, s.y, this.px, this.py);
      if (d < dmgD && s.hp < s.maxHp) { dmgD = d; damaged = s; }
    }
    if (damaged) {
      const need = 4 + Math.floor((damaged.maxHp - damaged.hp) / 40);
      if (this.inv.wood < need) { this.toast(`Precisa de ${need} 🪵 para reparar`); return; }
      this.inv.wood -= need;
      damaged.hp = Math.min(damaged.maxHp, damaged.hp + Math.ceil(damaged.maxHp * 0.45));
      this.spawnParticles(damaged.x, damaged.y - 10, "#ffe0a0", 12, 160);
      this.sfx.build();
      this.toast(`🔧 ${STRUCT_DEF[damaged.type].name} reparada (-${need} 🪵)`);
      this.emitSnapshot();
      return;
    }
    for (const s of this.structures) {
      if (dist2(s.x, s.y, this.px, this.py) < 70 * 70) {
        if (s.type === "gate") {
          s.open = !s.open;
          this.sfx.build();
          this.toast(s.open ? "🚪 Portão ABERTO — cuidado, eles podem entrar!" : "🚪 Portão FECHADO. A cerca está segura.");
          return;
        }
        if (s.type === "campfire") {
          this.saveGame(true);
          this.hp = Math.min(this.maxHp, this.hp + 10);
          this.toast(this.settings.autoSave ? "🔥 Jogo salvo junto à fogueira!" : "🔥 Gravado manualmente na fogueira!");
          this.sfx.quest();
          return;
        }
        if (s.type === "forge") { this.openPanel("forge"); return; }
        if (s.type === "workbench") { this.openPanel("build"); return; }
        if (s.type === "raft") { this.tryEscape(); return; }
      }
    }
    const rian = this.allies.find((a) => a.id === "rian");
    if (rian && dist2(rian.x, rian.y, this.px, this.py) < 64 * 64) {
      const tut = this.tutorial();
      const line = tut ? this.rianTipFor(tut.id) : "Estamos indo bem. Quando a balsa ficar pronta, saímos daqui juntos.";
      this.say("rian", line, 6);
      this.toast(line, "rian");
      this.sfx.ui();
      return;
    }
    // villager
    for (const v of this.villagers) {
      if (dist2(v.x, v.y, this.px, this.py) < 60 * 60) {
        this.toast(`🧑‍🌾 ${v.line}`);
        this.sfx.ui();
        return;
      }
    }
    this.openPanel("build");
  }

  tryEscape() {
    const reasons = this.raftBlockReasons();
    if (reasons.length > 0) { this.toast("⛵ " + reasons[0]); return; }
    // VICTORY
    this.questDone[6] = true;
    this.addScore(20000);
    this.softPause = false;
    this.outcome = "vitoria";
    this.state = "victory";
    this.saveClear();
    this.sfx.quest();
    this.emitState();
  }

  raftBlockReasons(): string[] {
    const r: string[] = [];
    if (!this.structures.some((s) => s.type === "raft")) r.push("Construa a balsa na praia primeiro");
    if (this.day < 14) r.push(`A maré só permitirá a fuga após o dia 14 (hoje: ${this.day})`);
    if (!this.questDone[1]) r.push("Rian insiste: complete a missão Caçador antes de partir");
    if (!this.questDone[3]) r.push("Precisa do Ferreiro para reforçar a balsa (missão Ferreiro)");
    if (this.tools.sword < 3) r.push("Espada nível 3+ para a travessia (mar infestado)");
    return r;
  }

  /* ---------------- build & upgrade ---------------- */
  setFenceStyle(style: FenceStyle) {
    const def = FENCE_DEF[style];
    if (this.baseLevel() < def.lockLevel) { this.toast(`Requer reino nível ${def.lockLevel}.`); return; }
    this.fenceStyle = style;
    if (this.placing === "wall" || this.placing === "gate") this.updatePlacement();
    this.sfx.ui(); this.emitSnapshot();
  }
  fenceStyleCost(style = this.fenceStyle): Partial<Record<ResKey, number>> {
    const def = FENCE_DEF[style];
    const m = this.diff.resMult * (this.allies.some((a) => a.id === "tito") ? 0.8 : 1);
    const built = this.structures.filter((s) => s.type === "wall").length;
    const grown = 1 + Math.floor(built / 2) * 0.18;
    const out: Partial<Record<ResKey, number>> = {};
    for (const k of Object.keys(def.cost) as ResKey[]) out[k] = Math.ceil((def.cost[k] ?? 0) * m * grown * 2);
    return out;
  }
  costFor(type: StructType): Partial<Record<ResKey, number>> {
    if (type === "wall") return this.fenceStyleCost();
    const base = STRUCT_DEF[type].cost;
    const m = this.diff.resMult * (this.allies.some((a) => a.id === "tito") ? 0.8 : 1);
    const built = this.structures.filter((s) => s.type === type).length;
    const grown = 1 + built * 0.35;
    const out: Partial<Record<ResKey, number>> = {};
    for (const k of Object.keys(base) as ResKey[]) out[k] = Math.ceil((base[k] ?? 0) * m * grown);
    return out;
  }
  canAfford(cost: Partial<Record<ResKey, number>>) {
    return (Object.keys(cost) as ResKey[]).every((k) => this.inv[k] >= (cost[k] ?? 0));
  }
  payCost(cost: Partial<Record<ResKey, number>>) {
    for (const k of Object.keys(cost) as ResKey[]) this.inv[k] -= cost[k] ?? 0;
  }
  baseLevel() {
    return this.structures.reduce((acc, s) => acc + STRUCT_DEF[s.type].lvl, 0);
  }
  structMaxHp(type: StructType, style: FenceStyle = this.fenceStyle) {
    const base: Record<StructType, number> = {
      campfire: 180, wall: FENCE_DEF[style].hp, gate: Math.round(FENCE_DEF[style].hp * 1.35), workbench: 200, house: 380, farm: 200,
      sawmill: 230, quarry: 260, forge: 300, tower: 320, raft: 400,
    };
    return Math.round(base[type] * (this.diff.resMult >= 3 ? 1.55 : this.diff.resMult >= 2 ? 1.3 : 1));
  }
  baseStructures(): Structure[] {
    return this.structures.filter((s) => s.type === "wall" || s.type === "gate");
  }
  damageStructure(s: Structure, dmg: number) {
    s.hp -= dmg;
    this.spawnParticles(s.x, s.y - 12, s.type === "gate" ? "#c9a26a" : "#a8895e", 7, 140);
    if (s.hp <= 0) {
      const i = this.structures.indexOf(s);
      if (i >= 0) this.structures.splice(i, 1);
      const label = s.type === "gate" ? "🚪 O PORTÃO CAIU! Eles estão entrando!" : "🧱 Sua cerca foi quebrada!";
      this.toast(label);
      this.spawnParticles(s.x, s.y, "#c9a26a", 22, 240);
      this.shake = Math.min(14, this.shake + 7);
      this.sfx.die();
    }
  }
  underAttackNow(): boolean {
    for (const m of this.monsters) {
      if (m.siege && dist2(m.x, m.y, BASE.x, BASE.y) < (BASE.r * 1.7) * (BASE.r * 1.7)) return true;
      if (dist2(m.x, m.y, this.px, this.py) < 260 * 260) return true;
    }
    return false;
  }
  structLock(type: StructType): string {
    const def = STRUCT_DEF[type];
    if (def.lvl >= 2 && type !== "workbench" && !this.structures.some((s) => s.type === "workbench"))
      return "Requer Bancada";
    if (type === "workbench" && !this.questDone[0]) return "Complete a missão Primeiros Passos";
    if (type === "raft") {
      if (!this.structures.some((s) => s.type === "forge")) return "Requer Forja";
      if (this.baseLevel() < 10) return "Requer base nível 10";
    }
    if (type === "house" && this.structures.filter((s) => s.type === "house").length >= 5) return "Máximo de 5 casas";
    return "";
  }

  /** A 64-slot ring keeps each wall aligned and leaves a gate-sized opening. */
  fencePosition(index: number) {
    const slot = ((index % FENCE_SLOTS) + FENCE_SLOTS) % FENCE_SLOTS;
    const a = (slot / FENCE_SLOTS) * Math.PI * 2;
    return { x: BASE.x + Math.cos(a) * FENCE_RADIUS, y: BASE.y + Math.sin(a) * FENCE_RADIUS };
  }
  fencePositions(type: StructType, slot = this.fenceSlot) {
    return type === "wall" ? [this.fencePosition(slot), this.fencePosition(slot + 1)] : [this.fencePosition(slot)];
  }
  rotateStructure(direction = 1) {
    if (!this.placing) return;
    if (this.placing === "wall" || this.placing === "gate") { this.rotateFence(direction); return; }
    this.placeRotation = Math.abs(this.placeRotation % Math.PI) > 0.1 ? 0 : Math.PI / 2;
    this.updatePlacement(); this.sfx.ui(); this.emitSnapshot();
  }
  rotateFence(direction: number) {
    if (this.placing !== "wall" && this.placing !== "gate") return;
    this.mouseValid = false;
    const sign = direction < 0 ? -1 : 1;
    let slot = ((this.fenceSlot + direction) % FENCE_SLOTS + FENCE_SLOTS) % FENCE_SLOTS;
    // Skip occupied sockets automatically, including both halves of a pair.
    let found = false;
    for (let tries = 0; tries < FENCE_SLOTS; tries++) {
      if (this.fencePositions(this.placing, slot).every((p) => !this.placeCheck(this.placing!, p.x, p.y))) { found = true; break; }
      slot = (slot + sign + FENCE_SLOTS) % FENCE_SLOTS;
    }
    if (!found) {
      this.placing = null;
      this.toast("O anel está completo. Se falta um espaço, coloque o portão nele.");
      this.emitSnapshot();
      return;
    }
    this.fenceSlot = slot;
    this.updatePlacement();
    this.emitSnapshot();
  }
  /** UI entry: start placement mode for a structure. */
  build(type: StructType): boolean {
    const lock = this.structLock(type);
    if (lock) { this.toast("🔒 " + lock); return false; }
    const cost = this.costFor(type);
    if (!this.canAfford(cost)) { this.toast("Recursos insuficientes!"); return false; }
    this.placing = type;
    this.placeRotation = 0;
    if (type === "wall" || type === "gate") {
      const a = Math.atan2(this.py - BASE.y, this.px - BASE.x);
      this.fenceSlot = ((Math.round(a * FENCE_SLOTS / (2 * Math.PI)) % FENCE_SLOTS) + FENCE_SLOTS) % FENCE_SLOTS;
      this.mouseValid = false;
      for (let tries = 0; tries < FENCE_SLOTS; tries++) {
        if (this.fencePositions(type).every((p) => !this.placeCheck(type, p.x, p.y))) break;
        this.fenceSlot = (this.fenceSlot + 1) % FENCE_SLOTS;
      }
    }
    this.softPause = false;
    this.mapOpen = false;
    this.activePanel = "none";
    this.opts.onUi({ type: "panel", panel: "none" });
    this.updatePlacement();
    this.toast(type === "wall" || type === "gate"
      ? "Arraste o mouse ou use Q/E, ←/→, LB/RB para girar a cerca. Compre 2 trechos por vez; confirme para colocar."
      : `${STRUCT_DEF[type].icon} Posicione ${STRUCT_DEF[type].name} — J/clique confirma · ESC cancela`);
    this.sfx.ui();
    this.emitSnapshot();
    return true;
  }
  cancelPlace() {
    if (!this.placing) return;
    this.placing = null;
    this.sfx.ui();
    this.emitSnapshot();
  }
  snapGrid(type: StructType) { return type === "wall" || type === "gate" ? 32 : 16; }
  updatePlacement() {
    const type = this.placing;
    if (!type) return;
    if (type === "wall" || type === "gate") {
      if (this.settings.controls === "kb-mouse" && this.mouseValid) {
        const a = Math.atan2(this.mouseY + this.camY - BASE.y, this.mouseX + this.camX - BASE.x);
        this.fenceSlot = ((Math.round(a * FENCE_SLOTS / (2 * Math.PI)) % FENCE_SLOTS) + FENCE_SLOTS) % FENCE_SLOTS;
      }
      const positions = this.fencePositions(type);
      this.placeX = positions[0].x; this.placeY = positions[0].y;
      this.placeReason = positions.map((p) => this.placeCheck(type, p.x, p.y)).find(Boolean) ?? "";
      if (dist2(this.px, this.py, BASE.x, BASE.y) > (BASE.r * 1.5) ** 2) this.placeReason = "Aproxime-se da clareira para construir a cerca";
      return;
    }
    let x: number, y: number;
    if (this.settings.controls === "kb-mouse" && this.mouseValid) {
      x = this.mouseX + this.camX; y = this.mouseY + this.camY;
      const d = Math.hypot(x - this.px, y - this.py);
      const maxR = 150;
      if (d > maxR) { x = this.px + ((x - this.px) / d) * maxR; y = this.py + ((y - this.py) / d) * maxR; }
    } else {
      const fp = this.facingPoint(64);
      x = fp.x; y = fp.y;
    }
    const g = this.snapGrid(type);
    this.placeX = Math.floor(x / g) * g + g / 2;
    this.placeY = Math.floor(y / g) * g + g / 2;
    this.placeReason = this.placeCheck(type, this.placeX, this.placeY);
  }
  placeCheck(type: StructType, x: number, y: number): string {
    const t = this.tileAt(x, y);
    if (type === "raft") {
      if (t !== T_SAND && t !== T_WATER) return "A balsa vai na areia da praia";
    } else {
      if (t === T_WATER) return "Não dá para construir na água";
      const inBase = dist2(x, y, BASE.x, BASE.y) < BASE.r * BASE.r;
      if (type !== "campfire" && type !== "wall" && type !== "gate" && !inBase) return "Construa dentro da clareira";
    }
    for (const s of this.structures) {
      const minD = (s.type === "wall" || s.type === "gate") && (type === "wall" || type === "gate") ? 27 : 44;
      if (dist2(s.x, s.y, x, y) < minD * minD) return "Este espaço da cerca está ocupado";
    }
    // The ring is intentionally cleared while placing: trees no longer block
    // wall slots. They are harvested only in the footprint after purchase.
    if (type !== "wall" && type !== "gate") {
      for (const n of this.nearbyNodes(x, y)) {
        if (n.hp > 0 && n.type !== "bush" && n.type !== "berry" && dist2(n.x, n.y, x, y) < 26 * 26) return "Há uma árvore/rocha no lugar";
      }
    }
    if (dist2(x, y, this.px, this.py) < 18 * 18 && type !== "campfire" && type !== "wall" && type !== "gate") return "Você está no caminho";
    if (type === "gate" && this.structures.some((s) => s.type === "gate")) return "Já existe um portão na cerca";
    return "";
  }
  confirmPlace(): boolean {
    const type = this.placing;
    if (!type) return false;
    this.updatePlacement();
    if (this.placeReason) { this.toast("⛔ " + this.placeReason); this.sfx.ui(); return false; }
    const cost = this.costFor(type);
    if (!this.canAfford(cost)) { this.toast("Recursos insuficientes!"); this.placing = null; this.emitSnapshot(); return false; }
    const positions = type === "wall" || type === "gate" ? this.fencePositions(type) : [{ x: this.placeX, y: this.placeY }];
    // One transaction, both wall pieces; don't charge or place only one.
    if (positions.some((p) => this.placeCheck(type, p.x, p.y))) return false;
    this.payCost(cost);
    const mhp = this.structMaxHp(type);
    for (const p of positions) {
      const ring = type === "wall" || type === "gate";
      const rotation = ring ? Math.atan2(p.y - BASE.y, p.x - BASE.x) + Math.PI / 2 : this.placeRotation;
      this.structures.push({ type, x: p.x, y: p.y, prodT: 0, hp: mhp, maxHp: mhp, open: false, rotation, fenceStyle: this.fenceStyle });
      for (const n of this.nearbyNodes(p.x, p.y)) {
        if (n.hp > 0 && dist2(n.x, n.y, p.x, p.y) < 24 * 24) { n.hp = 0; n.respawn = 200; this.depletedNodes.add(n); }
      }
      this.spawnParticles(p.x, p.y, "#ffd27d", 9, 160);
    }
    this.questP[2] = Math.min(QUESTS[2].target, this.questP[2] + 1);
    this.questP[5] = Math.min(QUESTS[5].target, this.baseLevel());
    if (type === "house") this.maxHp += 12;
    this.addScore(type === "wall" ? 220 : 150);
    this.shake = Math.min(8, this.shake + 4);
    this.sfx.build();
    const total = this.structures.length;
    if ((type === "campfire" || type === "wall" || type === "gate") && total <= 5 && !this.survivedNight) {
      this.spawnWave(type === "campfire" ? 5 : 4);
      this.toast("👁️ Eles sentiram sua presença... uma patrulha se aproxima!");
      this.sfx.night();
    } else {
      this.toast(type === "wall" ? "🧱 Dois trechos conectados! Gire para continuar o círculo." : `${STRUCT_DEF[type].icon} ${STRUCT_DEF[type].name} construída!`);
    }
    this.checkQuests();
    if (type === "wall" && this.canAfford(this.costFor("wall"))) {
      this.mouseValid = false;
      this.rotateFence(2);
    } else this.placing = null;
    this.emitSnapshot();
    return true;
  }

  upgradeCost(tool: ToolKey, lvl: number): Partial<Record<ResKey, number>> {
    const m = this.diff.resMult;
    const c: Partial<Record<ResKey, number>> = {
      wood: Math.ceil(30 * lvl * m),
      stone: Math.ceil(25 * lvl * m),
    };
    if (lvl >= 2) c.iron = Math.ceil(12 * (lvl - 1) * m);
    if (lvl >= 4) c.crystal = Math.ceil(8 * (lvl - 3) * m);
    if (tool === "sword") { c.iron = Math.ceil((c.iron ?? 8) * 1.5); }
    return c;
  }
  upgradeLock(tool: ToolKey): string {
    const lvl = this.tools[tool];
    if (lvl >= 5) return "Nível máximo";
    if (!this.structures.some((s) => s.type === "forge")) return "Requer Forja";
    if (lvl >= 3 && !this.allies.some((a) => a.id === "bren")) return "Requer Bren, o Ferreiro (missão)";
    return "";
  }
  upgrade(tool: ToolKey): boolean {
    const lock = this.upgradeLock(tool);
    if (lock) { this.toast("🔒 " + lock); return false; }
    const cost = this.upgradeCost(tool, this.tools[tool]);
    if (!this.canAfford(cost)) { this.toast("Recursos insuficientes!"); return false; }
    this.payCost(cost);
    this.tools[tool]++;
    this.addScore(300);
    this.sfx.quest();
    this.toast(`${TOOL_ICON[tool]} ${TOOL_LABEL[tool]} melhorado para nível ${this.tools[tool]}!`);
    this.emitSnapshot();
    return true;
  }

  /* ---------------- quests ---------------- */
  checkQuests() {
    this.questP[0] = Math.min(QUESTS[0].target, this.gatheredWoodStone);
    this.questP[3] = Math.min(QUESTS[3].target, this.questP[3]);
    this.questP[4] = this.visited.size;
    this.questP[5] = Math.min(QUESTS[5].target, this.baseLevel());
    for (let i = 0; i < QUESTS.length; i++) {
      if (!this.questDone[i] && this.questP[i] >= QUESTS[i].target) {
        this.questDone[i] = true;
        this.addScore(500);
        this.sfx.quest();
        this.toast(`✅ Missão completa: ${QUESTS[i].name} — ${QUESTS[i].reward}`);
        if (i === 1) this.allies.push({ id: "maya", name: "Maya", color: "#5ad0c9", x: this.px + 30, y: this.py + 30, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
        if (i === 2) this.allies.push({ id: "tito", name: "Tito", color: "#c9b45a", x: BASE.x, y: BASE.y, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
        if (i === 3) this.allies.push({ id: "bren", name: "Bren", color: "#c95a5a", x: BASE.x + 40, y: BASE.y, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
        if (i === 4) { this.maxHp += 40; this.hp += 40; }
        if (i === 5) this.addScore(5000);
      }
    }
  }

  addScore(n: number) { this.score += n; }

  /* ---------------- tutorial ---------------- */
  tutorial(): TutorialView | null {
    const wood = this.inv.wood, stone = this.inv.stone;
    const walls = this.structures.filter((s) => s.type === "wall").length;
    const gate = this.structures.some((s) => s.type === "gate");
    const fire = this.structures.some((s) => s.type === "campfire");
    const touch = this.settings.controls === "touch";
    const pad = this.settings.controls === "gamepad";
    const kA = touch ? "Botão ⚔️" : pad ? "A" : "J";
    const kE = touch ? "Botão ✋" : pad ? "X" : "E";
    const kB = touch ? "Botão 🎒" : pad ? "Y" : "B";
    const kMove = touch ? "Joystick" : pad ? "Analógico" : "WASD";
    const steps: TutorialView[] = [
      { id: "t1", title: "1 · Corte sua primeira árvore", text: `Ande com ${kMove}, encare a árvore e ataque com ${kA} (machado). Cada golpe derruba madeira 🪵.`, keys: [kMove, kA], step: 1, total: 6 },
      { id: "t2", title: "2 · Junte 12 madeira e 8 pedra", text: `Quebre rochas com a picareta: tecle 2, ou ${kA} perto da pedra. Colete também fibra nas moitas.`, keys: ["2", kA], step: 2, total: 6 },
      { id: "t3", title: "3 · Erga a fogueira", text: `Abra a construção com ${kB}, escolha 🔥 Fogueira e coloque no centro da clareira. Ela salva o jogo com ${kE}.`, keys: [kB, kE], step: 3, total: 6 },
      { id: "t4", title: "4 · Cerque a base (2 pares)", text: `Compre duas cercas duplas: cada compra coloca 2 peças no círculo. Gire com Q/E, ←/→ ou os botões.`, keys: [kB], step: 4, total: 6 },
      { id: "t5", title: "5 · Instale o portão", text: `Coloque o 🚪 Portão no vão da cerca. ${kE} abre/fecha. Fechado, eles precisam quebrar; aberto, entram.`, keys: [kB, kE], step: 5, total: 6 },
      { id: "t6", title: "6 · Sobreviva à primeira noite", text: `Feche o portão e defenda a clareira. Fure os invasores e repare a cerca com ${kE} + 🪵 madeira.`, keys: [kE, kA], step: 6, total: 6 },
    ];
    if (this.escort.active) return { id: "t0", title: "0 · Siga Rian até a base", text: `Rian conhece o caminho. Ande com ${kMove} e fique perto dele — ele espera por você.`, keys: [kMove], step: 0, total: 6 };
    if (wood <= 0 && this.gatheredWoodStone <= 0) return steps[0];
    if (wood < 12 || stone < 8) return steps[1];
    if (!fire) return steps[2];
    if (walls < 4) return steps[3];
    if (!gate) return steps[4];
    if (!this.survivedNight) return steps[5];
    return null;
  }

  /* ---------------- save/load ---------------- */
  saveKey() { return `ilha-save-${this.opts.difficulty}-${this.opts.mode}`; }
  saveGame(force = false) {
    if (this.outcome) return;
    if (!force && !this.settings.autoSave) return;
    try {
      const nodeHp: [number, number, number][] = [];
      this.nodes.forEach((n, i) => { if (n.hp < n.maxHp || n.respawn > 0) nodeHp.push([i, Math.max(0, Math.round(n.hp)), Math.round(n.respawn)]); });
      const data: SaveData = {
        v: 2, seed: this.opts.seed,
        px: this.px, py: this.py, hp: this.hp, maxHp: this.maxHp,
        inv: { ...this.inv }, tools: { ...this.tools },
        time: this.time, day: this.day, score: this.score, kills: this.kills, deaths: this.deaths,
        structures: this.structures.map((s) => ({ type: s.type, x: s.x, y: s.y, hp: s.hp, open: s.open, rotation: s.rotation, fenceStyle: s.fenceStyle })),
        questP: [...this.questP], questDone: [...this.questDone],
        allies: this.allies.map((a) => a.id), visited: [...this.visited],
        nodeHp,
        chests: this.chests.map((c) => c.opened),
        escortDone: !this.escort.active,
        escortIndex: this.escort.i,
        discoveredSites: [...this.discoveredSites], claimedSites: [...this.claimedSites],
        seenCreatures: [...this.seenCreatures], creatureKills: { ...this.creatureKills }, equipment: { ...this.equipment },
        fenceStyle: this.fenceStyle,
      };
      localStorage.setItem(this.saveKey(), JSON.stringify(data));
    } catch { /* ignore */ }
  }
  loadSave(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (!raw) return false;
      const d = JSON.parse(raw) as SaveData;
      if (!d || d.v !== 2) return false;
      if (d.seed !== this.opts.seed) {
        // regenerate world with saved seed
        this.opts.seed = d.seed;
        this.nodes = []; this.tiles = new Uint8Array(W * H);
        this.nodeBuckets.clear(); this.depletedNodes.clear();
        this.genWorld(d.seed);
      }
      this.px = d.px; this.py = d.py; this.hp = d.hp; this.maxHp = d.maxHp;
      this.inv = { ...this.inv, ...d.inv }; this.tools = { ...this.tools, ...d.tools };
      this.time = d.time; this.day = d.day; this.score = d.score; this.kills = d.kills; this.deaths = d.deaths;
      this.structures = d.structures.map((s) => {
        const fenceStyle = s.fenceStyle ?? "palisade";
        const mhp = this.structMaxHp(s.type, fenceStyle);
        const ring = s.type === "wall" || s.type === "gate";
        const rotation = s.rotation ?? (ring ? Math.atan2(s.y - BASE.y, s.x - BASE.x) + Math.PI / 2 : 0);
        return { type: s.type, x: s.x, y: s.y, prodT: 0, hp: Math.min(s.hp ?? mhp, mhp), maxHp: mhp, open: !!s.open, rotation, fenceStyle };
      });
      this.questP = d.questP; this.questDone = d.questDone;
      this.visited = new Set(d.visited);
      this.gatheredWoodStone = this.questP[0];
      const cols: Record<string, string> = { rian: "#e8a33d", maya: "#5ad0c9", tito: "#c9b45a", bren: "#c95a5a" };
      const names: Record<string, string> = { rian: "Rian", maya: "Maya", tito: "Tito", bren: "Bren" };
      this.allies = d.allies.map((id) => ({ id, name: names[id] ?? id, color: cols[id] ?? "#fff", x: this.px + 40, y: this.py, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 }));
      for (const [i, hp, rs] of d.nodeHp) {
        if (this.nodes[i]) {
          this.nodes[i].hp = hp; this.nodes[i].respawn = rs;
          if (hp <= 0 && rs > 0) this.depletedNodes.add(this.nodes[i]);
        }
      }
      if (d.chests) d.chests.forEach((o, i) => { if (this.chests[i]) this.chests[i].opened = o; });
      const relocated = this.ensurePlayablePosition();
      if (relocated) {
        for (const ally of this.allies) { ally.x = this.px + 40; ally.y = this.py - 20; }
        this.toast("Você foi colocado em segurança na praia. Siga Rian pela trilha.", "rian");
      }
      if (d.escortDone === false) {
        const nearest = ESCORT_ROUTE.reduce((best, point, i) =>
          dist2(point.x, point.y, this.px, this.py) < dist2(ESCORT_ROUTE[best].x, ESCORT_ROUTE[best].y, this.px, this.py) ? i : best, 0);
        const savedIndex = typeof d.escortIndex === "number" ? d.escortIndex : nearest;
        this.escort = { active: true, i: clamp(Math.floor(savedIndex), 0, ESCORT_ROUTE.length - 1), waitT: 0, wp: ESCORT_ROUTE.map((point) => ({ ...point })) };
      } else {
        this.escort.active = false;
      }
      this.discoveredSites = new Set(d.discoveredSites ?? []);
      this.claimedSites = new Set(d.claimedSites ?? []);
      this.seenCreatures = new Set(d.seenCreatures ?? []);
      this.creatureKills = d.creatureKills ?? {};
      this.equipment = { harness: true, coat: false, charm: false, ...(d.equipment ?? {}) };
      this.fenceStyle = d.fenceStyle ?? "palisade";
      this.lastTutId = this.tutorial()?.id ?? "done";
      return true;
    } catch { return false; }
  }
  saveClear() { try { localStorage.removeItem(this.saveKey()); } catch { /* */ } }
  static hasSave(difficulty: Difficulty, mode: Mode): number | null {
    try {
      const raw = localStorage.getItem(`ilha-save-${difficulty}-${mode}`);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return d?.seed ?? null;
    } catch { return null; }
  }

  /* ---------------- death / respawn ---------------- */
  die() {
    this.deaths++;
    this.mapOpen = false;
    this.softPause = false;
    this.outcome = this.diff.permadeath ? "morte" : null;
    this.state = "gameover";
    this.sfx.die();
    this.shake = 16;
    this.spawnParticles(this.px, this.py, "#e03a3a", 30, 300);
    if (this.diff.permadeath) { this.outcome = "morte"; this.saveClear(); }
    this.emitState();
  }
  respawn() {
    if (this.diff.permadeath || this.state !== "gameover") return;
    this.softPause = false;
    // lose part of carried resources
    for (const k of Object.keys(this.inv) as ResKey[]) {
      this.inv[k] = Math.floor(this.inv[k] * (1 - this.diff.lossOnDeath));
    }
    this.hp = Math.ceil(this.maxHp * 0.6);
    this.stamina = 100;
    const fire = this.structures.find((s) => s.type === "campfire");
    if (fire) { this.px = fire.x + 20; this.py = fire.y + 20; }
    else { this.px = BASE.x; this.py = BASE.y; }
    this.ensurePlayablePosition();
    this.centerCamera();
    this.invulnT = 2.5;
    // scatter monsters away
    for (const m of this.monsters) {
      if (dist2(m.x, m.y, this.px, this.py) < 500 * 500) { m.state = "idle"; m.x = m.home.x; m.y = m.home.y; }
    }
    this.state = "playing";
    this.toast(`💀 Você caiu... perdeu ${Math.round(this.diff.lossOnDeath * 100)}% dos recursos carregados.`);
    this.saveGame();
    this.emitState();
  }

  /* ---------------- exploration / equipment ---------------- */
  craftEquipment(id: EquipmentKey): boolean {
    const item = EQUIPMENT.find((entry) => entry.id === id);
    if (!item || this.equipment[id]) return false;
    if (!this.structures.some((s) => s.type === "workbench")) { this.toast("Construa uma bancada para fabricar equipamento."); return false; }
    if (!this.canAfford(item.cost)) { this.toast("Faltam materiais para este equipamento."); return false; }
    this.payCost(item.cost);
    this.equipment[id] = true;
    this.addScore(200); this.sfx.quest();
    this.toast(`${item.name} equipado: ${item.effect}`);
    this.emitSnapshot(); this.saveGame(); return true;
  }
  inspectSite(id: string) {
    const site = SITES.find((entry) => entry.id === id);
    if (!site) return;
    if (this.claimedSites.has(id)) { this.toast(site.lore, "rian"); return; }
    this.claimedSites.add(id); this.discoveredSites.add(id);
    for (const resource of Object.keys(site.reward) as ResKey[]) {
      const n = site.reward[resource] ?? 0;
      this.inv[resource] += n;
      if (resource === "wood" || resource === "stone") this.gatheredWoodStone += n;
      if (resource === "iron") this.questP[3] += n;
    }
    this.addScore(350); this.checkQuests();
    this.toast(site.lore + " Você recolheu os suprimentos do altar.", "rian");
    this.spawnParticles(site.x, site.y - 35, site.color, 22, 180);
    this.sfx.quest();
    const a = Math.atan2(site.y - this.py, site.x - this.px);
    const mx = site.x + Math.cos(a) * 190, my = site.y + Math.sin(a) * 190;
    if (this.tileAt(mx,my) !== T_WATER) this.spawnMonster(mx, my, site.guardian);
    this.emitSnapshot(); this.saveGame();
  }
  updateExploration(dt: number) {
    this.explorationT += dt;
    if (this.explorationT < 0.5) return;
    this.explorationT = 0;
    for (const site of SITES) {
      if (!this.discoveredSites.has(site.id) && dist2(this.px,this.py,site.x,site.y) < site.radius ** 2) {
        this.discoveredSites.add(site.id); this.addScore(150);
        this.toast(`Novo local: ${site.name}. Aproxime-se do altar e use E / interagir.`, "rian");
        this.sfx.quest();
      }
    }
  }

  /* ---------------- monsters ---------------- */
  monsterCfg(type: MonType) {
    const dayMul = 1 + (this.day - 1) * 0.07;
    const h = this.diff.mHp * dayMul, dm = this.diff.mDmg * (1 + (this.day - 1) * 0.05);
    switch (type) {
      case "imp": return { hp: 14 * h, dmg: 10 * dm, speed: 222, r: 8 };
      case "crawler": return { hp: 30 * h, dmg: 10 * dm, speed: 158, r: 11 };
      case "stalker": return { hp: 52 * h, dmg: 16 * dm, speed: 205, r: 13 };
      case "brute": return { hp: 135 * h, dmg: 26 * dm, speed: 94, r: 20 };
      case "spitter": return { hp: 44 * h, dmg: 13 * dm, speed: 112, r: 12 };
      case "hulk": return { hp: 300 * h, dmg: 42 * dm, speed: 72, r: 28 };
      case "bat": return { hp: 19 * h, dmg: 9 * dm, speed: 238, r: 9 };
      case "slime": return { hp: 36 * h, dmg: 12 * dm, speed: 104, r: 13 };
      case "demon": return { hp: 105 * h, dmg: 24 * dm, speed: 183, r: 17 };
      case "lizard": return { hp: 72 * h, dmg: 18 * dm, speed: 178, r: 15 };
    }
  }
  spawnMonster(x: number, y: number, type: MonType) {
    const c = this.monsterCfg(type);
    this.monsters.push({
      type, x, y, vx: 0, vy: 0, hp: c.hp, maxHp: c.hp, dmg: c.dmg, speed: c.speed, r: c.r,
      state: "idle", t: Math.random() * 2, atkCd: 0, flash: 0, home: { x, y }, dir: 0, siege: false,
      skin: this.skinFor(type, x, y),
    });
  }
  skinFor(type: MonType, x: number, y: number): string {
    const t = this.tileAt(x, y);
    switch (type) {
      case "imp": return "goblin";
      case "crawler": return "ghost";
      case "stalker": return "wraith";
      case "spitter": return "skelmage";
      case "brute": return t === T_ROCK || t === T_CAVE ? "golem" : "treant";
      case "hulk": return "crystalgolem";
      case "bat": return "demonbat";
      case "slime": return "iceslime";
      case "demon": return "emberdemon";
      case "lizard": return "lizardman";
    }
  }
  monsterTypeForZone(x: number, y: number): MonType {
    const t = this.tileAt(x, y);
    const roll = Math.random();
    const night = this.isNight();
    if (t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) return roll < 0.68 ? "slime" : roll < 0.9 ? "bat" : "hulk";
    const scaled = SITES.find((site) => site.id === "scaled");
    if (scaled && dist2(x, y, scaled.x, scaled.y) < scaled.radius * scaled.radius) return roll < 0.72 ? "lizard" : "slime";
    if (t === T_RUIN || t === T_NECRO) return roll < 0.42 ? "bat" : roll < 0.72 ? "spitter" : "demon";
    if (t === T_DARK && roll > 0.86) return "demon";
    if (night && roll > 0.9) return "bat";
    const horror = t === T_CAVE || t === T_ROCK || t === T_DARK;
    const bigChance = Math.min(0.24, 0.04 + this.day * 0.012) * (horror ? 1.6 : 1);
    if (roll < bigChance * 0.45) return "hulk";
    if (roll < bigChance) return "brute";
    if (horror) {
      if (roll < bigChance + 0.2) return "stalker";
      if (roll < bigChance + 0.32) return "spitter";
      if (roll < bigChance + 0.62) return "crawler";
      return "imp";
    }
    if (night) {
      if (roll < 0.16) return "stalker";
      if (roll < 0.22) return "spitter";
      if (roll < 0.52) return "crawler";
      return "imp";
    }
    if (roll < 0.18) return "crawler";
    return "imp";
  }
  spawnWave(n: number, cx = BASE.x, cy = BASE.y) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 380 + Math.random() * 240;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (this.tileAt(x, y) === T_WATER) continue;
      const type: MonType = i === 0 && n >= 5 ? "brute" : Math.random() < 0.7 ? "imp" : "crawler";
      this.spawnMonster(x, y, type);
    }
  }

  updateSpawns(dt: number) {
    const night = this.isNight();
    const cap = Math.min(58, Math.floor((14 + this.day * 1.8) * this.diff.spawn));
    if (this.monsters.length >= cap) return;
    const hasBase = this.structures.length > 0;
    const rate = (night ? (hasBase ? 0.55 : 0.34) : 0.12) * this.diff.spawn;
    if (Math.random() < rate * dt) {
      const batch = night ? 1 + Math.floor(Math.random() * 3) : 1;
      // spawn in ring around player, biased to dark zones at day
      for (let tryI = 0; tryI < 8; tryI++) {
        const a = Math.random() * Math.PI * 2;
        const d = 460 + Math.random() * 420;
        const x = this.px + Math.cos(a) * d, y = this.py + Math.sin(a) * d;
        const t = this.tileAt(x, y);
        if (t === T_WATER) continue;
        const darkZone = t === T_DARK || t === T_CAVE || t === T_ROCK || t === T_RUIN || t === T_NECRO || t === T_SNOW || t === T_ICE;
        if (!night && !darkZone) continue;
        // never spawn inside village / base walls proximity
        if (dist2(x, y, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r) continue;
        if (dist2(x, y, BASE.x, BASE.y) < (BASE.r * 0.5) * (BASE.r * 0.5)) continue;
        for (let b = 0; b < batch; b++) {
          this.spawnMonster(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90, this.monsterTypeForZone(x, y));
        }
        break;
      }
    }
  }

  blockedByWall(x: number, y: number): boolean {
    for (const s of this.structures) {
      if (s.type === "gate" && s.open) continue;
      if ((s.type === "wall" || s.type === "gate" || s.type === "house" || s.type === "tower" || s.type === "forge") && dist2(s.x, s.y, x, y) < 25 * 25) return true;
    }
    return false;
  }

  nearestSiegeTarget(m: Monster): Structure | null {
    let best: Structure | null = null;
    let bd = Infinity;
    for (const st of this.structures) {
      if (st.type !== "wall" && st.type !== "gate") continue;
      if (st.type === "gate" && st.open) continue;
      const d = dist2(st.x, st.y, m.x, m.y);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  updateMonsters(dt: number) {
    const night = this.isNight();
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.hp <= 0) { this.monsters.splice(i, 1); continue; }
      m.flash = Math.max(0, m.flash - dt);
      m.atkCd = Math.max(0, m.atkCd - dt);
      const dp = Math.sqrt(dist2(m.x, m.y, this.px, this.py));
      if (dp < 410) this.seenCreatures.add(m.skin);
      if (!night && dp > 1500 && this.tileAt(m.x, m.y) === T_GRASS) { this.monsters.splice(i, 1); continue; }
      if (dp > 1600) continue;

      const siegeTarget = this.nearestSiegeTarget(m);
      const closeToPlayer = dp < (night ? 250 : 170);
      const wallDist = siegeTarget ? Math.sqrt(dist2(siegeTarget.x, siegeTarget.y, m.x, m.y)) : Infinity;
      const nearWall = wallDist < 820;
      m.siege = !!siegeTarget && (wallDist < 140 || (!closeToPlayer && nearWall && (night || dist2(m.x, m.y, BASE.x, BASE.y) < (BASE.r * 1.9) * (BASE.r * 1.9))));
      const tx = m.siege && siegeTarget ? siegeTarget.x : this.px;
      const ty = m.siege && siegeTarget ? siegeTarget.y : this.py;
      const targetDist = m.siege ? Math.sqrt(dist2(m.x, m.y, tx, ty)) : dp;
      const aggro = night ? 900 : 340;

      switch (m.state) {
        case "idle": {
          m.t -= dt;
          if (m.t <= 0) {
            m.t = 0.8 + Math.random() * 1.6;
            const a = Math.random() * Math.PI * 2;
            m.vx = Math.cos(a) * m.speed * 0.3; m.vy = Math.sin(a) * m.speed * 0.3;
          }
          if (dp < aggro || m.siege) { m.state = "chase"; }
          break;
        }
        case "chase": {
          const a = Math.atan2(ty - m.y, tx - m.x);
          m.dir = a;
          const sp = m.speed * (night ? 1.16 : 1);
          m.vx += (Math.cos(a) * sp - m.vx) * Math.min(1, dt * 5);
          m.vy += (Math.sin(a) * sp - m.vy) * Math.min(1, dt * 5);
          const range = m.siege ? m.r + 34 : m.type === "spitter" ? 250 : m.r + 26;
          if (targetDist < range && m.atkCd <= 0) {
            m.state = "windup";
            m.t = m.type === "hulk" ? 0.6 : m.type === "brute" ? 0.5 : m.type === "imp" ? 0.22 : 0.32;
            m.vx *= 0.15; m.vy *= 0.15;
          }
          if (!m.siege && dp > 1000) m.state = "idle";
          break;
        }
        case "windup": {
          m.t -= dt;
          if (m.t <= 0) {
            m.state = "attack"; m.t = 0.16;
            if (m.type === "spitter" && !m.siege) {
              const a = Math.atan2(this.py - m.y, this.px - m.x);
              this.projectiles.push({ x: m.x, y: m.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, t: 2, dmg: m.dmg });
              this.sfx.swing();
            } else if (m.siege) {
              if (siegeTarget) {
                const structDmg = (m.type === "hulk" ? 34 : m.type === "brute" ? 22 : m.type === "imp" ? 4 : 10) * this.diff.mDmg * (1 + (this.day - 1) * 0.04);
                this.damageStructure(siegeTarget, structDmg);
                this.sfx.hit();
                this.shake = Math.min(12, this.shake + 3);
              }
            } else {
              const a = Math.atan2(this.py - m.y, this.px - m.x);
              m.vx = Math.cos(a) * m.speed * 2.7; m.vy = Math.sin(a) * m.speed * 2.7;
            }
            m.atkCd = m.type === "imp" ? 0.75 : m.type === "hulk" ? 1.9 : m.type === "brute" ? 1.6 : 1.1;
          }
          break;
        }
        case "attack": {
          m.t -= dt;
          if (!m.siege && m.type !== "spitter" && dp < m.r + 22 && this.invulnT <= 0) {
            this.damagePlayer(m.dmg, m.x, m.y);
            m.state = "chase";
          }
          if (m.t <= 0) m.state = "chase";
          break;
        }
        case "hurt": {
          m.t -= dt;
          if (m.t <= 0) m.state = "chase";
          break;
        }
      }
      const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt;
      const blockedX = this.blockedByWall(nx, m.y);
      const blockedY = this.blockedByWall(m.x, ny);
      if (this.tileAt(nx, m.y) !== T_WATER && !blockedX) m.x = nx; else m.vx *= -0.5;
      if (this.tileAt(m.x, ny) !== T_WATER && !blockedY) m.y = ny; else m.vy *= -0.5;
      if (blockedX || blockedY) {
        m.siege = true;
        if (m.state === "chase") { m.state = "windup"; m.t = 0.12; }
      }
      m.vx *= Math.pow(0.6, dt * 6); m.vy *= Math.pow(0.6, dt * 6);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t <= 0 || this.tileAt(p.x, p.y) === T_WATER || this.blockedByWall(p.x, p.y)) { this.projectiles.splice(i, 1); continue; }
      if (this.invulnT <= 0 && dist2(p.x, p.y, this.px, this.py) < 22 * 22) {
        this.damagePlayer(p.dmg, p.x, p.y);
        this.projectiles.splice(i, 1);
      }
    }
  }

  damagePlayer(dmg: number, fromX: number, fromY: number) {
    if (this.invulnT > 0 || this.state !== "playing") return;
    const final = Math.max(1, Math.round(dmg * (this.equipment.coat ? 0.82 : 1)));
    this.hp -= final;
    this.invulnT = 0.55;
    this.hurtFlash = 0.3;
    this.shake = Math.min(16, this.shake + 9);
    this.hitstop = 0.05;
    const a = Math.atan2(this.py - fromY, this.px - fromX);
    this.pvx += Math.cos(a) * 320; this.pvy += Math.sin(a) * 320;
    this.spawnParticles(this.px, this.py, "#e03a3a", 14, 220);
    this.floaters.push({ x: this.px, y: this.py - 34, t: 0, text: `-${final}`, c: "#ff6060" });
    this.sfx.hurt();
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  updateAllies(dt: number) {
    for (const al of this.allies) {
      if (al.downT > 0) { al.downT -= dt; if (al.downT <= 0) { al.x = BASE.x; al.y = BASE.y; } continue; }
      al.atkCd = Math.max(0, al.atkCd - dt);
      // find monster near
      let tgt: Monster | null = null; let bd = 230 * 230;
      for (const m of this.monsters) {
        const d = dist2(m.x, m.y, al.x, al.y);
        if (d < bd) { bd = d; tgt = m; }
      }
      let gx = this.px - 46 + ((al.id.charCodeAt(0) % 3) - 1) * 36;
      let gy = this.py + 34 + ((al.id.charCodeAt(1) % 3) - 1) * 30;
      if (al.id === "tito" || al.id === "bren") { gx = BASE.x + (al.id === "tito" ? -60 : 60); gy = BASE.y + 20; }
      if (tgt && (al.id === "rian" || al.id === "maya")) { gx = tgt.x; gy = tgt.y; }
      let escorting = false;
      if (al.id === "rian" && this.escort.active) {
        escorting = true;
        const wp = this.escort.wp[this.escort.i];
        const dPlayer = Math.sqrt(dist2(al.x, al.y, this.px, this.py));
        if (dPlayer > 240) {
          // wait for the player
          gx = al.x; gy = al.y;
          al.dir = Math.atan2(this.py - al.y, this.px - al.x);
          this.escort.waitT -= dt;
          if (this.escort.waitT <= 0) { this.escort.waitT = 7; this.say("rian", "Ei! Por aqui — não fique para trás!", 3.5); }
        } else {
          gx = wp.x; gy = wp.y;
          if (dist2(al.x, al.y, wp.x, wp.y) < 44 * 44) {
            this.say("rian", wp.line, 6);
            this.toast(wp.line, "rian");
            this.escort.i++;
            if (this.escort.i >= this.escort.wp.length) {
              this.escort.active = false;
              this.sfx.quest();
            }
          }
        }
        if (tgt && dist2(tgt.x, tgt.y, al.x, al.y) < 120 * 120) { gx = tgt.x; gy = tgt.y; }
      }
      const d = Math.sqrt(dist2(al.x, al.y, gx, gy));
      if (d > 30) {
        const a = Math.atan2(gy - al.y, gx - al.x);
        al.dir = a;
        const sp = escorting ? 168 : d > 300 ? 300 : 190;
        al.vx += (Math.cos(a) * sp - al.vx) * Math.min(1, dt * 6);
        al.vy += (Math.sin(a) * sp - al.vy) * Math.min(1, dt * 6);
      } else { al.vx *= 0.8; al.vy *= 0.8; }
      // teleport if too far
      if (d > 900 && !escorting) { al.x = this.px + 40; al.y = this.py + 40; }
      const nx = al.x + al.vx * dt, ny = al.y + al.vy * dt;
      if (this.tileAt(nx, ny) !== T_WATER) { al.x = nx; al.y = ny; }
      // attack
      if (tgt && al.atkCd <= 0 && dist2(tgt.x, tgt.y, al.x, al.y) < 46 * 46 && (al.id === "rian" || al.id === "maya")) {
        al.atkCd = 0.7;
        const dmg = 4 + this.tools.sword * 3;
        tgt.hp -= dmg; tgt.flash = 0.12;
        this.spawnParticles(tgt.x, tgt.y, "#ffd34d", 6, 140);
        this.floaters.push({ x: tgt.x, y: tgt.y - 18, t: 0, text: `${dmg}`, c: "#ffeaa0" });
        this.sfx.hit();
        if (tgt.hp <= 0) this.killMonster(tgt);
      }
    }
  }

  /* ---------------- speech ---------------- */
  say(who: string, text: string, dur = 4.5) {
    this.bubbles = this.bubbles.filter((b) => b.who !== who);
    this.bubbles.push({ who, text, t: 0, dur });
  }
  rianTipFor(id: string): string {
    const tips: Record<string, string> = {
      t0: "Vamos para a clareira. Fique perto de mim e observe a trilha.",
      t1: "Corta aquela árvore ali! Encare ela e ataque — cada golpe solta madeira.",
      t2: "Boa. Agora pedra: use a picareta (tecla 2) nas rochas cinzas. Precisamos de 12 madeira e 8 pedra.",
      t3: "Fogueira primeiro! Abra a construção (B), escolha a Fogueira e coloque no centro. Ela salva nosso progresso.",
      t4: "A cerca vem em pares! Gire a prévia com Q/E ou os botões na tela e coloque dois pares no círculo da clareira.",
      t5: "Falta o portão. Coloque no vão da cerca e feche com E. Eles vão precisar quebrar para entrar.",
      t6: "A noite está vindo. Fique dentro, conserte a cerca com E e madeira, e lute ao meu lado!",
    };
    return tips[id] ?? "Continue coletando. A ilha não perdoa quem para.";
  }
  updateBubbles(dt: number) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      if (b.t > b.dur) this.bubbles.splice(i, 1);
    }
    const tut = this.tutorial();
    const id = tut ? tut.id : "done";
    if (id !== this.lastTutId) {
      const first = this.lastTutId === "";
      this.lastTutId = id;
      if (!first && id !== "t0" && id !== "done") {
        this.say("rian", this.rianTipFor(id), 6);
        this.toast(this.rianTipFor(id), "rian");
      }
    }
  }

  updateAnimals(dt: number) {
    this.animalT += dt;
    if (this.animalT > 20) { this.animalT = 0; if (this.animals.length < 70) this.spawnAnimals(this.animals.length + 6); }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const dp = dist2(a.x, a.y, this.px, this.py);
      if (dp > 1500 * 1500) continue;
      a.t -= dt;
      a.flee = Math.max(0, a.flee - dt);
      if (dp < 150 * 150 && a.kind !== "goat") a.flee = 1.4;
      if (a.flee > 0) {
        const ang = Math.atan2(a.y - this.py, a.x - this.px) + Math.sin(a.t * 7) * 0.4;
        const sp = a.kind === "rabbit" ? 230 : 160;
        a.vx += (Math.cos(ang) * sp - a.vx) * Math.min(1, dt * 8);
        a.vy += (Math.sin(ang) * sp - a.vy) * Math.min(1, dt * 8);
      } else if (a.t <= 0) {
        a.t = 1.5 + Math.random() * 3;
        if (Math.random() < 0.55) { a.vx = 0; a.vy = 0; }
        else { const ang = Math.random() * Math.PI * 2; const sp = 30 + Math.random() * 30; a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp; }
      }
      if (Math.abs(a.vx) > 4) a.dir = a.vx > 0 ? 1 : -1;
      const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
      const t = this.tileAt(nx, ny);
      if (t !== T_WATER && t !== T_CAVE) { a.x = nx; a.y = ny; } else { a.vx = -a.vx; a.vy = -a.vy; }
      a.vx *= Math.pow(0.4, dt); a.vy *= Math.pow(0.4, dt);
    }
  }

  hitAnimal(a: Animal, dmg: number) {
    a.hp -= dmg;
    a.flee = 2.5;
    this.spawnParticles(a.x, a.y - 8, "#e04560", 8, 150);
    this.floaters.push({ x: a.x, y: a.y - 20, t: 0, text: `${dmg}`, c: "#ffd34d" });
    this.sfx.hit();
    if (a.hp <= 0) {
      const i = this.animals.indexOf(a);
      if (i >= 0) this.animals.splice(i, 1);
      const food = a.kind === "goat" ? 4 : a.kind === "goose" ? 3 : 2;
      for (let k = 0; k < food; k++) {
        const ang = Math.random() * Math.PI * 2;
        this.drops.push({ res: "food", x: a.x, y: a.y, vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80 - 40, n: 1, t: 0 });
      }
      if (a.kind === "goat") this.drops.push({ res: "fiber", x: a.x, y: a.y, vx: 0, vy: -60, n: 2, t: 0 });
      this.addScore(10);
      this.spawnParticles(a.x, a.y, "#f0d0a0", 12, 160);
    }
  }

  openChest(ch: Chest) {
    ch.opened = true;
    let k = 0;
    for (const res of Object.keys(ch.loot) as ResKey[]) {
      const n = ch.loot[res] ?? 0;
      for (let i = 0; i < n; i++) {
        const ang = (k++ / Math.max(1, n * 3)) * Math.PI * 2 + Math.random();
        this.drops.push({ res, x: ch.x, y: ch.y - 6, vx: Math.cos(ang) * 110, vy: Math.sin(ang) * 110 - 40, n: 1, t: 0 });
      }
    }
    this.spawnParticles(ch.x, ch.y - 10, "#ffe28a", 24, 220);
    this.sfx.quest();
    this.addScore(60);
    this.toast(`📦 ${ch.label} aberto!`);
  }

  /* ---------------- production ---------------- */
  updateStructures(dt: number) {
    const isDay = !this.isNight();
    for (const s of this.structures) {
      if (s.type === "farm" || s.type === "sawmill" || s.type === "quarry") {
        if (s.type === "farm" && !isDay) continue;
        s.prodT += dt;
        const period = s.type === "farm" ? 46 : s.type === "sawmill" ? 38 : 42;
        if (s.prodT >= period) {
          s.prodT = 0;
          const res: ResKey = s.type === "farm" ? "food" : s.type === "sawmill" ? "wood" : "stone";
          const near = this.drops.filter((dr) => dist2(dr.x, dr.y, s.x, s.y) < 80 * 80).length;
          if (near < 5) {
            const a = Math.random() * Math.PI * 2;
            this.drops.push({ res, x: s.x + Math.cos(a) * 26, y: s.y + Math.sin(a) * 26, vx: 0, vy: -40, n: 1, t: 0 });
            this.spawnParticles(s.x, s.y - 14, "#b8e87d", 5, 90);
          }
        }
      }
      if (s.type === "campfire") {
        if (dist2(s.x, s.y, this.px, this.py) < 110 * 110 && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + 2.2 * dt);
        }
      }
      if (isDay && (s.type === "wall" || s.type === "gate") && s.fenceStyle === "hedge" && s.hp < s.maxHp) {
        s.hp = Math.min(s.maxHp, s.hp + dt * 0.45);
      }
    }
  }

  /* ---------------- drops ---------------- */
  updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vx *= Math.pow(0.1, dt); d.vy *= Math.pow(0.1, dt);
      const dd = dist2(d.x, d.y, this.px, this.py);
      if (d.t > 0.4 && dd < 120 * 120) {
        // magnet
        const a = Math.atan2(this.py - d.y, this.px - d.x);
        const pull = dd < 40 * 40 ? 520 : 260;
        d.x += Math.cos(a) * pull * dt; d.y += Math.sin(a) * pull * dt;
      }
      if (d.t > 0.35 && dd < 26 * 26) {
        this.inv[d.res] += d.n;
        this.addScore(1);
        if (d.res === "wood" || d.res === "stone") this.gatheredWoodStone += d.n;
        if (d.res === "iron") this.questP[3] = Math.min(QUESTS[3].target, this.questP[3] + d.n);
        this.spawnParticles(this.px, this.py - 8, "#fff7c0", 4, 80);
        this.sfx.pickup();
        this.drops.splice(i, 1);
        this.checkQuests();
        continue;
      }
      if (d.t > 120) this.drops.splice(i, 1);
    }
  }

  /* ---------------- particles ---------------- */
  spawnParticles(x: number, y: number, c: string, n: number, speed: number) {
    const cap = this.particleCap;
    for (let i = 0; i < n && this.particles.length < cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        t: 0, max: 0.35 + Math.random() * 0.45, c, s: 2 + Math.random() * 3, grav: 300,
      });
    }
  }
  updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.max) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.3, dt);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt; f.y -= 34 * dt;
      if (f.t > 1.1) this.floaters.splice(i, 1);
    }
  }

  /* ---------------- day/night ---------------- */
  phaseLabel(): string {
    const t = this.time % CYCLE;
    if (t < MORNING_LEN) return "🌅 Manhã";
    if (t < DAY_LEN) return "☀️ Tarde";
    if (t < DAY_LEN + DUSK_LEN) return "🌆 Anoitecendo";
    if (t < DAY_LEN + DUSK_LEN + NIGHT_LEN) return "🌙 Noite";
    return "🌄 Amanhecer";
  }
  isNight(): boolean {
    const t = this.time % CYCLE;
    return t >= DAY_LEN + DUSK_LEN * 0.55 && t < DAY_LEN + DUSK_LEN + NIGHT_LEN + DAWN_LEN * 0.35;
  }
  darkness(): number {
    const t = this.time % CYCLE;
    if (t < DAY_LEN) return 0;
    if (t < DAY_LEN + DUSK_LEN) return ((t - DAY_LEN) / DUSK_LEN) * NIGHT_DARK;
    if (t < DAY_LEN + DUSK_LEN + NIGHT_LEN) return NIGHT_DARK;
    return NIGHT_DARK * (1 - (t - DAY_LEN - DUSK_LEN - NIGHT_LEN) / DAWN_LEN);
  }
  nearLight(): boolean {
    if (dist2(this.px, this.py, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r) return true;
    for (const s of this.structures) {
      if ((s.type === "campfire" || s.type === "forge" || s.type === "tower") && dist2(s.x, s.y, this.px, this.py) < 170 * 170) return true;
    }
    return false;
  }

  /* ---------------- zone detection ---------------- */
  zoneName(): string {
    if (dist2(this.px, this.py, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r) { this.visited.add("vilarejo"); return "Vilarejo de Porto Cinza"; }
    if (dist2(this.px, this.py, BASE.x, BASE.y) < BASE.r * BASE.r) return "Clareira da Base 🏕️";
    const site = SITES.find((entry) => dist2(this.px,this.py,entry.x,entry.y) < entry.radius ** 2);
    if (site) return site.name;
    const t = this.tileAt(this.px, this.py);
    if (t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) return "❄ Vale do Degelo";
    if (t === T_CAVE) { this.visited.add("caverna"); return "Caverna Uivante"; }
    if (t === T_ROCK) return "Encostas Rochosas";
    if (t === T_DARK) { this.visited.add("sombria"); return "⚠️ Floresta Sombria";  }
    if (t === T_SAND) return "Praia do Naufrágio";
    return "Floresta Verde";
  }

  /* ---------------- main loop ---------------- */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      this.rafId = requestAnimationFrame(loop);
      const cap = this.settings.fpsCap;
      if (cap > 0 && t - this.lastT < 1000 / cap - 1.2) return;
      let dt = (t - this.lastT) / 1000;
      this.lastT = t;
      if (dt > 0.1) dt = 0.1;
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsAcc);
        this.fpsFrames = 0;
        this.fpsAcc = 0;
        this.applyQuality();
      }
      this.frame(dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  frame(dt: number) {
    this.updateMusicTrack();
    const pad = this.pollGamepad();
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.12; }

    if (this.state === "cutscene") {
      this.cutT += dt;
      if (this.cutPhase === 0 && this.cutT > 4.2) this.cutPhase = 1;
      else if (this.cutPhase === 1 && this.cutT > 7.2) { this.cutPhase = 2; this.flashWhite = 1; this.shake = 20; this.sfx.noise(0.5, 0.8); }
      else if (this.cutPhase === 2 && this.cutT > 8.6) { this.cutPhase = 3; this.dialogueIdx = 0; }
      this.flashWhite = Math.max(0, this.flashWhite - dt * 1.2);
      this.shake = Math.max(0, this.shake - dt * 30);
      this.renderCutscene();
      return;
    }

    if (this.state === "playing" && !this.softPause) {
      this.update(dt, pad);
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    this.render();

    // periodic
    this.snapT += dt;
    if (this.snapT > 0.25) { this.snapT = 0; this.emitSnapshot(); }
    this.saveT += dt;
    if (this.saveT > 12 && this.state === "playing") { this.saveT = 0; this.saveGame(); }
    if (this.opts.mode === "multi" && this.opts.mp) {
      this.mpT += dt;
      if (this.mpT > 0.45) { this.mpT = 0; this.syncMp(); }
      // interp remotes
      for (const r of this.remotes) {
        r.x += (r.tx - r.x) * Math.min(1, dt * 7);
        r.y += (r.ty - r.y) * Math.min(1, dt * 7);
      }
    }
  }

  updateMusicTrack() {
    if (!this.music) return;
    let want: "lobby" | "day" | "night" | "siege" | "none" = "none";
    if (this.state === "cutscene") want = "night";
    else if (this.state === "victory") want = "lobby";
    else if (this.state === "playing" || this.state === "paused") {
      want = this.isNight() ? (this.underAttackNow() ? "siege" : "night") : "day";
    } else want = "night";
    if (this.music.current !== want) this.music.play(want);
  }

  update(dt: number, pad: { mx: number; my: number; run?: boolean }) {
    // --- time ---
    const prevNight = this.isNight();
    this.time += dt;
    const newDay = Math.floor(this.time / CYCLE) + 1;
    if (newDay > this.day) {
      this.day = newDay;
      this.survivedNight = true;
      this.addScore(100);
      this.toast(`🌅 Manhã do dia ${this.day}. O mapa está nítido — a base fica marcada em verde.`);
      this.sfx.quest();
    }
    if (!prevNight && this.isNight()) {
      this.toast("🌙 A noite é longa e o mapa escurece. Fique perto da luz!");
      this.sfx.night();
    }
    // --- movement input ---
    let mx = 0, my = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) my -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) my += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
    mx += pad.mx + this.touchMove.x;
    my += pad.my + this.touchMove.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    this.moving = ml > 0.1;
    const wantRun = this.keys.has("shift") || !!pad.run || this.touchBtn.run;
    this.running_ = wantRun && this.moving && this.stamina > 2;

    const baseSpeed = 196;
    let speed = this.running_ ? baseSpeed * 1.42 : baseSpeed;
    if (this.rollT > 0) speed = 540;

    if (this.rollT > 0) {
      this.rollT -= dt;
      const a = this.pdir;
      this.pvx += (Math.cos(a) * speed - this.pvx) * Math.min(1, dt * 14);
      this.pvy += (Math.sin(a) * speed - this.pvy) * Math.min(1, dt * 14);
    } else if (this.moving) {
      this.pdir = Math.atan2(my, mx);
      this.aimTarget = null;
      this.pvx += (mx * speed - this.pvx) * Math.min(1, dt * 11);
      this.pvy += (my * speed - this.pvy) * Math.min(1, dt * 11);
      this.walkCycle += dt * (this.running_ ? 13 : 9);
      if (Math.random() < dt * 6) this.spawnParticles(this.px, this.py + 12, "rgba(160,150,120,0.5)", 1, 30);
    } else {
      this.pvx *= Math.pow(0.0004, dt);
      this.pvy *= Math.pow(0.0004, dt);
    }

    // mira suave com mouse (sensibilidade configurável)
    if (this.aimTarget !== null && this.settings.controls === "kb-mouse" && !this.moving) {
      let diff = this.aimTarget - this.pdir;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.pdir += diff * Math.min(1, dt * (5 + this.settings.sensitivity * 9));
    }

    // stamina
    if (this.running_) this.stamina = Math.max(0, this.stamina - 13 * dt);
    else this.stamina = Math.min(100, this.stamina + (this.moving ? 8 : 17) * dt);

    // collision with water / structures / big nodes
    const tryMove = (nx: number, ny: number) => {
      if (this.tileAt(nx, ny) === T_WATER) return false;
      for (const s of this.structures) {
        if ((s.type === "wall" || s.type === "house" || s.type === "tower" || s.type === "forge") && dist2(s.x, s.y, nx, ny) < 24 * 24) return false;
      }
      return true;
    };
    const nx = this.px + this.pvx * dt;
    const ny = this.py + this.pvy * dt;
    if (tryMove(nx, this.py)) this.px = nx; else this.pvx = 0;
    if (tryMove(this.px, ny)) this.py = ny; else this.pvy = 0;
    const dryX = this.px, dryY = this.py;
    // soft push from trees/rocks in the nearby sectors only
    for (const n of this.nearbyNodes(this.px, this.py)) {
      if (n.hp <= 0) continue;
      if (n.type === "bush" || n.type === "berry") continue;
      const d2 = dist2(n.x, n.y, this.px, this.py);
      const r = 18;
      if (d2 < r * r && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        this.px += (this.px - n.x) * push * 0.6;
        this.py += (this.py - n.y) * push * 0.6;
      }
    }
    // A nearby tree must not push the player into an unwalkable water tile.
    if (this.tileAt(this.px, this.py) === T_WATER) { this.px = dryX; this.py = dryY; }
    this.px = clamp(this.px, TILE, WPX - TILE);
    this.py = clamp(this.py, TILE, HPX - TILE);

    // timers
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // Only depleted nodes need a respawn timer; there can be thousands of
    // intact trees, so do not iterate the whole island every frame.
    for (const n of this.depletedNodes) {
      n.respawn -= dt;
      if (n.respawn <= 0) {
        if (this.structures.some((st) => dist2(st.x,st.y,n.x,n.y) < 38*38)) n.respawn = 30;
        else { n.hp = n.maxHp; n.respawn = 0; this.depletedNodes.delete(n); }
      }
    }

    // touch attack hold -> repeated
    this.updateSpawns(dt);
    this.updateMonsters(dt);
    this.updateAllies(dt);
    this.updateStructures(dt);
    this.updateDrops(dt);
    this.updateParticles(dt);
    this.updateVillagers(dt);
    this.updateAnimals(dt);
    this.updateBubbles(dt);
    this.updateExploration(dt);
    this.updatePlacement();

    // interact hint
    this.interactHint = "";
    this.nearForge = false; this.nearBench = false;
    for (const s of this.structures) {
      if (dist2(s.x, s.y, this.px, this.py) < 70 * 70) {
        if (s.type === "campfire") this.interactHint = "E: Salvar na fogueira";
        if (s.type === "forge") { this.interactHint = "E: Abrir Forja"; this.nearForge = true; }
        if (s.type === "workbench") { this.interactHint = "E: Abrir Bancada"; this.nearBench = true; }
        if (s.type === "raft") this.interactHint = "E: Escapar da ilha!";
        if (s.type === "gate") this.interactHint = s.open ? "E: Fechar o portão" : "E: Abrir o portão";
        if (s.hp < s.maxHp) this.interactHint = `E: Reparar ${STRUCT_DEF[s.type].name} (🪵 ${4 + Math.floor((s.maxHp - s.hp) / 40)})`;
      }
    }
    for (const site of SITES) {
      if (dist2(this.px, this.py, site.x, site.y + 45) < 120 * 120) {
        this.interactHint = this.claimedSites.has(site.id) ? `E: Ler a história de ${site.name}` : `E: Explorar ${site.name}`;
        break;
      }
    }
    if (!this.interactHint) {
      for (const v of this.villagers) {
        if (dist2(v.x, v.y, this.px, this.py) < 60 * 60) { this.interactHint = "E: Conversar"; break; }
      }
    }

    this.checkQuests();

    // camera
    const tx = this.px - this.viewW / 2, ty = this.py - this.viewH / 2;
    const camLerp = Math.min(1, dt * (4 + this.settings.sensitivity * 4));
    this.camX += (tx - this.camX) * camLerp;
    this.camY += (ty - this.camY) * camLerp;
    this.camX = clamp(this.camX, 0, WPX - this.viewW);
    this.camY = clamp(this.camY, 0, HPX - this.viewH);
  }

  updateVillagers(dt: number) {
    for (const v of this.villagers) {
      v.t -= dt;
      if (v.t <= 0) {
        v.t = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        v.vx = Math.cos(a) * 40; v.vy = Math.sin(a) * 40;
        if (Math.random() < 0.4) { v.vx = 0; v.vy = 0; }
      }
      const nx = v.x + v.vx * dt, ny = v.y + v.vy * dt;
      if (dist2(nx, ny, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r * 0.6 && this.tileAt(nx, ny) !== T_WATER) { v.x = nx; v.y = ny; }
    }
  }

  /* ---------------- multiplayer sync ---------------- */
  async syncMp() {
    const mp = this.opts.mp;
    if (!mp) return;
    try {
      const res = await fetch("/api/mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync", code: mp.code, playerId: mp.playerId,
          state: { name: this.opts.playerName, x: this.px, y: this.py, hp: Math.round(this.hp), score: this.score, day: this.day },
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.players) {
        const list = data.players as { id: string; name: string; x: number; y: number; hp: number }[];
        for (const p of list) {
          const ex = this.remotes.find((r) => r.id === p.id);
          if (ex) { ex.tx = p.x; ex.ty = p.y; ex.hp = p.hp; ex.name = p.name; }
          else this.remotes.push({ id: p.id, name: p.name, x: p.x, y: p.y, tx: p.x, ty: p.y, hp: p.hp });
        }
        this.remotes = this.remotes.filter((r) => list.some((p) => p.id === r.id));
        this.teamScore = Number(data.teamScore ?? 0);
      }
    } catch { /* offline ok */ }
  }

  /* ---------------- snapshot ---------------- */
  emitSnapshot() {
    const buildOptions: BuildOption[] = BUILD_ORDER.map((t) => {
      const def = STRUCT_DEF[t];
      const cost = this.costFor(t);
      const lock = this.structLock(t);
      return {
        id: t, name: def.name, icon: def.icon, desc: def.desc, cost,
        affordable: this.canAfford(cost), locked: !!lock, lockReason: lock,
      };
    });
    const upgradeOptions: UpgradeOption[] = (["axe", "pick", "sword"] as ToolKey[]).map((t) => {
      const cost = this.upgradeCost(t, this.tools[t]);
      const lock = this.upgradeLock(t);
      return { tool: t, level: this.tools[t], nextLevel: this.tools[t] + 1, cost, affordable: this.canAfford(cost), locked: !!lock, lockReason: lock };
    });
    const snap: Snapshot = {
      state: this.state,
      hp: Math.ceil(this.hp), maxHp: this.maxHp, stamina: Math.round(this.stamina),
      inv: { ...this.inv }, tools: { ...this.tools },
      day: this.day, phaseLabel: this.phaseLabel(), isNight: this.isNight(),
      score: this.score, kills: this.kills, deaths: this.deaths,
      quests: QUESTS.map((q, i) => ({
        id: q.id, name: q.name, desc: q.desc, done: this.questDone[i],
        progress: Math.min(q.target, Math.round(this.questP[i])), target: q.target, reward: q.reward,
      })),
      allies: this.allies.map((a) => a.name),
      baseLevel: this.baseLevel(),
      buildOptions, upgradeOptions,
      raftReasons: this.raftBlockReasons(),
      canRespawn: !this.diff.permadeath,
      outcome: this.outcome,
      teamScore: this.teamScore,
      mpCount: this.remotes.length,
      zone: this.zoneName(),
      fps: this.fps,
      seenCreatures: [...this.seenCreatures], creatureKills: { ...this.creatureKills },
      discoveredSites: [...this.discoveredSites], claimedSites: [...this.claimedSites],
      equipment: { ...this.equipment }, heldTool: this.heldTool, renderScale: this.dpr,
      fenceStyle: this.fenceStyle,
      fenceStyles: (Object.keys(FENCE_DEF) as FenceStyle[]).map((id) => ({
        id, name: FENCE_DEF[id].name, desc: FENCE_DEF[id].desc, hp: this.structMaxHp("wall", id),
        cost: this.fenceStyleCost(id), locked: this.baseLevel() < FENCE_DEF[id].lockLevel,
      })),
      tutorial: this.tutorial(),
      underAttack: this.underAttackNow(),
      gateState: !this.structures.some((s) => s.type === "gate") ? "nenhum" : this.structures.some((s) => s.type === "gate" && s.open) ? "aberto" : "fechado",
      walls: this.structures.filter((s) => s.type === "wall").length,
      placing: this.placing ? {
        id: this.placing, name: STRUCT_DEF[this.placing].name, valid: !this.placeReason, reason: this.placeReason,
        facing: this.placing === "wall" || this.placing === "gate" ? "círculo" : Math.abs(this.placeRotation % Math.PI) > 0.1 ? "lado" : "frente",
      } : null,
      escort: this.escort.active,
      controlHints: this.settings.controls === "touch"
        ? ["Joystick mover", "⚔️ atacar", "✋ interagir", "🗺️ mapa"]
        : this.settings.controls === "gamepad"
          ? ["Analógico mover", "A atacar", "X interagir", "Y construir", "LB/RB arma", "Start pausa"]
          : ["WASD mover", "J atacar", "E interagir", "B construir", "M mapa", "1/2/3 arma", "Espaço rolar", "Shift correr", "F comer", "ESC pausa"],
    };
    this.opts.onUi({ type: "snapshot", snap });
  }

  /* =========================================================
     RENDER
     ========================================================= */
  render() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const ox = -Math.round(this.camX + shx), oy = -Math.round(this.camY + shy);

    // terrain (baked chunks) + animated water
    const x0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(this.camY / TILE) - 1);
    const x1 = Math.min(W - 1, Math.ceil((this.camX + this.viewW) / TILE) + 1);
    const y1 = Math.min(H - 1, Math.ceil((this.camY + this.viewH) / TILE) + 1);
    const tnow = performance.now() / 1000;
    c.imageSmoothingEnabled = false;
    if (this.terrain) this.terrain.draw(c, this.camX, this.camY, this.viewW, this.viewH, ox, oy, tnow);
    drawWaterAnim(c, this.tiles, W, H, TILE, x0, y0, x1, y1, ox, oy, tnow);

    // base clearing — stone posts so the camp is visible from far
    c.strokeStyle = "rgba(226,194,122,0.55)";
    c.lineWidth = 2; c.setLineDash([10, 8]);
    c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, BASE.r * 0.72, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(214,196,120,0.14)";
    c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, BASE.r * 0.5, 0, Math.PI * 2); c.fill();

    // Join adjacent fence posts before drawing the individual posts above them.
    this.drawFenceConnections(ox, oy);

    // plane wreck at crash site
    this.drawWreck(CRASH.x + ox, CRASH.y + oy);

    // collect drawables sorted by y
    interface DrawItem { y: number; fn: () => void; }
    const items: DrawItem[] = [];
    const camL = this.camX - 80, camR = this.camX + this.viewW + 80, camT = this.camY - 230, camB = this.camY + this.viewH + 80;
    const inView = (x: number, y: number) => x > camL && x < camR && y > camT && y < camB;

    for (let by = Math.floor(camT / 128); by <= Math.floor(camB / 128); by++) {
      for (let bx = Math.floor(camL / 128); bx <= Math.floor(camR / 128); bx++) {
        const bucket = this.nodeBuckets.get(bx + by * 64);
        if (!bucket) continue;
        for (const n of bucket) {
          if (!inView(n.x, n.y) || (n.hp <= 0 && n.type !== "tree" && n.type !== "pine")) continue;
          items.push({ y: n.y, fn: () => this.drawNode(n, ox, oy, tnow) });
        }
      }
    }
    for (const s of this.structures) {
      if (!inView(s.x, s.y)) continue;
      items.push({ y: s.y, fn: () => this.drawStructure(s, ox, oy, tnow) });
    }
    for (const m of this.monsters) {
      if (!inView(m.x, m.y)) continue;
      items.push({ y: m.y, fn: () => this.drawMonster(m, ox, oy, tnow) });
    }
    for (const v of this.villagers) {
      if (!inView(v.x, v.y)) continue;
      items.push({ y: v.y, fn: () => this.drawHumanoid(v.x + ox, v.y + oy, v.look, Math.atan2(this.py - v.y, this.px - v.x), Math.hypot(v.vx, v.vy) > 8, tnow * 6) });
    }
    for (const al of this.allies) {
      if (al.downT > 0 || !inView(al.x, al.y)) continue;
      const walking = Math.hypot(al.vx, al.vy) > 20;
      items.push({ y: al.y, fn: () => {
        const pace = Math.hypot(al.vx, al.vy);
        this.drawHumanoid(al.x + ox, al.y + oy, al.id, al.dir, walking, tnow * (pace > 210 ? 13 : 9), 1, al.atkCd > 0.48 ? "attack" : pace > 210 ? "run" : walking ? "walk" : undefined, al.atkCd > 0.48 ? undefined : al.id === "bren" ? "pick" : al.id === "tito" ? "axe" : "sword", 2);
        if (al.atkCd > 0.48) this.drawAllyWeapon(al.x + ox, al.y + oy, al.dir - 0.7 + (0.7-al.atkCd)*8, al.id, walking ? tnow * 9 : 0);
        this.drawName(al.name, al.x + ox, al.y + oy - 99, "#ffe9b0");
      } });
    }
    for (const r of this.remotes) {
      if (!inView(r.x, r.y)) continue;
      items.push({ y: r.y, fn: () => { this.drawHumanoid(r.x + ox, r.y + oy, "remote", 0, true, tnow * 8); this.drawName(r.name, r.x + ox, r.y + oy - 99, "#b7dcff"); } });
    }
    for (const a of this.animals) {
      if (!inView(a.x, a.y)) continue;
      items.push({ y: a.y, fn: () => this.drawAnimal(a, ox, oy, tnow) });
    }
    for (const ch of this.chests) {
      if (!inView(ch.x, ch.y)) continue;
      items.push({ y: ch.y, fn: () => this.drawChest(ch, ox, oy, tnow) });
    }
    for (const prop of this.worldProps) {
      if (!inView(prop.x,prop.y)) continue;
      items.push({ y: prop.y, fn: () => { this.drawShadow(prop.x + ox, prop.y + oy, prop.sprite === "ice_deity" ? 65 : 40); drawSprite(c, prop.sprite, prop.x + ox, prop.y + oy); } });
    }
    for (const [hx, hy] of [[-120, -60], [110, -80], [-90, 90], [120, 70], [0, -130]]) {
      const x = VILLAGE.x + hx, y = VILLAGE.y + hy + 24;
      if (inView(x, y)) items.push({ y, fn: () => drawSprite(c, "hut", x + ox, y + oy) });
    }
    if (inView(BASE.x, BASE.y)) items.push({ y: BASE.y, fn: () => drawFlag(c, BASE.x + ox, BASE.y + oy, tnow) });
    if (inView(VILLAGE.x, VILLAGE.y - 50)) items.push({ y: VILLAGE.y - 30, fn: () => drawSign(c, VILLAGE.x + ox, VILLAGE.y - 46 + oy, "VILAREJO", "#ffd34d") });
    if (inView(CAVE.x, CAVE.y + CAVE.r)) items.push({ y: CAVE.y + CAVE.r * 0.8, fn: () => drawSign(c, CAVE.x + ox, CAVE.y + CAVE.r * 0.72 + oy, "CAVERNA", "#d0b0ff") });
    if (inView(150 * TILE, 96 * TILE)) items.push({ y: 96 * TILE, fn: () => drawSign(c, 150 * TILE + ox, 96 * TILE + oy, "SOMBRIA", "#9fd0a0") });
    if (inView(CRASH.x, CRASH.y - 70)) items.push({ y: CRASH.y - 50, fn: () => drawSign(c, CRASH.x + ox, CRASH.y - 78 + oy, "BASE ↑", "#b6ffc9") });
    // player
    items.push({ y: this.py, fn: () => this.drawPlayer(ox, oy, tnow) });

    for (const d of this.drops) {
      if (!inView(d.x, d.y)) continue;
      items.push({ y: d.y - 1000, fn: () => this.drawDrop(d, ox, oy, tnow) });
    }

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();

    // projectiles
    for (const p of this.projectiles) {
      c.fillStyle = "#9be04a";
      c.beginPath(); c.arc(p.x + ox, p.y + oy, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(155,224,74,0.4)";
      c.beginPath(); c.arc(p.x + ox - p.vx * 0.02, p.y + oy - p.vy * 0.02, 4, 0, Math.PI * 2); c.fill();
    }

    // particles
    for (const p of this.particles) {
      const a = 1 - p.t / p.max;
      c.globalAlpha = a;
      c.fillStyle = p.c;
      c.fillRect(p.x + ox - p.s / 2, p.y + oy - p.s / 2, p.s, p.s);
    }
    c.globalAlpha = 1;

    this.drawPlacement(ox, oy);

    // darkness + lights
    this.renderLights(ox, oy);
    this.drawBubbles(ox, oy);
    const climate = this.tileAt(this.px, this.py);
    if (climate === T_SNOW || climate === T_ICE || climate === T_SNOW_PATH) {
      c.fillStyle = "rgba(235,250,249,0.66)";
      const flakes = this.settings.quality === "leve" ? 14 : 30;
      for (let i=0;i<flakes;i++) {
        const x = (i * 149.1 + tnow * (9 + i%4) + Math.sin(tnow + i)*12) % this.viewW;
        const y = (i * 137.3 + tnow * (20 + i%9)) % this.viewH;
        c.fillRect(Math.round(x),Math.round(y),i%3===0?3:2,2);
      }
    }

    // floaters
    c.font = "800 14px Nunito, 'Trebuchet MS', system-ui, sans-serif";
    c.textAlign = "center";
    for (const f of this.floaters) {
      c.globalAlpha = clamp(1.3 - f.t, 0, 1);
      c.fillStyle = "#000"; c.fillText(f.text, f.x + ox + 1, f.y + oy + 1);
      c.fillStyle = f.c; c.fillText(f.text, f.x + ox, f.y + oy);
    }
    c.globalAlpha = 1;

    // hurt vignette
    if (this.hurtFlash > 0) {
      c.fillStyle = `rgba(200,30,30,${this.hurtFlash * 0.55})`;
      c.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.flashWhite > 0) {
      c.fillStyle = `rgba(255,255,255,${this.flashWhite})`;
      c.fillRect(0, 0, this.viewW, this.viewH);
    }

    // Text, item slots and minimap are independent from the 120 Hz world.
    // Cache them at 20 Hz (or immediately after a health change).
    const hudNow = performance.now();
    if (this.hudCv) {
      if (hudNow - this.hudAt >= 50 || this.hudHp !== Math.ceil(this.hp)) {
        const hud = this.hudCv.getContext("2d");
        if (hud) {
          this.ctx = hud;
          hud.setTransform(1,0,0,1,0,0); hud.clearRect(0,0,this.viewW,this.viewH);
          try { this.renderHud(); } finally { this.ctx = c; }
          this.hudAt = hudNow; this.hudHp = Math.ceil(this.hp);
        }
      }
      c.drawImage(this.hudCv,0,0,this.viewW,this.viewH);
    } else this.renderHud();
    this.drawBasePointer();
    if (this.mapOpen) this.renderAtlas();
  }

  drawAllyWeapon(x: number, y: number, dir: number, id: string, cycle = 0) {
    const tool: ToolKey = id === "bren" ? "pick" : id === "tito" ? "axe" : "sword";
    const gripX = x + Math.cos(dir) * 13 + (Math.cos(dir) >= 0 ? 4 : -4);
    drawToolSprite(this.ctx, tool, gripX, y - 23 + Math.sin(cycle) * 2, dir + 0.68, 1.55, 1, id === "maya" ? 3 : 2);
  }

  renderLights(ox: number, oy: number) {
    const dark = this.darkness();
    const t = this.tileAt(this.px, this.py);
    const zoneDark = t === T_CAVE ? 0.78 : t === T_DARK ? 0.59 : 0;
    // Even at noon the distant forest disappears into a light vignette.
    const total = Math.max(0.48, dark, zoneDark);
    if (!this.lightCv) return;
    const lc = this.lightCv.getContext("2d");
    if (!lc) return;
    const s = 1 / 3;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = `rgba(8,8,24,${total})`;
    lc.clearRect(0, 0, this.lightCv.width, this.lightCv.height);
    lc.fillRect(0, 0, this.lightCv.width, this.lightCv.height);
    lc.globalCompositeOperation = "destination-out";
    const stamp = this.lightStamp;
    const hole = (x: number, y: number, r: number, str: number) => {
      if (!stamp || x + r < 0 || y + r < 0 || x - r > this.viewW || y - r > this.viewH) return;
      lc.globalAlpha = str;
      lc.drawImage(stamp, (x-r)*s, (y-r)*s, r*2*s, r*2*s);
      lc.globalAlpha = 1;
    };
    // A shorter sight range in daylight and a tighter torch radius at night.
    const night = this.darkness();
    hole(this.px + ox, this.py + oy, 450 - night * 315, 0.96);
    for (const st of this.structures) {
      if (Math.abs(st.x + ox) > this.viewW + 280 || Math.abs(st.y + oy) > this.viewH + 280) continue;
      if (st.type === "campfire") hole(st.x + ox, st.y + oy, 225, 0.97);
      if (st.type === "forge") hole(st.x + ox, st.y + oy, 130, 0.82);
      if (st.type === "tower") hole(st.x + ox, st.y + oy, 175, 0.75);
    }
    if (Math.abs(VILLAGE.x + ox) < this.viewW + 330 && Math.abs(VILLAGE.y + oy) < this.viewH + 330)
      hole(VILLAGE.x + ox, VILLAGE.y + oy, 280, 0.8);
    const c = this.ctx;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.lightCv, 0, 0, this.lightCv.width, this.lightCv.height, 0, 0, this.viewW, this.viewH);
    c.imageSmoothingEnabled = false;
    // moonlight tint
    c.fillStyle = `rgba(40,50,120,${total * 0.18})`;
    c.fillRect(0, 0, this.viewW, this.viewH);
  }

  drawShadow(x: number, y: number, r: number) {
    const c = this.ctx;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath(); c.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  }

  drawNode(n: RNode, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = n.x + ox, y = n.y + oy;
    const wob = n.wob > 0 && n.wob < 1 ? Math.sin(n.wob * Math.PI * 6) * 3 * (1 - n.wob) : 0;
    const hpr = n.hp / n.maxHp;
    if (n.hp <= 0) { drawSprite(c, "stump", x, y + 4); return; }
    const dark = this.tileAt(n.x, n.y) === T_DARK;
    if (n.type === "tree" || n.type === "pine") {
      const sway = Math.round(Math.sin(tnow * 1.1 + n.x * 0.01) * 1.5 + wob);
      const name = n.skin ?? (n.type === "tree" ? (dark ? "tree_dark" : "tree") : dark ? "pine_dark" : "pine");
      this.drawShadow(x, y + 4, 23);
      const behind = Math.abs(this.px - n.x) < 42 && this.py < n.y && this.py > n.y - 110;
      drawSprite(c, name, x, y + 4, { dx: sway, flip: (Math.floor(n.x) & 1) === 1, alpha: behind ? 0.45 : 1 });
    } else {
      this.drawShadow(x, y + 3, 14);
      drawSprite(c, n.skin ?? n.type, x, y + 4, { dx: Math.round(wob) });
    }
    if (hpr < 1) {
      const top = n.type === "tree" || n.type === "pine" ? y - 86 : y - 42;
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 16, top, 32, 5);
      c.fillStyle = "#8ae06a"; c.fillRect(x - 16, top, 32 * hpr, 5);
    }
  }

  drawPalisadePost(x: number, y: number, rotation: number, alpha = 1, tint?: string) {
    const c = this.ctx;
    c.save(); c.translate(x,y); c.globalAlpha *= alpha;
    // The footprint follows the ring; the sharpened log remains upright in the
    // top-down projection, so it never looks like a spike lying on the floor.
    c.save();c.rotate(rotation);c.fillStyle="rgba(24,16,12,.42)";c.beginPath();c.ellipse(0,5,11,5,0,0,Math.PI*2);c.fill();
    c.fillStyle=tint??"#3d291d";c.fillRect(-11,1,22,5);c.fillStyle=tint??"#8a5b38";c.fillRect(-9,1,18,2);c.restore();
    c.fillStyle = tint ?? "#40281b"; c.fillRect(-7,-20,14,25);
    c.fillStyle = tint ?? "#7d4e31"; c.fillRect(-5,-19,10,23);
    c.fillStyle = tint ?? "#b97746"; c.fillRect(-3,-18,6,21);
    c.fillStyle = tint ?? "#dd9d60"; c.fillRect(-2,-17,2,18);
    c.fillStyle = tint ?? "#40281b"; c.beginPath(); c.moveTo(-8,-19);c.lineTo(0,-33);c.lineTo(8,-19);c.closePath();c.fill();
    c.fillStyle = tint ?? "#a4683f"; c.beginPath(); c.moveTo(-5,-19);c.lineTo(0,-29);c.lineTo(4,-19);c.closePath();c.fill();
    c.fillStyle = tint ?? "#edbd7a"; c.beginPath(); c.moveTo(-2,-20);c.lineTo(0,-27);c.lineTo(0,-20);c.closePath();c.fill();
    for(const yy of [-14,-2]) {c.fillStyle="#282a2f";c.fillRect(-8,yy,16,5);c.fillStyle="#6d7b82";c.fillRect(-7,yy,14,2);c.fillStyle="#d4dadd";c.fillRect(-5,yy,2,1);c.fillRect(4,yy,1,1);}
    c.strokeStyle="#d4aa67";c.lineWidth=2;c.beginPath();c.moveTo(-7,-8);c.lineTo(7,-5);c.moveTo(-7,-5);c.lineTo(7,-8);c.stroke();
    c.fillStyle="#f1d59a";c.fillRect(5,-8,2,2);
    // Tangent-facing triangular brace at the bottom.
    c.save();c.rotate(rotation);c.fillStyle=tint??"#5a3924";c.beginPath();c.moveTo(-3,3);c.lineTo(14,9);c.lineTo(11,12);c.lineTo(0,7);c.closePath();c.fill();c.restore();
    c.restore();
  }
  drawPalisadeGate(s: Structure, x: number, y: number, alpha = 1, tint?: string) {
    const c=this.ctx, sideView=Math.abs(Math.sin(s.rotation))>Math.abs(Math.cos(s.rotation));
    c.save();c.translate(x,y);c.globalAlpha*=alpha;
    const half=sideView?12:27;
    const pillar=(px:number)=>{
      c.fillStyle="rgba(20,14,12,.38)";c.beginPath();c.ellipse(px,7,12,5,0,0,Math.PI*2);c.fill();
      c.fillStyle=tint??"#40281b";c.fillRect(px-8,-31,16,37);c.fillStyle=tint??"#865536";c.fillRect(px-6,-29,12,34);c.fillStyle=tint??"#c1844e";c.fillRect(px-4,-28,4,31);
      c.fillStyle="#292b30";c.fillRect(px-9,-19,18,5);c.fillRect(px-9,-4,18,5);c.fillStyle="#78868c";c.fillRect(px-8,-19,16,2);
      c.fillStyle=tint??"#4d2e1d";c.beginPath();c.moveTo(px-9,-30);c.lineTo(px,-43);c.lineTo(px+9,-30);c.closePath();c.fill();c.fillStyle=tint??"#c2824c";c.beginPath();c.moveTo(px-5,-30);c.lineTo(px,-38);c.lineTo(px+4,-30);c.closePath();c.fill();
    };pillar(-half);pillar(half);
    // Side view is deliberately narrower, front view shows every plank.
    const leafWidth=half-2;
    const leaf=(side:number,open:number)=>{c.save();c.translate(side*(half-2),-8);c.rotate(side*open);const left=side<0?-leafWidth:0;
      c.fillStyle=tint??"#43291a";c.fillRect(left,-20,leafWidth,35);
      const count=sideView?2:4,plank=Math.max(4,Math.floor(leafWidth/count));
      for(let i=0;i<count;i++){const lx=left+i*plank;c.fillStyle=tint??(i%2?"#875333":"#a86b40");c.fillRect(lx,-19,plank-1,33);c.fillStyle=tint??"#d09358";c.fillRect(lx+1,-18,2,30);c.fillStyle=tint??"#4d2e1d";c.beginPath();c.moveTo(lx,-19);c.lineTo(lx+plank/2,-27);c.lineTo(lx+plank-1,-19);c.closePath();c.fill();}
      c.fillStyle="#303238";c.fillRect(left,-10,leafWidth,5);c.fillRect(left,6,leafWidth,5);c.fillStyle="#7a878c";c.fillRect(left,-10,leafWidth,2);c.fillRect(left,6,leafWidth,2);c.restore();
    };leaf(-1,s.open?-.95:0);leaf(1,s.open?.95:0);
    if(!s.open){c.fillStyle="#d0a55a";c.fillRect(-6,-12,12,8);c.fillStyle="#5d411f";c.fillRect(-2,-10,4,4);c.fillStyle="#f0d17d";c.fillRect(-1,-10,1,2);}
    c.restore();
  }

  drawRusticPost(x: number, y: number, rotation: number, alpha = 1, tint?: string) {
    const c=this.ctx;c.save();c.translate(x,y);c.globalAlpha*=alpha;
    c.save();c.rotate(rotation);c.fillStyle="rgba(30,20,12,.34)";c.beginPath();c.ellipse(0,5,10,4,0,0,Math.PI*2);c.fill();c.restore();
    c.fillStyle=tint??"#5c3b29";c.fillRect(-7,-23,14,28);c.fillStyle=tint??"#9a6a48";c.fillRect(-5,-22,10,26);c.fillStyle=tint??"#c89668";c.fillRect(-3,-21,3,24);
    c.fillStyle=tint??"#e0b681";c.fillRect(-2,-20,1,16);c.fillStyle="#4d3326";c.fillRect(-7,-8,14,3);c.fillRect(-7,1,14,3);c.fillStyle="#a87852";c.fillRect(-6,-8,12,1);c.fillRect(-6,1,12,1);
    c.fillStyle="#38261d";c.fillRect(-1,-15,2,2);c.restore();
  }
  drawStonePost(x:number,y:number,rotation:number,alpha=1,tint?:string){
    const c=this.ctx;c.save();c.translate(x,y);c.globalAlpha*=alpha;
    c.save();c.rotate(rotation);c.fillStyle="rgba(20,24,28,.34)";c.beginPath();c.ellipse(0,6,12,5,0,0,Math.PI*2);c.fill();c.restore();
    const dark=tint??"#56626b",mid=tint??"#84939c",light=tint??"#bac6ca";
    c.fillStyle=dark;c.fillRect(-9,-26,18,31);c.fillStyle=mid;c.fillRect(-7,-24,14,27);c.fillStyle=light;c.fillRect(-6,-23,5,5);c.fillRect(1,-13,5,5);c.fillRect(-5,-3,6,5);
    c.strokeStyle="#424b52";c.lineWidth=2;for(const yy of [-17,-7]){c.beginPath();c.moveTo(-8,yy);c.lineTo(8,yy);c.stroke();}
    c.fillStyle="#3d464d";c.fillRect(-11,-29,22,5);c.fillStyle=light;c.fillRect(-9,-28,18,2);c.restore();
  }
  drawHedgePost(x:number,y:number,rotation:number,alpha=1,tint?:string){
    const c=this.ctx;this.drawRusticPost(x,y,rotation,alpha,tint??"#665039");c.save();c.globalAlpha*=alpha;
    const leaves=[[x-8,y-18,7],[x+5,y-22,8],[x-3,y-29,7],[x+8,y-10,6],[x-7,y-6,6]];
    for(let i=0;i<leaves.length;i++){const [lx,ly,r]=leaves[i];c.fillStyle=tint??(i%2?"#568846":"#79aa50");c.beginPath();c.ellipse(lx,ly,r,r*.72,0,0,Math.PI*2);c.fill();c.fillStyle=tint??"#a7c76b";c.fillRect(lx-2,ly-r/2,3,2);}
    c.restore();
  }
  drawFencePost(style:FenceStyle,x:number,y:number,rotation:number,alpha=1,tint?:string){
    if(style==="rustic")this.drawRusticPost(x,y,rotation,alpha,tint);
    else if(style==="stone")this.drawStonePost(x,y,rotation,alpha,tint);
    else if(style==="hedge")this.drawHedgePost(x,y,rotation,alpha,tint);
    else this.drawPalisadePost(x,y,rotation,alpha,tint);
  }
  drawStyledGate(s:Structure,x:number,y:number,alpha=1,tint?:string){
    if(s.fenceStyle==="stone"){
      this.drawPalisadeGate(s,x,y,alpha,tint??"#7d8990");
      this.drawStonePost(x-27,y,s.rotation,alpha,tint);this.drawStonePost(x+27,y,s.rotation,alpha,tint);
    }else if(s.fenceStyle==="hedge"){
      this.drawPalisadeGate(s,x,y,alpha,tint??"#6b7442");
      this.drawHedgePost(x-27,y,s.rotation,alpha,tint);this.drawHedgePost(x+27,y,s.rotation,alpha,tint);
    }else this.drawPalisadeGate(s,x,y,alpha,tint??(s.fenceStyle==="rustic"?"#aa7952":undefined));
  }
  drawStructure(s: Structure, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = s.x + ox, y = s.y + oy;
    if(s.type==="wall") {
      this.drawFencePost(s.fenceStyle,x,y+5,s.rotation);
      if(s.hp<s.maxHp) this.drawStructureHealth(s,x,y-35);
      return;
    }
    if(s.type==="gate") {
      this.drawStyledGate(s,x,y+5);
      if(s.hp<s.maxHp) this.drawStructureHealth(s,x,y-50);
      return;
    }
    let name: string = s.type;
    if (s.type === "campfire") name = Math.floor(tnow * 8) % 2 ? "campfire1" : "campfire0";
    const sz = spriteSize(name);
    this.drawShadow(x, y + 4, Math.max(14, sz.w * 0.42));
    c.save();c.translate(x,y+6);c.rotate(s.rotation);drawSprite(c,name,0,0);c.restore();
    if (s.type === "campfire") {
      if (Math.random() < 0.13) this.particles.push({ x: s.x + (Math.random() - 0.5) * 10, y: s.y - 22, vx: (Math.random() - 0.5) * 20, vy: -55, t: 0, max: 0.8, c: Math.random() < 0.5 ? "#ffb347" : "#ff7a2a", s: 3, grav: -50 });
      const g = 0.35 + Math.sin(tnow * 9) * 0.08;c.fillStyle = `rgba(255,150,60,${g * 0.35})`;c.beginPath(); c.arc(x, y - 10, 40, 0, Math.PI * 2); c.fill();
    }
    if (s.type === "forge") {const g = Math.sin(tnow * 7) * 0.5 + 0.5;c.fillStyle = `rgba(255,120,40,${0.15 + g * 0.15})`;c.beginPath(); c.arc(x, y - 16, 30, 0, Math.PI * 2); c.fill();}
    if (s.type === "tower") {c.fillStyle = `rgba(255,220,120,${0.18 + Math.sin(tnow * 3) * 0.06})`;c.beginPath(); c.arc(x, y - 100, 26, 0, Math.PI * 2); c.fill();}
    if(s.hp<s.maxHp)this.drawStructureHealth(s,x,y-sz.h-12);
  }
  drawStructureHealth(s:Structure,x:number,top:number){
    const c=this.ctx,hpr=clamp(s.hp/s.maxHp,0,1);c.fillStyle="rgba(0,0,0,.65)";c.fillRect(x-18,top,36,5);c.fillStyle=hpr>.5?"#8ae06a":hpr>.25?"#e0c14a":"#e04a4a";c.fillRect(x-18,top,36*hpr,5);
  }

  drawAnimal(a: Animal, ox: number, oy: number, tnow: number) {
    const x = a.x + ox, y = a.y + oy;
    const moving = Math.hypot(a.vx, a.vy) > 6;
    const hop = moving && a.kind === "rabbit" ? -Math.abs(Math.sin(tnow * 14)) * 6 : moving ? -Math.abs(Math.sin(tnow * 10)) * 2 : 0;
    this.drawShadow(x, y + 2, a.kind === "goat" ? 16 : 10);
    drawSprite(this.ctx, a.kind, x, y + 2, { flip: a.dir < 0 ? a.kind !== "goat" : a.kind === "goat", dy: hop });
    if (a.hp < (a.kind === "goat" ? 26 : a.kind === "goose" ? 14 : 10)) {
      const c = this.ctx;
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 10, y - 40, 20, 3);
      c.fillStyle = "#e04a4a"; c.fillRect(x - 10, y - 40, 20 * clamp(a.hp / 26, 0, 1), 3);
    }
  }

  drawChest(ch: Chest, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = ch.x + ox, y = ch.y + oy;
    this.drawShadow(x, y + 3, 20);
    drawSprite(c, ch.opened ? "chest_open" : "chest", x, y + 4);
    if (!ch.opened) {
      const g = 0.5 + Math.sin(tnow * 4) * 0.4;
      c.fillStyle = `rgba(255,226,138,${g * 0.55})`;
      c.beginPath(); c.arc(x, y - 36 - Math.sin(tnow * 3) * 3, 3, 0, Math.PI * 2); c.fill();
    }
  }

  drawWreck(x: number, y: number) {
    const c = this.ctx;
    if (x < -200 || x > this.viewW + 200 || y < -200 || y > this.viewH + 200) return;
    this.drawShadow(x, y + 12, 50);
    c.save();
    c.translate(x, y);
    c.rotate(-0.3);
    c.fillStyle = "#b9c0c9";
    c.beginPath(); c.ellipse(0, 0, 58, 14, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#8f98a3";
    c.fillRect(-14, -30, 10, 32);
    c.fillRect(-40, -4, 20, 8);
    c.fillStyle = "#3a3f47";
    for (let i = 0; i < 4; i++) c.fillRect(8 + i * 11, -7, 7, 7);
    c.restore();
  }

  drawHumanoid(x: number, y: number, lookId: string, dir: number, walking: boolean, cycle: number, alpha = 1, action?: "walk" | "run" | "attack", carryTool?: ToolKey, toolLevel = 1) {
    this.drawShadow(x, y + 2, 13);
    drawCharacter(this.ctx, lookId, x, y + 2, dir, walking, cycle, { alpha, action, carryTool, toolLevel });
  }

  drawName(name: string, x: number, y: number, color: string) {
    const c = this.ctx;
    c.font = "700 11px Nunito, 'Trebuchet MS', system-ui, sans-serif";
    c.textAlign = "center";
    c.fillStyle = "rgba(0,0,0,0.6)"; c.fillText(name, x + 1, y + 1);
    c.fillStyle = color; c.fillText(name, x, y);
  }

  drawPlayer(ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = this.px + ox, y = this.py + oy;
    const blink = this.invulnT > 0 && Math.sin(tnow * 40) > 0;
    if (this.rollT > 0) {
      c.save(); c.translate(x, y - 20); c.rotate((0.26 - this.rollT) * 24 * (Math.cos(this.pdir) >= 0 ? 1 : -1)); c.translate(-x, -(y - 20));
    }
    const attacking = this.attackT > 0;
    const action = attacking ? "attack" : this.running_ && this.moving ? "run" : this.moving ? "walk" : undefined;
    const carry = !attacking ? this.heldTool : undefined;
    this.drawHumanoid(x, y, "player", this.pdir, this.moving, this.walkCycle, blink ? 0.45 : 1, action, carry, this.tools[this.heldTool]);
    const tool = attacking ? this.swingTool : this.heldTool;
    const level = this.tools[tool];
    const handX = x + Math.cos(this.pdir) * (attacking ? 19 : 13) + (Math.cos(this.pdir) >= 0 ? 4 : -4);
    const stride = this.moving ? Math.sin(this.walkCycle * 1.3) * (this.running_ ? 4 : 2) : 0;
    const handY = y - 24 + (attacking ? -3 : stride);
    if (attacking) {
      const prog = 1 - this.attackT / 0.22;
      const eased = 1 - Math.pow(1 - clamp(prog, 0, 1), 2);
      const a = this.pdir - 1.12 + eased * 2.24;
      drawToolSprite(c, tool, handX, handY, a, 2.05, blink ? 0.5 : 1, level);
      c.strokeStyle = level >= 4 ? "rgba(155,240,250,0.65)" : "rgba(255,245,198,0.46)";
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y - 22, 39, this.pdir - 1.12, this.pdir - 1.12 + eased * 2.24); c.stroke();
    }
    if (this.rollT > 0) c.restore();
    this.drawName(this.opts.playerName, x, y - 99, "#dff1ff");
  }

  drawMonster(m: Monster, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = m.x + ox, y = m.y + oy;
    const flash = m.flash > 0;
    const windup = m.state === "windup";
    const floating = m.skin === "ghost" || m.skin === "wraith" || m.skin === "demonbat";
    const moving = m.state === "chase" || m.state === "attack";
    const cadence = m.type === "imp" ? 16 : m.type === "hulk" ? 5 : 9;
    const phase = tnow * cadence + m.home.x * 0.017;
    const bob = floating ? Math.sin(phase * 0.38) * 5 - 7 : moving ? -Math.abs(Math.sin(phase)) * (m.type === "hulk" ? 2 : 4) : 0;
    const flip = Math.cos(m.dir) < 0;
    this.drawShadow(x, y + 4, m.r + 2);
    if (windup) {
      const pulse = 0.5 + 0.5 * Math.sin(tnow * 22);
      c.strokeStyle = `rgba(255,72,56,${0.32 + pulse * 0.48})`;
      c.lineWidth = m.type === "hulk" || m.type === "brute" ? 3 : 2;
      c.beginPath(); c.ellipse(x, y + 5, m.r + 18 + pulse * 5, (m.r + 18 + pulse * 5) * 0.34, 0, 0, Math.PI * 2); c.stroke();
    }
    c.save();
    c.translate(x, y + 4);
    if (windup) c.scale(1.18, 0.84);
    else if (m.state === "attack") c.scale(0.92, 1.15);
    else if (m.state === "hurt") c.rotate(Math.sin(phase) * 0.085);
    else if (moving && !floating) c.rotate(Math.sin(phase) * (m.type === "hulk" ? 0.025 : 0.045));
    drawSprite(c, m.skin, 0, 0, { flip, dy: bob, alpha: floating ? 0.9 : 1 });
    if (flash) drawSprite(c, m.skin, 0, 0, { flip, dy: bob, tint: "#ffffff", alpha: 0.75 });
    else if (windup) drawSprite(c, m.skin, 0, 0, { flip, dy: bob, tint: "#ff4040", alpha: 0.25 + Math.sin(tnow * 28) * 0.12 });
    c.restore();
    if (m.state === "attack" && m.type !== "spitter") {
      const reach = m.r + 20;
      c.strokeStyle = "rgba(255,185,110,0.56)";
      c.lineWidth = m.type === "hulk" ? 5 : 3;
      c.beginPath(); c.arc(x, y - 12, reach, m.dir - 0.55, m.dir + 0.55); c.stroke();
    }
    if (m.hp < m.maxHp) {
      const sz = spriteSize(m.skin);
      const top = y - sz.h - 8 + bob;
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 16, top, 32, 4);
      c.fillStyle = "#e04a4a"; c.fillRect(x - 16, top, 32 * clamp(m.hp / m.maxHp, 0, 1), 4);
    }
  }

  drawDrop(d: Drop, ox: number, oy: number, tnow: number) {
    const x = d.x + ox, y = d.y + oy + Math.sin(tnow * 4 + d.x) * 3;
    this.drawShadow(x, y + 6, 7);
    drawSprite(this.ctx, "it_" + d.res, x, y + 6, { scale: 2 });
  }

  drawBubbles(ox: number, oy: number) {
    const c = this.ctx;
    for (const b of this.bubbles) {
      let x = 0, y = 0;
      if (b.who === "player") { x = this.px; y = this.py; }
      else {
        const al = this.allies.find((a) => a.id === b.who);
        if (!al) continue;
        x = al.x; y = al.y;
      }
      const sx = x + ox, sy = y + oy - 106;
      const fade = b.t < 0.2 ? b.t / 0.2 : b.t > b.dur - 0.4 ? Math.max(0, (b.dur - b.t) / 0.4) : 1;
      c.save();
      c.globalAlpha = fade;
      c.font = "600 12px Nunito, 'Trebuchet MS', system-ui, sans-serif";
      const maxW = 210;
      const words = b.text.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (c.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
      }
      if (line) lines.push(line);
      const lh = 15;
      const bw = Math.min(maxW, Math.max(...lines.map((l) => c.measureText(l).width))) + 20;
      const bh = lines.length * lh + 14;
      const bx = clamp(sx - bw / 2, 6, this.viewW - bw - 6);
      const by = sy - bh - 8;
      c.fillStyle = "#fbf6ea";
      this.rr(bx, by, bw, bh, 8); c.fill();
      c.strokeStyle = "#2a2230"; c.lineWidth = 2;
      this.rr(bx, by, bw, bh, 8); c.stroke();
      // tail
      c.fillStyle = "#fbf6ea";
      c.beginPath(); c.moveTo(sx - 6, by + bh - 1); c.lineTo(sx, by + bh + 8); c.lineTo(sx + 6, by + bh - 1); c.closePath(); c.fill();
      c.strokeStyle = "#2a2230";
      c.beginPath(); c.moveTo(sx - 6, by + bh); c.lineTo(sx, by + bh + 8); c.lineTo(sx + 6, by + bh); c.stroke();
      c.fillStyle = "#2a2230";
      c.textAlign = "left";
      lines.forEach((l, i) => c.fillText(l, bx + 10, by + 19 + i * lh));
      c.restore();
    }
  }

  drawFenceConnections(ox: number, oy: number) {
    if (this.structures.length < 2) return;
    const c = this.ctx, occupied = new Array<Structure | undefined>(FENCE_SLOTS);
    for (const s of this.structures) {
      if (s.type !== "wall" && s.type !== "gate") continue;
      const a = Math.atan2(s.y - BASE.y, s.x - BASE.x);
      const slot = ((Math.round(a * FENCE_SLOTS / (2*Math.PI)) % FENCE_SLOTS)+FENCE_SLOTS)%FENCE_SLOTS;
      if(dist2(this.fencePosition(slot).x,this.fencePosition(slot).y,s.x,s.y)<12*12)occupied[slot]=s;
    }
    for(let slot=0;slot<FENCE_SLOTS;slot++){
      const first=occupied[slot],second=occupied[(slot+1)%FENCE_SLOTS];
      if(!first||!second||(first.type==="gate"&&first.open)||(second.type==="gate"&&second.open))continue;
      const x1=first.x+ox,y1=first.y+oy,x2=second.x+ox,y2=second.y+oy;
      if(Math.max(x1,x2)<-40||Math.min(x1,x2)>this.viewW+40||Math.max(y1,y2)<-60||Math.min(y1,y2)>this.viewH+40)continue;
      const style=first.fenceStyle;
      if(style==="stone"){
        c.strokeStyle="#3f4950";c.lineWidth=28;c.beginPath();c.moveTo(x1,y1-8);c.lineTo(x2,y2-8);c.stroke();
        c.strokeStyle="#7e8d96";c.lineWidth=23;c.beginPath();c.moveTo(x1,y1-10);c.lineTo(x2,y2-10);c.stroke();
        c.strokeStyle="#bcc7cb";c.lineWidth=5;c.beginPath();c.moveTo(x1,y1-20);c.lineTo(x2,y2-20);c.stroke();
        const len=Math.hypot(x2-x1,y2-y1),steps=Math.max(1,Math.floor(len/11));
        for(let i=1;i<steps;i++){const t=i/steps,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t;c.fillStyle=i%2?"#5c6971":"#9da9ae";c.fillRect(x-2,y-20,3,23);}
      }else if(style==="hedge"){
        c.strokeStyle="#4c3927";c.lineWidth=8;c.beginPath();c.moveTo(x1,y1-6);c.lineTo(x2,y2-20);c.moveTo(x1,y1-20);c.lineTo(x2,y2-6);c.stroke();
        const len=Math.hypot(x2-x1,y2-y1),steps=Math.max(2,Math.floor(len/7));
        for(let i=0;i<=steps;i++){const t=i/steps,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t-12;c.fillStyle=i%2?"#568846":"#79aa50";c.beginPath();c.arc(x,y+(i%3-1)*4,6,0,Math.PI*2);c.fill();if(i%4===0){c.fillStyle="#b4d378";c.fillRect(x-2,y-3,3,2);}}
      }else{
        const heights=style==="rustic"?[7,18]:[5,13,21];
        for(const height of heights){c.strokeStyle="#37241a";c.lineWidth=8;c.beginPath();c.moveTo(x1,y1-height);c.lineTo(x2,y2-height);c.stroke();c.strokeStyle=style==="rustic"?"#a8734b":height===13?"#b77c48":"#8f5c37";c.lineWidth=5;c.beginPath();c.moveTo(x1,y1-height-1);c.lineTo(x2,y2-height-1);c.stroke();c.strokeStyle="rgba(245,199,120,.55)";c.lineWidth=1;c.beginPath();c.moveTo(x1,y1-height-3);c.lineTo(x2,y2-height-3);c.stroke();}
        if(style==="palisade")for(const t of [.25,.75]){const x=x1+(x2-x1)*t,y=y1+(y2-y1)*t;c.fillStyle="#d6ad68";c.fillRect(Math.round(x-2),Math.round(y-17),4,12);c.fillStyle="#f1d69b";c.fillRect(Math.round(x-1),Math.round(y-16),1,10);c.fillStyle="#31343a";c.fillRect(Math.round(x-1),Math.round(y-14),3,3);}
      }
    }
  }

  drawPlacement(ox: number, oy: number) {
    if (!this.placing) return;
    const c = this.ctx;
    const type = this.placing;
    const ring = type === "wall" || type === "gate";
    const positions = ring ? this.fencePositions(type) : [{ x: this.placeX, y: this.placeY }];
    const ok = !this.placeReason;
    if (ring) {
      c.strokeStyle = "rgba(222,191,120,0.52)";
      c.lineWidth = 2; c.setLineDash([6, 9]);
      c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, FENCE_RADIUS, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      for (let slot = 0; slot < FENCE_SLOTS; slot++) {
        const p = this.fencePosition(slot);
        const sx = p.x + ox, sy = p.y + oy;
        if (sx < -30 || sy < -30 || sx > this.viewW + 30 || sy > this.viewH + 30) continue;
        const occupied = this.structures.some((s) => (s.type === "wall" || s.type === "gate") && dist2(s.x, s.y, p.x, p.y) < 20 * 20);
        c.fillStyle = occupied ? "#6c5641" : "rgba(126,224,153,0.7)";
        c.fillRect(Math.round(sx - 2), Math.round(sy - 2), 4, 4);
      }
    }
    for (const p of positions) {
      const x = p.x + ox, y = p.y + oy;
      c.fillStyle = ok ? "rgba(90,220,120,0.28)" : "rgba(230,70,70,0.29)";
      c.strokeStyle = ok ? "#5ee08a" : "#ff6a6a";
      c.lineWidth = 2;
      const fw = ring ? 32 : 44;
      c.beginPath(); c.rect(Math.round(x - fw / 2), Math.round(y - fw / 2 + 8), fw, fw - 8); c.fill(); c.stroke();
      const name = type === "campfire" ? "campfire0" : type;
      const previewRotation = ring ? Math.atan2(p.y-BASE.y,p.x-BASE.x)+Math.PI/2 : this.placeRotation;
      if(type==="wall") this.drawFencePost(this.fenceStyle,x,y+6,previewRotation,.76,ok?"#63c87e":"#d66060");
      else if(type==="gate") this.drawStyledGate({type:"gate",x:p.x,y:p.y,prodT:0,hp:1,maxHp:1,open:false,rotation:previewRotation,fenceStyle:this.fenceStyle},x,y+6,.76,ok?"#63c87e":"#d66060");
      else {c.save();c.translate(x,y+6);c.rotate(previewRotation);drawSprite(c,name,0,0,{alpha:.72});drawSprite(c,name,0,0,{alpha:.22,tint:ok?"#7dff9b":"#ff6060"});c.restore();}
    }
    if (!ring) {
      const x = this.placeX + ox, y = this.placeY + oy, g = this.snapGrid(type);
      c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        c.beginPath(); c.moveTo(x + i * g - g / 2, y - g * 2.5); c.lineTo(x + i * g - g / 2, y + g * 2.5); c.stroke();
      }
    }
    const x = positions.reduce((sum, p) => sum + p.x, 0) / positions.length + ox;
    const y = Math.min(...positions.map((p) => p.y)) + oy;
    const name = type === "campfire" ? "campfire0" : type;
    c.font = "700 12px Nunito, 'Trebuchet MS', system-ui, sans-serif";
    c.textAlign = "center";
    const label = ok ? `${STRUCT_DEF[type].icon} ${STRUCT_DEF[type].name}${ring ? " · segue a tangente do círculo" : this.placeRotation ? " · lado" : " · frente"}` : `⛔ ${this.placeReason}`;
    c.fillStyle = "rgba(10,12,20,0.84)";
    const tw = c.measureText(label).width + 16;
    this.rr(x - tw / 2, y - 70 - spriteSize(name).h * 0.4, tw, 22, 6); c.fill();
    c.fillStyle = ok ? "#c8ffd8" : "#ffc8c8";
    c.fillText(label, x, y - 55 - spriteSize(name).h * 0.4);
  }

  /* ---------------- HUD ---------------- */
  renderHud() {
    const c = this.ctx;
    const w = this.viewW;
    c.textAlign = "left";

    // top-left: hp + stamina (pixel panel)
    const bx = 14, by = 14;
    this.panel(bx - 6, by - 6, 236, 52);
    const barW = 186;
    c.fillStyle = "#3a1414"; c.fillRect(bx + 24, by + 2, barW, 13);
    const hpw = barW * clamp(this.hp / this.maxHp, 0, 1);
    c.fillStyle = this.hp / this.maxHp < 0.3 ? "#ff4040" : "#e04a4a";
    if (hpw > 1) c.fillRect(bx + 24, by + 2, hpw, 13);
    c.fillStyle = "rgba(255,255,255,0.25)"; if (hpw > 1) c.fillRect(bx + 24, by + 2, hpw, 3);
    c.font = "700 11px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, bx + 24 + barW / 2, by + 12);
    c.textAlign = "left";
    c.fillStyle = "#ff8a8a"; c.fillRect(bx + 4, by + 3, 12, 11); c.fillStyle = "#ff5a5a"; c.fillRect(bx + 2, by + 5, 16, 6); c.fillStyle = "#ffd0d0"; c.fillRect(bx + 5, by + 4, 3, 3);
    c.fillStyle = "#1b2e1b"; c.fillRect(bx + 24, by + 20, barW, 9);
    const stw = barW * this.stamina / 100;
    c.fillStyle = this.stamina < 20 ? "#d0c060" : "#6ad06a";
    if (stw > 1) c.fillRect(bx + 24, by + 20, stw, 9);
    c.fillStyle = "#ffe36a"; c.beginPath(); c.moveTo(bx + 12, by + 19); c.lineTo(bx + 6, by + 26); c.lineTo(bx + 10, by + 26); c.lineTo(bx + 8, by + 31); c.lineTo(bx + 15, by + 23); c.lineTo(bx + 11, by + 23); c.closePath(); c.fill();

    // top-center: day/phase/zone
    c.textAlign = "center";
    this.panel(w / 2 - 150, 8, 300, 44);
    c.font = "800 14px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#ffe9b0";
    c.fillText(`Dia ${this.day} · ${this.phaseLabel()}`, w / 2, 26);
    c.font = "600 12px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#b8c8d8";
    c.fillText(this.zoneName(), w / 2, 43);
    // clock arc
    const prog = (this.time % CYCLE) / CYCLE;
    c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 3;
    c.beginPath(); c.arc(w / 2 - 128, 30, 12, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = this.isNight() ? "#8ab0ff" : "#ffd34d";
    c.beginPath(); c.arc(w / 2 - 128, 30, 12, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke();

    // score top-right
    c.textAlign = "right";
    this.panel(w - 180, 8, 170, 44);
    c.font = "800 16px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#ffd34d";
    c.fillText(`${this.score.toLocaleString("pt-BR")} pts`, w - 20, 27);
    c.font = "11px system-ui"; c.fillStyle = "#b8c8d8";
    const mpTxt = this.opts.mode === "multi" ? ` · 👥${this.remotes.length + 1}` : "";
    c.fillText(`💀 ${this.kills} · 🏕️ nv.${this.baseLevel()}${mpTxt}`, w - 20, 44);

    this.renderHotbar();

    // interact hint
    if (this.interactHint) {
      c.textAlign = "center";
      c.fillStyle = "rgba(10,14,20,0.75)";
      const hw = Math.max(220, c.measureText(this.interactHint).width + 40);
      this.rr(w / 2 - hw / 2, this.viewH - 110, hw, 28, 8); c.fill();
      c.font = "700 13px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#9fe3ff";
      c.fillText(this.interactHint, w / 2, this.viewH - 91);
    }

    // active quest tracker
    const qi = this.questDone.findIndex((d) => !d);
    if (qi >= 0 && w > 700) {
      const q = QUESTS[qi];
      c.textAlign = "right";
      c.fillStyle = "rgba(10,14,20,0.55)";
      this.rr(w - 260, 60, 250, 40, 8); c.fill();
      c.font = "bold 12px system-ui"; c.fillStyle = "#ffe9b0";
      c.fillText(`🎯 ${q.name} (${Math.round(this.questP[qi])}/${q.target})`, w - 20, 77);
      c.font = "11px system-ui"; c.fillStyle = "#b8c8d8";
      c.fillText(q.desc, w - 20, 93);
    }

    if (this.underAttackNow()) {
      const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.5;
      c.textAlign = "center";
      c.fillStyle = `rgba(120,10,10,${0.45 + pulse * 0.35})`;
      this.rr(w / 2 - 132, 56, 264, 26, 8); c.fill();
      c.strokeStyle = "#ff6a6a"; c.lineWidth = 1.5;
      this.rr(w / 2 - 132, 56, 264, 26, 8); c.stroke();
      c.font = "bold 13px system-ui, sans-serif";
      c.fillStyle = "#ffe2e2";
      c.fillText("⚠ BASE SOB ATAQUE — DEFENDA A CERCA!", w / 2, 74);
    }
    if (this.settings.showFps) {
      c.textAlign = "right";
      c.font = "bold 11px ui-monospace, monospace";
      c.fillStyle = this.fps < 45 ? "#ffb46a" : "#9fe3a0";
      const gate = this.structures.find((s) => s.type === "gate");
      const gateTxt = gate ? ` · ${gate.open ? "🚪 aberto" : "🚪 fechado"}` : "";
      c.fillText(`${this.fps} FPS${gateTxt}`, w - 12, this.viewH - (this.viewW < 700 ? 118 : 166));
    }
    this.renderMinimap();
  }

  /** pixel-styled panel */
  panel(x: number, y: number, w: number, h: number, accent = "#7a5a32") {
    const c = this.ctx;
    c.fillStyle = "rgba(14,12,20,0.82)";
    c.fillRect(x, y, w, h);
    c.fillStyle = accent;
    c.fillRect(x, y, w, 2); c.fillRect(x, y + h - 2, w, 2); c.fillRect(x, y, 2, h); c.fillRect(x + w - 2, y, 2, h);
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.fillRect(x + 2, y + 2, w - 4, 1);
    c.fillStyle = "#2a2230";
    c.fillRect(x - 1, y - 1, 3, 3); c.fillRect(x + w - 2, y - 1, 3, 3); c.fillRect(x - 1, y + h - 2, 3, 3); c.fillRect(x + w - 2, y + h - 2, 3, 3);
  }

  renderHotbar() {
    const c = this.ctx;
    const w = this.viewW;
    const small = w < 760;
    const slot = small ? 40 : 46;
    const gap = 4;
    const tools: ToolKey[] = ["axe", "pick", "sword"];
    const res: ResKey[] = ["wood", "stone", "fiber", "food", "iron", "crystal"];
    const total = tools.length * (slot + gap) + 14 + res.length * (slot + gap) - gap;
    const x0 = Math.round(w / 2 - total / 2);
    const y0 = this.viewH - slot - 14;
    this.panel(x0 - 8, y0 - 8, total + 16, slot + 16);
    let x = x0;
    c.imageSmoothingEnabled = false;
    c.textAlign = "left";
    tools.forEach((t, i) => {
      const held = this.heldTool === t;
      c.fillStyle = held ? "rgba(255,211,77,0.22)" : "rgba(255,255,255,0.06)";
      c.fillRect(x, y0, slot, slot);
      c.strokeStyle = held ? "#ffd34d" : "#4a4050"; c.lineWidth = held ? 2 : 1;
      c.strokeRect(x + 0.5, y0 + 0.5, slot - 1, slot - 1);
      drawToolSprite(c, t, x + slot * 0.3, y0 + slot * 0.68, -Math.PI / 4, small ? 1.7 : 2.0);
      c.font = "800 9px Nunito, system-ui, sans-serif"; c.fillStyle = "#cfc8bc";
      c.fillText(`${i + 1}`, x + 4, y0 + 10);
      c.fillStyle = "#ffd34d"; c.textAlign = "right";
      c.fillText(`nv${this.tools[t]}`, x + slot - 4, y0 + slot - 4);
      c.textAlign = "left";
      x += slot + gap;
    });
    c.fillStyle = "#4a4050"; c.fillRect(x + 4, y0 + 4, 2, slot - 8);
    x += 14;
    res.forEach((r) => {
      const n = this.inv[r];
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.fillRect(x, y0, slot, slot);
      c.strokeStyle = "#4a4050"; c.lineWidth = 1;
      c.strokeRect(x + 0.5, y0 + 0.5, slot - 1, slot - 1);
      drawSprite(c, "it_" + r, x + slot / 2, y0 + slot * 0.72, { scale: small ? 3 : 3.5 });
      c.font = "800 11px Nunito, system-ui, sans-serif";
      c.textAlign = "right";
      c.fillStyle = "rgba(0,0,0,0.7)"; c.fillText(`${n}`, x + slot - 3, y0 + slot - 3);
      c.fillStyle = n > 0 ? "#fff6dc" : "#8a8290"; c.fillText(`${n}`, x + slot - 4, y0 + slot - 4);
      c.textAlign = "left";
      x += slot + gap;
    });
    // labels for keyboard-only scheme
    if (this.settings.controls === "keyboard") {
      c.font = "700 9px Nunito, system-ui, sans-serif"; c.fillStyle = "#b8b0c0"; c.textAlign = "center";
      c.fillText("1 · 2 · 3 trocam a ferramenta", x0 + (slot + gap) * 1.5 - 2, y0 - 12);
    }
  }

  renderMinimap() {
    if (!this.mini) return;
    const c = this.ctx;
    const size = this.viewW < 700 ? 92 : 140;
    const mx = this.viewW - size - 12, my = this.viewH - size - 12;
    c.globalAlpha = 0.88;
    c.fillStyle = "#0a0e14";
    this.rr(mx - 3, my - 3, size + 6, size + 6, 8); c.fill();
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mini, mx, my, size, size);
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 1;
    const sx = size / WPX, sy = size / HPX;
    const dot = (x: number, y: number, col: string, r: number) => {
      c.fillStyle = col;
      c.beginPath(); c.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); c.fill();
    };
    dot(VILLAGE.x, VILLAGE.y, "#ffd34d", 3);
    dot(BASE.x, BASE.y, "#7dff9b", 3.5);
    dot(CAVE.x, CAVE.y, "#b48cff", 3);
    const hasTower = this.structures.some((s) => s.type === "tower");
    if (hasTower) for (const m of this.monsters) dot(m.x, m.y, "#ff5050", 1.5);
    for (const r of this.remotes) dot(r.x, r.y, "#6db6ff", 2.5);
    dot(this.px, this.py, "#ffffff", 3);
    const dark = this.darkness();
    const readable = dark < 0.28 || this.nearLight();
    if (!readable) {
      c.save();
      c.beginPath();
      c.rect(mx, my, size, size);
      c.clip();
      c.fillStyle = `rgba(4,6,14,${Math.min(0.94, dark)})`;
      c.fillRect(mx, my, size, size);
      c.globalCompositeOperation = "destination-out";
      const punch = (wx: number, wy: number, r: number) => {
        const hx = mx + wx * sx, hy = my + wy * sy;
        const g = c.createRadialGradient(hx, hy, 2, hx, hy, r);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2); c.fill();
      };
      punch(this.px, this.py, size * 0.16);
      for (const s of this.structures) if (s.type === "campfire") punch(s.x, s.y, size * 0.12);
      c.restore();
    } else {
      c.font = "bold 9px system-ui, sans-serif";
      c.textAlign = "left";
      const tag = (wx: number, wy: number, text: string, col: string) => {
        c.fillStyle = "rgba(0,0,0,0.55)";
        c.fillText(text, mx + wx * sx + 5, my + wy * sy - 3);
        c.fillStyle = col;
        c.fillText(text, mx + wx * sx + 4, my + wy * sy - 4);
      };
      if (size >= 110) {
        tag(BASE.x, BASE.y, "BASE", "#b6ffc9");
        tag(VILLAGE.x, VILLAGE.y, "VILA", "#ffe9a0");
        tag(CAVE.x, CAVE.y, "CAV", "#e2d0ff");
      }
    }
  }

  drawBasePointer() {
    if (this.state !== "playing" || this.mapOpen) return;
    const c = this.ctx;
    const dark = this.darkness();
    const lit = this.nearLight();
    const alpha = lit ? 0.95 : Math.max(0.12, 1 - dark * 1.05);
    const bx = BASE.x - this.camX;
    const by = BASE.y - this.camY;
    const dist = Math.round(Math.hypot(BASE.x - this.px, BASE.y - this.py) / TILE);
    const onScreen = bx > 36 && bx < this.viewW - 36 && by > 48 && by < this.viewH - 48;
    c.save();
    c.globalAlpha = alpha;
    if (onScreen && dark < 0.35) {
      c.font = "bold 13px system-ui, sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#04210c";
      c.fillText("SUA BASE", bx + 1, by - 86);
      c.fillStyle = "#b6ffc9";
      c.fillText("SUA BASE", bx, by - 87);
    } else if (!onScreen) {
      const ang = Math.atan2(BASE.y - this.py, BASE.x - this.px);
      const cx = this.viewW / 2, cy = this.viewH / 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let t = 1e9;
      if (dx > 0.001) t = Math.min(t, (this.viewW - 36 - cx) / dx);
      else if (dx < -0.001) t = Math.min(t, (36 - cx) / dx);
      if (dy > 0.001) t = Math.min(t, (this.viewH - 36 - cy) / dy);
      else if (dy < -0.001) t = Math.min(t, (64 - cy) / dy);
      const x = cx + dx * t, y = cy + dy * t;
      c.translate(x, y);
      c.rotate(ang);
      c.fillStyle = "#7dff9b";
      c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, -7); c.lineTo(-4, 0); c.lineTo(-8, 7); c.closePath(); c.fill();
      c.rotate(-ang);
      c.font = "bold 11px system-ui, sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#04210c";
      c.fillText(`BASE ${dist}m`, 1, 20);
      c.fillStyle = "#d8ffe6";
      c.fillText(`BASE ${dist}m`, 0, 19);
    }
    c.restore();
  }

  renderAtlas() {
    const c = this.ctx;
    const w = this.viewW, h = this.viewH;
    const dark = this.darkness();
    const lit = this.nearLight();
    const vis = lit ? 1 : Math.max(0.08, 1 - dark * 0.96);
    c.fillStyle = "rgba(6,8,14,0.72)";
    c.fillRect(0, 0, w, h);
    const legendW = w > 720 ? 230 : 0;
    const size = Math.min(w - legendW - 48, h - 92, 620);
    const mx = legendW ? 28 : (w - size) / 2;
    const my = Math.max(28, (h - size) / 2 - 8);
    c.fillStyle = "#1a140c";
    this.rr(mx - 14, my - 34, size + 28, size + 52, 12);
    c.fill();
    c.strokeStyle = "#c9a15b";
    c.lineWidth = 2;
    this.rr(mx - 14, my - 34, size + 28, size + 52, 12);
    c.stroke();
    c.textAlign = "center";
    c.font = "bold 15px system-ui, sans-serif";
    c.fillStyle = "#ffe9b0";
    c.fillText("MAPA DA ILHA", mx + size / 2, my - 12);
    if (this.mini) {
      c.save();
      c.globalAlpha = 0.35 + vis * 0.65;
      c.imageSmoothingEnabled = true;
      c.drawImage(this.mini, mx, my, size, size);
      c.restore();
    }
    if (vis < 0.55) {
      c.save();
      c.beginPath();
      c.rect(mx, my, size, size);
      c.clip();
      c.fillStyle = `rgba(4,6,14,${1 - vis})`;
      c.fillRect(mx, my, size, size);
      c.globalCompositeOperation = "destination-out";
      const sx = size / WPX, sy = size / HPX;
      const punch = (wx: number, wy: number, r: number) => {
        const hx = mx + wx * sx, hy = my + wy * sy;
        const g = c.createRadialGradient(hx, hy, 4, hx, hy, r);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2); c.fill();
      };
      punch(this.px, this.py, 54);
      for (const s of this.structures) if (s.type === "campfire" || s.type === "forge") punch(s.x, s.y, 46);
      if (dist2(this.px, this.py, VILLAGE.x, VILLAGE.y) < VILLAGE.r * VILLAGE.r) punch(VILLAGE.x, VILLAGE.y, 70);
      c.restore();
    }
    const places = [
      { name: "SUA BASE", sub: "Construa o reino aqui", x: BASE.x, y: BASE.y, color: "#7dff9b", lx: 16, ly: -8, big: true },
      { name: "Vilarejo", sub: "Porto Cinza · seguro", x: VILLAGE.x, y: VILLAGE.y, color: "#ffd34d", lx: -78, ly: -4, big: false },
      { name: "Caverna", sub: "Ferro e cristal", x: CAVE.x, y: CAVE.y, color: "#d2b6ff", lx: 14, ly: -16, big: false },
      { name: "Floresta Sombria", sub: "Território dos monstros", x: 156 * TILE, y: 100 * TILE, color: "#8fd08a", lx: -8, ly: 16, big: false },
      { name: "Rochas do Norte", sub: "Pedra e minério", x: 95 * TILE, y: 22 * TILE, color: "#e4e0d8", lx: 12, ly: -14, big: false },
      { name: "Naufrágio", sub: "Onde o avião caiu", x: CRASH.x, y: CRASH.y, color: "#f0e2c4", lx: 14, ly: 8, big: false },
      { name: "Vale do Degelo", sub: "Neve, gelo e ruínas", x: GLACIER.x + 70, y: GLACIER.y - 170, color: "#b9f2f3", lx: 8, ly: -10, big: false },
      ...SITES.map((site) => ({ name: site.name, sub: this.discoveredSites.has(site.id) ? "Explorado · E no altar" : "Ruína por descobrir", x: site.x, y: site.y, color: site.color, lx: -34, ly: 10, big: false })),
    ];
    const sx = size / WPX, sy = size / HPX;
    c.textAlign = "left";
    for (const p of places) {
      const px = mx + p.x * sx, py = my + p.y * sy;
      const near = dist2(p.x, p.y, this.px, this.py) < 520 * 520 || vis > 0.72;
      c.globalAlpha = near ? 1 : Math.max(0.15, vis);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(px, py, p.big ? 6 : 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#0c1016";
      c.lineWidth = 2;
      c.stroke();
      if (p.big) {
        c.strokeStyle = p.color;
        c.globalAlpha = 0.45 + Math.sin(performance.now() / 280) * 0.25;
        c.beginPath(); c.arc(px, py, 11, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = near ? 1 : Math.max(0.15, vis);
      }
      c.font = p.big ? "bold 13px system-ui, sans-serif" : "bold 11px system-ui, sans-serif";
      c.fillStyle = "#0c1016";
      c.fillText(p.name, px + p.lx + 1, py + p.ly + 1);
      c.fillStyle = p.color;
      c.fillText(p.name, px + p.lx, py + p.ly);
      const meters = Math.round(Math.hypot(p.x - this.px, p.y - this.py) / TILE);
      c.font = "10px system-ui, sans-serif";
      c.fillStyle = "#d8e0ea";
      if (vis > 0.55 || near) c.fillText(`${meters}m`, px + p.lx, py + p.ly + 11);
    }
    c.globalAlpha = 1;
    // player
    const ppx = mx + this.px * sx, ppy = my + this.py * sy;
    c.save();
    c.translate(ppx, ppy);
    c.rotate(this.pdir);
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -4); c.lineTo(-5, 4); c.closePath(); c.fill();
    c.restore();
    c.font = "bold 10px system-ui, sans-serif";
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText("você", ppx, ppy + 14);

    if (legendW) {
      const lx = mx + size + 36, ly = my;
      c.textAlign = "left";
      c.font = "bold 13px system-ui, sans-serif";
      c.fillStyle = "#ffe9b0";
      c.fillText("Lugares", lx, ly + 8);
      places.forEach((p, i) => {
        const yy = ly + 30 + i * Math.min(42, (size - 20) / places.length);
        c.fillStyle = p.color;
        c.beginPath(); c.arc(lx + 6, yy - 4, 5, 0, Math.PI * 2); c.fill();
        c.font = "bold 12px system-ui, sans-serif";
        c.fillStyle = "#f4efe4";
        c.fillText(p.name, lx + 16, yy);
        c.font = "11px system-ui, sans-serif";
        c.fillStyle = "#9aabbc";
        if (places.length < 10) c.fillText(p.sub, lx + 16, yy + 13);
      });
    }
    c.textAlign = "center";
    c.font = "12px system-ui, sans-serif";
    if (vis < 0.45) {
      c.fillStyle = "rgba(8,10,18,0.8)";
      this.rr(w / 2 - 190, h - 78, 380, 36, 8);
      c.fill();
      c.fillStyle = "#ffb4b4";
      c.fillText("Noite: o mapa some. Chegue a uma fogueira para lê-lo.", w / 2, h - 56);
    } else {
      c.fillStyle = "#c9d4e0";
      c.fillText("M ou ESC fecha  ·  verde pulsando = sua base", w / 2, h - 18);
    }
  }

  rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------------- cutscene render ---------------- */
  renderCutscene() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = this.viewW, h = this.viewH;
    const t = this.cutT;
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;

    if (this.cutPhase <= 1) {
      // sky
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#7db8e8"); g.addColorStop(0.55, "#b8d8ee"); g.addColorStop(0.56, "#2e5e8e"); g.addColorStop(1, "#1b3a5c");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // sun
      c.fillStyle = "#fff3c0";
      c.beginPath(); c.arc(w * 0.8, h * 0.18, 36, 0, Math.PI * 2); c.fill();
      // clouds
      c.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 230 + t * 40) % (w + 200)) - 100;
        const cy = h * 0.12 + (i % 3) * 46;
        c.beginPath(); c.arc(cx, cy, 24, 0, Math.PI * 2); c.arc(cx + 26, cy + 6, 18, 0, Math.PI * 2); c.arc(cx - 26, cy + 8, 16, 0, Math.PI * 2); c.fill();
      }
      // waves
      c.strokeStyle = "rgba(255,255,255,0.3)"; c.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const wy = h * 0.58 + i * (h * 0.05);
        c.beginPath();
        for (let x = 0; x <= w; x += 22) {
          const yy = wy + Math.sin(x * 0.03 + t * 2 + i) * 4;
          if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
        }
        c.stroke();
      }
      // plane
      const px = w * 0.15 + t * (w * 0.1) + shx;
      const py = (this.cutPhase === 0 ? h * 0.3 : h * 0.3 + (t - 4.2) * (t - 4.2) * 40) + shy + Math.sin(t * 3) * 4;
      const rot = this.cutPhase === 0 ? 0.03 * Math.sin(t * 2) : 0.5 * Math.min(1, (t - 4.2) / 2);
      c.save(); c.translate(px, py); c.rotate(rot);
      c.fillStyle = "#e8edf2";
      c.beginPath(); c.ellipse(0, 0, 54, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#c2ccd6";
      c.beginPath(); c.moveTo(-6, -4); c.lineTo(-30, -34); c.lineTo(-16, -34); c.lineTo(6, -4); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-4, 4); c.lineTo(-22, 26); c.lineTo(-10, 26); c.lineTo(8, 4); c.closePath(); c.fill();
      c.fillStyle = "#aab6c2"; c.beginPath(); c.moveTo(-52, -2); c.lineTo(-64, -20); c.lineTo(-50, -20); c.lineTo(-42, -2); c.closePath(); c.fill();
      c.fillStyle = "#3a6ea5";
      for (let i = 0; i < 5; i++) c.fillRect(-28 + i * 13, -6, 8, 6);
      c.restore();
      if (this.cutPhase === 1) {
        // fire & smoke from engine
        for (let i = 0; i < 3; i++) {
          this.particles.push({ x: px - 40 - Math.random() * 30, y: py + (Math.random() - 0.5) * 16, vx: -80 - Math.random() * 60, vy: (Math.random() - 0.5) * 40, t: 0, max: 0.8, c: i === 0 ? "#ff9b2d" : i === 1 ? "#ffd34d" : "#555", s: 4 + Math.random() * 5, grav: -20 });
        }
        this.shake = Math.min(10, this.shake + 0.4);
      }
      // particles (screen space)
      this.updateParticles(1 / 60);
      for (const p of this.particles) {
        c.globalAlpha = 1 - p.t / p.max; c.fillStyle = p.c;
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      c.globalAlpha = 1;
      // letterbox + caption
      c.fillStyle = "#000";
      c.fillRect(0, 0, w, h * 0.08); c.fillRect(0, h * 0.92, w, h * 0.08);
      c.textAlign = "center"; c.font = "italic 16px Georgia, serif"; c.fillStyle = "#fff";
      const cap = this.cutPhase === 0 ? "Em algum lugar sobre o oceano..." : "⚠ FALHA NO MOTOR ⚠";
      if (this.cutPhase === 1 && Math.sin(t * 10) > 0) c.fillStyle = "#ff6060";
      c.fillText(cap, w / 2, h * 0.965);
    } else if (this.cutPhase === 2) {
      c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
      if (this.flashWhite > 0) { c.fillStyle = `rgba(255,255,255,${this.flashWhite})`; c.fillRect(0, 0, w, h); }
    } else {
      // beach dusk scene
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2c2a4a"); g.addColorStop(0.45, "#8a4a62"); g.addColorStop(0.6, "#e8955c"); g.addColorStop(0.62, "#1b3a5c"); g.addColorStop(0.75, "#d9c38a"); g.addColorStop(1, "#c9b37a");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // sun setting
      c.fillStyle = "#ffcf90";
      c.beginPath(); c.arc(w * 0.5, h * 0.58, 30, Math.PI, 0); c.fill();
      // stars fading in
      c.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 24; i++) {
        const sx = (i * 977) % w, sy = ((i * 331) % Math.floor(h * 0.4));
        if (Math.sin(t * 2 + i) > 0.2) c.fillRect(sx, sy, 2, 2);
      }
      // wreck
      this.ctxWreckOnBeach(w * 0.72, h * 0.8, t);
      // player lying/standing
      const wake = clamp((t - 9) / 1.4, 0, 1);
      c.save();
      c.translate(w * 0.34, h * 0.84);
      c.rotate((1 - wake) * Math.PI / 2);
      this.drawHumanoid(0, 0, "player", 0, false, 0);
      c.restore();
      // Rian approaching
      const rx = w * (0.9 - clamp((t - 8.6) / 2.2, 0, 1) * 0.42);
      this.drawHumanoid(rx, h * 0.84, "rian", Math.PI, t < 11, t * 8);
      // fire sticks
      // dialogue box
      if (this.dialogueIdx >= 0) {
        const d = this.dialogue[this.dialogueIdx];
        c.fillStyle = "rgba(8,10,18,0.88)";
        this.rr(w * 0.08, h - 150, w * 0.84, 110, 14); c.fill();
        c.strokeStyle = "rgba(255,210,120,0.4)"; c.lineWidth = 2;
        this.rr(w * 0.08, h - 150, w * 0.84, 110, 14); c.stroke();
        c.textAlign = "left";
        c.font = "bold 15px system-ui"; c.fillStyle = "#ffd34d";
        c.fillText(d.who, w * 0.08 + 20, h - 122);
        c.font = "14px system-ui"; c.fillStyle = "#e8eef4";
        this.wrapText(d.text, w * 0.08 + 20, h - 100, w * 0.84 - 40, 20);
        c.textAlign = "right"; c.font = "12px system-ui"; c.fillStyle = "#8aa0b8";
        const cont = this.dialogueIdx < this.dialogue.length - 1 ? "toque / ESPAÇO para continuar ▸" : "toque / ESPAÇO para começar ▸";
        if (Math.sin(t * 4) > -0.3) c.fillText(cont, w * 0.92 - 16, h - 52);
      }
      c.fillStyle = "#000";
      c.fillRect(0, 0, w, h * 0.06); c.fillRect(0, h * 0.94, w, h * 0.06);
    }
    // skip hint
    c.textAlign = "right"; c.font = "12px system-ui"; c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText("ESC: pular cutscene", w - 14, 24 + (this.cutPhase <= 1 ? this.viewH * 0.08 : 0));
  }

  ctxWreckOnBeach(x: number, y: number, t: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(-0.22);
    c.fillStyle = "#9aa3ad";
    c.beginPath(); c.ellipse(0, 0, 70, 17, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#788089"; c.fillRect(-16, -38, 12, 40);
    c.fillStyle = "#3a3f47";
    for (let i = 0; i < 4; i++) c.fillRect(10 + i * 13, -8, 8, 8);
    c.restore();
    // smoke
    c.fillStyle = "rgba(60,60,60,0.5)";
    for (let i = 0; i < 4; i++) {
      const sy = y - 30 - ((t * 30 + i * 40) % 160);
      const sx = x + Math.sin(t + i) * 10;
      const r = 8 + ((t * 30 + i * 40) % 160) * 0.12;
      c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
    }
    // small fire
    const fl = Math.sin(t * 12) * 3;
    c.fillStyle = "#ff9b2d";
    c.beginPath(); c.moveTo(x - 30, y - 24 - fl); c.lineTo(x - 38, y - 4); c.lineTo(x - 22, y - 4); c.closePath(); c.fill();
  }

  wrapText(text: string, x: number, y: number, maxW: number, lh: number) {
    const c = this.ctx;
    const words = text.split(" ");
    let line = "", yy = y;
    for (const wd of words) {
      const test = line + wd + " ";
      if (c.measureText(test).width > maxW && line) {
        c.fillText(line, x, yy); line = wd + " "; yy += lh;
      } else line = test;
    }
    c.fillText(line, x, yy);
  }

  /* ---------------- teardown ---------------- */
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (this.state === "playing" || this.state === "paused") this.saveGame();
  }
}
