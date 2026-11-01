/* =========================================================
   ILHA DA ÚLTIMA LUZ · survival engine (canvas 2D)
   ========================================================= */

import { drawSign, drawFlag } from "@/game/art";
import { drawSprite, drawSwaySprite, drawCharacter, drawToolSprite, spriteSize, getBaked, SPRITES, SCALE, viewFromAngle } from "@/game/sprites";
import { drawCraftOrc, drawCraftPlant, drawCraftVillager, drawCraftVillageHouse, drawCraftTower, hasCraftHero, hasCraftOrcs, hasCraftVillage, hasCraftTower, loadCraftPix } from "@/game/craftpix";
import { drawReferenceArcher, drawReferenceCreature, drawReferenceFigure, drawReferenceDeposit, drawReferenceIcon, drawReferenceLightning, drawReferenceObject, drawReferencePlant, drawReferenceResident, drawReferenceSpikes, hasReferenceArcher, hasReferenceCreature, hasReferenceObject, hasReferenceScene, loadReferenceArt, type ReferenceObject, type ReferenceScene, type ResidentLook } from "@/game/reference-art";
import { Terrain, drawWaterAnim } from "@/game/terrain";
import { MusicManager } from "@/game/music";
import { Sfx } from "@/game/sfx";
import { GameSettings, DEFAULT_SETTINGS } from "@/game/settings";
import { FrameLimiter } from "@/game/frame-limiter";
import { SITES, GLACIER, MINERAL_BASIN, EQUIPMENT, type EquipmentKey } from "@/game/world-content";
import { anchoredRect, rectanglesOverlap, resourceArtBounds, tileAreaIndex, type WorldRect } from "@/game/world-layout";

export type Difficulty = "dificil" | "muito-dificil" | "impossivel";
export type Mode = "single" | "multi";
export type GameState = "cutscene" | "playing" | "paused" | "gameover" | "victory";
export type ResKey = "wood" | "stone" | "fiber" | "food" | "iron" | "crystal";
export type ToolKey = "axe" | "pick" | "sword";
export type CombatWeapon = "sword" | "bow";
export type FenceStyle = "rustic" | "palisade" | "stone" | "hedge";
export type DefenseTier = 1 | 2 | 3 | 4;
export type SpecialistId = "archer" | "mage" | "guard" | "miner";
export type SpecialistDuty = "follow" | "defend" | "train" | "mine" | "rest";
export type RianDuty = "stay" | "follow";

export const RES_LABEL: Record<ResKey, string> = {
  wood: "Madeira", stone: "Pedra", fiber: "Fibra", food: "Comida", iron: "Ferro", crystal: "Cristal",
};
export const RES_ICON: Record<ResKey, string> = {
  wood: "🪵", stone: "🪨", fiber: "🌾", food: "🍖", iron: "⛓️", crystal: "💎",
};
export const TOOL_LABEL: Record<ToolKey, string> = { axe: "Machado", pick: "Picareta", sword: "Espada" };
export const TOOL_ICON: Record<ToolKey, string> = { axe: "🪓", pick: "⛏️", sword: "⚔️" };

export type GamePanel = "build" | "forge" | "inventory" | "bestiary" | "people" | "reference" | "none";

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
export interface SpecialistView {
  id: SpecialistId; name: string; role: string; hint: string; rescued: boolean; hired: boolean;
  duty: SpecialistDuty; level: number; weaponLevel: number; training: number; trainingTarget: number;
  upgradeCost: Partial<Record<ResKey, number>>; upgradeReason: string; affordable: boolean;
}
export interface DeathReport {
  lost: Partial<Record<ResKey, number>>;
  percent: number;
  pressure: number;
  damaged: number;
  destroyed: number;
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
  specialists: SpecialistView[];
  rianDuty: RianDuty;
  baseLevel: number;
  buildOptions: BuildOption[];
  upgradeOptions: UpgradeOption[];
  raftReasons: string[];
  canRespawn: boolean;
  recovery: { waking: boolean; remaining: number; report: DeathReport } | null;
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
  combatWeapon: CombatWeapon;
  renderScale: number;
  fenceStyle: FenceStyle;
  fenceStyles: { id: FenceStyle; name: string; desc: string; hp: number; cost: Partial<Record<ResKey, number>>; locked: boolean }[];
  territory: { level: number; maxLevel: number; radius: number; nextRadius: number | null; cost: Partial<Record<ResKey, number>>; locked: boolean; reason: string; affordable: boolean };
  fenceRing: number;
  fencePieces: number;
  defenseTier: DefenseTier;
  defenseTiers: { tier: DefenseTier; locked: boolean; reason: string; spikeDamage: number; barricadeHp: number }[];
}
export interface TutorialView {
  id: string; title: string; text: string; keys: string[]; step: number; total: number;
}
export type UiEvent =
  | { type: "snapshot"; snap: Snapshot }
  | { type: "state"; state: GameState }
  | { type: "panel"; panel: GamePanel }
  | { type: "reference"; scene: ReferenceScene }
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

const T_WATER = 0, T_SAND = 1, T_GRASS = 2, T_DARK = 3, T_PATH = 4, T_ROCK = 5, T_CAVE = 6, T_BRIDGE = 7, T_SNOW = 8, T_ICE = 9, T_RUIN = 10, T_SNOW_PATH = 11, T_NECRO = 12, T_MINERAL = 13, T_AUTUMN = 14, T_BLOSSOM = 15;

// Keep the original generation radii for stable resource indices in old saves.
const VILLAGE = { x: 58 * TILE, y: 122 * TILE, r: 13 * TILE };
const VILLAGE_AREA_RADIUS = 760;
const BASE = { x: 104 * TILE, y: 88 * TILE, r: 15 * TILE };
const CAVE = { x: 98 * TILE, y: 30 * TILE, r: 13 * TILE };
const REFERENCE_LABELS: Record<ReferenceScene, string> = { forge: "forja", chapel: "capela", market: "mercado", camp: "acampamento", sewer: "esgoto" };
const REFERENCE_SCALE: Record<ReferenceObject, number> = {
  forge: 0.8, house: 1.1, chest: 1, chapel: 1.25, market: 1.25, camp: 1, sewer: 0.75,
  castle_wall: 1, castle_tower: 1, castle_gate: 1, castle_grate: 1,
  house_half_timber: 1.1, house_wood_a: 1.1, house_wood_b: 1.1, house_stone: 1.1,
  bridge_wood_h: 1, bridge_wood_v: 1, bridge_stone_h: 1, bridge_stone_v: 1,
  barricade_1: 0.75, barricade_2: 0.75, barricade_3: 0.75, barricade_4: 0.75,
  training_fence: 1, training_mat: 1, training_canopy: 1, training_dummy: 1, training_rack: 1,
};
// Old land foundations are retained for seed/save compatibility, but no longer
// decide where visible houses sit. New positions are planned after all roads.
const LEGACY_VILLAGE_HOUSES = [[-620, -260], [-620, 150], [-470, 520], [-70, 540], [330, 520]] as const;
const LEGACY_HAMLET_HOUSES = [[-215, -75], [215, -75]] as const;
const VILLAGE_HOUSE_SCALE = 1.8;
const HAMLET_HOUSE_SCALE = 1.35;
// Scale the world art uniformly; combat ranges and stats are unchanged.
const MONSTER_ART_SCALE = 0.75;
interface VillageHouse { x: number; y: number; index: number; scale: number; }
interface Hamlet { id: string; name: string; x: number; y: number; houses: VillageHouse[]; }
const HAMLET_DEFS: readonly Omit<Hamlet, "houses">[] = [
  { id: "pinheiros", name: "Aldeia dos Pinheiros", x: 49 * TILE, y: 45 * TILE },
  { id: "campinas", name: "Vila das Campinas", x: 33 * TILE, y: 150 * TILE },
  { id: "riacho", name: "Vila do Riacho", x: 119 * TILE, y: 151 * TILE },
  { id: "fronteira", name: "Vila da Fronteira", x: 160 * TILE, y: 117 * TILE },
];
const houseBounds = (house: VillageHouse, padding = 0) => anchoredRect(house.x, house.y, 220 * house.scale, 250 * house.scale, padding);
const HOUSE_ART: ReferenceObject[] = ["house", "house_half_timber", "house_wood_a", "house_wood_b", "house_stone"];
const BARRICADE_ART: ReferenceObject[] = ["barricade_1", "barricade_2", "barricade_3", "barricade_4"];
function houseArt(index: number): ReferenceObject | null {
  const preferred = HOUSE_ART[((index % HOUSE_ART.length) + HOUSE_ART.length) % HOUSE_ART.length];
  if (hasReferenceObject(preferred)) return preferred;
  if (hasReferenceObject("house")) return "house";
  return HOUSE_ART.find((name) => hasReferenceObject(name)) ?? null;
}
function placedHouseArt(x: number, y: number) {
  // Stable across reloads, and does not consume the world-generation RNG.
  return houseArt(Math.abs(Math.floor(x / 16) * 3 + Math.floor(y / 16)) % HOUSE_ART.length);
}
// Fixed buildings are placed off the roads and remain independently solid.
interface VillageBuilding { name: "chapel" | "market"; x: number; y: number; halfWidth: number; depth: number; width: number; height: number; }
const VILLAGE_BUILDING_DEFS = [
  { name: "chapel" as const, dx: -340, dy: -110, halfWidth: 112, depth: 26, width: 300, height: 367.5 },
  { name: "market" as const, dx: 360, dy: 170, halfWidth: 82, depth: 23, width: 250, height: 220 },
];
// Nearest-first grid offsets are shared by all seeds, with stable tie-breaking.
let villageOffsets: { x: number; y: number; d2: number }[] | null = null;
function layoutOffsets() {
  if (!villageOffsets) {
    villageOffsets = [];
    for (let y = -80; y <= 80; y++) for (let x = -80; x <= 80; x++) villageOffsets.push({ x: x * TILE, y: y * TILE, d2: x * x + y * y });
    villageOffsets.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x);
  }
  return villageOffsets;
}
// The compact starting ring keeps the tent inside it; legacy saves keep its
// previous position and perimeter so no existing base is rearranged.
const CAMP_COMPACT = { x: BASE.x - 125, y: BASE.y + 40 };
const CAMP_LEGACY = { x: BASE.x - 130, y: BASE.y - 120 };
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
// Each larger territory adds a separate perimeter. Odd slot counts allow
// double-wall purchases plus one gate without leaving a gap.
const LEGACY_FIRST_TERRITORY = { radius: BASE.r, fenceRadius: BASE.r * 0.73, slots: 63, level: 0, requires: null, cost: {} } as const;
const TERRITORIES = [
  { radius: 320, fenceRadius: 240, slots: 43, level: 0, requires: null, cost: {} },
  { radius: 640, fenceRadius: 510.4, slots: 91, level: 4, requires: "workbench", cost: { wood: 100, stone: 80 } },
  { radius: 800, fenceRadius: 670.4, slots: 121, level: 8, requires: "forge", cost: { wood: 180, stone: 180, iron: 30 } },
  { radius: 960, fenceRadius: 830.4, slots: 149, level: 12, requires: "tower", cost: { wood: 280, stone: 300, iron: 80, crystal: 10 } },
] as const;

interface DiffCfg { resMult: number; mHp: number; mDmg: number; spawn: number; lossOnDeath: number; }
const DIFF: Record<Difficulty, DiffCfg> = {
  "dificil": { resMult: 1, mHp: 1.35, mDmg: 1.3, spawn: 1.2, lossOnDeath: 0.12 },
  "muito-dificil": { resMult: 2, mHp: 1.9, mDmg: 1.85, spawn: 1.6, lossOnDeath: 0.22 },
  "impossivel": { resMult: 3.5, mHp: 2.7, mDmg: 2.6, spawn: 2.2, lossOnDeath: 0.33 },
};
export const DIFF_LABEL: Record<Difficulty, string> = {
  "dificil": "Difícil", "muito-dificil": "Muito Difícil", "impossivel": "Impossível",
};

/* ---------------- entity types ---------------- */
type NodeType = "tree" | "pine" | "rock" | "ore" | "crystal" | "bush" | "berry";
interface RNode { type: NodeType; x: number; y: number; hp: number; maxHp: number; respawn: number; wob: number; skin?: string; stumpHp?: number; }
interface Drop { res: ResKey; x: number; y: number; vx: number; vy: number; n: number; t: number; }
type MonType = "imp" | "crawler" | "stalker" | "brute" | "hulk" | "spitter" | "bat" | "slime" | "demon" | "lizard" | "orc" | "zombie" | "skeleton" | "vampire" | "lich";
interface Monster {
  type: MonType; x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; dmg: number; speed: number; r: number;
  state: "idle" | "chase" | "windup" | "attack" | "hurt";
  t: number; atkCd: number; flash: number; home: { x: number; y: number };
  dir: number;
  siege: boolean;
  detourSide?: -1 | 1;
  skin: string;
  rare?: boolean;
  defeated?: boolean;
}
interface Projectile { x: number; y: number; vx: number; vy: number; t: number; dmg: number; kind?: "ally" | "player" | "magic"; }
type StructType = "campfire" | "wall" | "gate" | "spike_trap" | "barricade" | "training" | "workbench" | "house" | "farm" | "sawmill" | "quarry" | "forge" | "tower" | "raft";
interface Structure { type: StructType; x: number; y: number; prodT: number; hp: number; maxHp: number; open: boolean; rotation: number; fenceStyle: FenceStyle; tier?: DefenseTier; }
interface MagicEffect { x: number; y: number; remaining: number; }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; max: number; c: string; s: number; grav: number; }
interface Floater { x: number; y: number; t: number; text: string; c: string; }
interface Ally { id: string; name: string; color: string; x: number; y: number; vx: number; vy: number; atkCd: number; downT: number; dir: number; }
interface RemotePlayer { id: string; name: string; x: number; y: number; hp: number; tx: number; ty: number; }
interface Villager { x: number; y: number; vx: number; vy: number; t: number; dir: number; steps: number; c: string; look: string; line: string; goalX?: number; goalY?: number; stopT?: number; route?: number; blockedT?: number; hamletId?: string; figure?: number; displayName?: string; }
type AnimalKind = "rabbit" | "goose" | "goat";
interface Animal { kind: AnimalKind; x: number; y: number; vx: number; vy: number; t: number; hp: number; dir: number; flee: number; rare?: boolean; goalX?: number; goalY?: number; }
interface Chest { x: number; y: number; opened: boolean; loot: Partial<Record<ResKey, number>>; label: string; rare?: boolean; }
interface WorldProp { sprite: string; x: number; y: number; }
interface Bubble { who: string; text: string; t: number; dur: number; }
interface SpecialistProgress { id: SpecialistId; rescued: boolean; hired: boolean; duty: SpecialistDuty; training: number; weaponLevel: number; workTime: number; }
interface RescueEncounter { id: SpecialistId; x: number; y: number; phase: "waiting" | "fighting" | "safe"; defenders: Monster[]; }
interface Escort { active: boolean; wp: { x: number; y: number; line: string }[]; i: number; waitT: number; }

const SPECIALIST_IDS: SpecialistId[] = ["archer", "mage", "guard", "miner"];
const SPECIALISTS: Record<SpecialistId, { name: string; role: string; hint: string; x: number; y: number; color: string }> = {
  archer: { name: "Arqueiro", role: "Combate à distância", hint: "A oeste da base, entre a clareira e a vila", x: BASE.x - 1050, y: BASE.y + 400, color: "#b7d68e" },
  mage: { name: "Maga", role: "Magia à distância", hint: "Nas proximidades das ruínas a oeste", x: 45 * TILE + 120, y: 77 * TILE + 100, color: "#9edcff" },
  guard: { name: "Espadachim", role: "Defesa corpo a corpo", hint: "A sudeste da base", x: BASE.x + 650, y: BASE.y + 610, color: "#f1bb82" },
  miner: { name: "Minerador", role: "Produção de minérios", hint: "No campo mineral ao norte", x: MINERAL_BASIN.x, y: MINERAL_BASIN.y + 180, color: "#d8ca9d" },
};
function newSpecialists(): Record<SpecialistId, SpecialistProgress> {
  return Object.fromEntries(SPECIALIST_IDS.map((id) => [id, { id, rescued: false, hired: false, duty: id === "miner" ? "mine" : "follow", training: 0, weaponLevel: 1, workTime: 0 }])) as Record<SpecialistId, SpecialistProgress>;
}

interface QuestDef { id: string; name: string; desc: string; target: number; reward: string; }
const QUESTS: QuestDef[] = [
  { id: "q1", name: "Primeiros Passos", desc: "Colete madeira e pedra (total)", target: 60, reward: "Desbloqueia a Bancada" },
  { id: "q2", name: "Caçador", desc: "Derrote monstros", target: 20, reward: "Maya se junta à base" },
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
  spike_trap: { name: "Armadilha de espinhos", icon: "⚔️", desc: "Espinhos atravessáveis ferem invasores; não atingem você nem aliados.", cost: { wood: 12, stone: 5 }, lvl: 0 },
  barricade: { name: "Barricada", icon: "🛡️", desc: "Barreira sólida que atrasa invasores. Repare com madeira.", cost: { wood: 20, stone: 5 }, lvl: 0 },
  training: { name: "Arena de treino", icon: "🎯", desc: "Espaço para os profissionais treinarem. Designe-os na aba Pessoas.", cost: { wood: 45, stone: 10, fiber: 12 }, lvl: 1 },
  workbench: { name: "Bancada", icon: "🛠️", desc: "Desbloqueia construções avançadas", cost: { wood: 45, stone: 25, fiber: 10 }, lvl: 2 },
  farm: { name: "Fazenda", icon: "🌱", desc: "Produz comida durante o dia", cost: { wood: 35, fiber: 20 }, lvl: 1 },
  sawmill: { name: "Serraria", icon: "🪚", desc: "Produz madeira lentamente", cost: { wood: 65, stone: 30 }, lvl: 2 },
  quarry: { name: "Pedreira", icon: "⚒️", desc: "Produz pedra lentamente", cost: { wood: 50, stone: 65 }, lvl: 2 },
  house: { name: "Casa", icon: "🏠", desc: "+12 vida máxima; o limite aumenta com o território", cost: { wood: 85, stone: 45, fiber: 20 }, lvl: 2 },
  forge: { name: "Forja", icon: "🔨", desc: "Permite melhorar ferramentas e armas", cost: { wood: 35, stone: 70, iron: 12 }, lvl: 3 },
  tower: { name: "Torre de Vigia", icon: "🗼", desc: "Revela monstros no minimapa", cost: { wood: 75, stone: 55, iron: 10 }, lvl: 2 },
  raft: { name: "Balsa de Fuga", icon: "⛵", desc: "Sua passagem para fora da ilha (construa na praia)", cost: { wood: 600, stone: 280, fiber: 260, iron: 160, crystal: 60 }, lvl: 4 },
};
const BUILD_ORDER: StructType[] = ["campfire", "wall", "gate", "spike_trap", "barricade", "training", "farm", "workbench", "house", "sawmill", "quarry", "tower", "forge", "raft"];
const DEFENSE_TIERS: { tier: DefenseTier; realm: number; forge: boolean; damage: number; trapHp: number; barricadeHp: number; trapCost: Partial<Record<ResKey, number>>; barricadeCost: Partial<Record<ResKey, number>> }[] = [
  { tier: 1, realm: 0, forge: false, damage: 8, trapHp: 100, barricadeHp: 200, trapCost: { wood: 12, stone: 5 }, barricadeCost: { wood: 20, stone: 5 } },
  { tier: 2, realm: 3, forge: false, damage: 12, trapHp: 150, barricadeHp: 320, trapCost: { wood: 20, stone: 10, iron: 2 }, barricadeCost: { wood: 28, stone: 10, iron: 3 } },
  { tier: 3, realm: 6, forge: true, damage: 18, trapHp: 210, barricadeHp: 480, trapCost: { wood: 18, stone: 18, iron: 7 }, barricadeCost: { wood: 35, stone: 20, iron: 8 } },
  { tier: 4, realm: 10, forge: true, damage: 25, trapHp: 280, barricadeHp: 700, trapCost: { wood: 20, stone: 28, iron: 12, crystal: 2 }, barricadeCost: { wood: 45, stone: 30, iron: 16, crystal: 3 } },
];
const TRAP_REARM = 1.4;
function defenseTier(value: unknown): DefenseTier {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4 ? value as DefenseTier : 1;
}
const FENCE_DEF: Record<FenceStyle, { name: string; desc: string; hp: number; cost: Partial<Record<ResKey, number>>; lockLevel: number }> = {
  rustic: { name: "Cerca rústica", desc: "Tábuas claras com travessas. Barata e rápida de reparar.", hp: 245, cost: { wood: 9, fiber: 2 }, lockLevel: 0 },
  palisade: { name: "Paliçada reforçada", desc: "Estacas afiadas, ferragens, cordas e escoras.", hp: 390, cost: { wood: 13, stone: 3, iron: 1 }, lockLevel: 0 },
  stone: { name: "Muralha de pedra", desc: "Blocos cinza com pilares. Resiste melhor aos colossos.", hp: 640, cost: { stone: 18, iron: 2 }, lockLevel: 3 },
  hedge: { name: "Cerca viva", desc: "Treliça coberta por folhas; recupera vida lentamente durante o dia.", hp: 310, cost: { wood: 8, fiber: 12, food: 2 }, lockLevel: 2 },
};

/* ---------------- helpers ---------------- */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Purely visual arc for the stationary 0.26s jump. */
export function dodgeJumpHeight(remaining: number): number {
  if (remaining <= 0 || remaining >= 0.26) return 0;
  return Math.sin(Math.PI * (1 - remaining / 0.26)) * 20;
}
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
};

// Shadows are reused across the many visible trees and objects.
const shadowCache = new Map<number, HTMLCanvasElement>();

interface SaveData {
  v: number; seed: number;
  px: number; py: number; hp: number; maxHp: number;
  inv: Record<ResKey, number>; tools: Record<ToolKey, number>;
  time: number; day: number; score: number; kills: number; deaths: number;
  structures: { type: StructType; x: number; y: number; hp?: number; open?: boolean; rotation?: number; fenceStyle?: FenceStyle; tier?: DefenseTier }[];
  questP: number[]; questDone: boolean[];
  allies: string[]; visited: string[];
  nodeHp: [number, number, number][];
  nodeStumps?: [number, number][];
  chests?: boolean[];
  escortDone?: boolean;
  escortIndex?: number;
  rianDuty?: RianDuty;
  discoveredSites?: string[];
  claimedSites?: string[];
  seenCreatures?: string[];
  creatureKills?: Record<string, number>;
  equipment?: Partial<Record<EquipmentKey, boolean>>;
  fenceStyle?: FenceStyle;
  defenseTier?: DefenseTier;
  combatWeapon?: CombatWeapon;
  territoryLevel?: number;
  territoryLayout?: "compact" | "legacy";
  fenceRing?: number;
  buildPatrolDay?: number;
  pendingRespawn?: boolean;
  deathReport?: DeathReport | null;
  specialists?: Partial<Record<SpecialistId, SpecialistProgress>>;
  crystalDiscovered?: boolean;
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
  // Remember the original coastline before carving rivers. This is audio-only
  // metadata; saved worlds and the generated terrain stay unchanged.
  private oceanTiles = new Uint8Array(W * H);
  nodes: RNode[] = [];
  nodeBuckets = new Map<number, RNode[]>();
  depletedNodes = new Set<RNode>();
  shakingNodes = new Set<RNode>();
  monsters: Monster[] = [];
  drops: Drop[] = [];
  projectiles: Projectile[] = [];
  magicEffects: MagicEffect[] = [];
  structures: Structure[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  allies: Ally[] = [];
  villagers: Villager[] = [];
  hamlets: Hamlet[] = [];
  specialists = newSpecialists();
  crystalDiscovered = false;
  rescues: RescueEncounter[] = [];
  remotes: RemotePlayer[] = [];
  animals: Animal[] = [];
  chests: Chest[] = [];
  bubbles: Bubble[] = [];
  escort: Escort = { active: false, wp: [], i: 0, waitT: 0 };
  rianDuty: RianDuty = "stay";
  terrain: Terrain | null = null;
  placing: StructType | null = null;
  placeX = 0; placeY = 0; placeReason = "";
  placeRotation = 0;
  fenceSlot = 0;
  fenceStyle: FenceStyle = "palisade";
  defenseTier: DefenseTier = 1;
  territoryLevel = 1;
  legacyTerritory = false;
  fenceRing = 1;
  private fenceSpaceCache: { ring: number; structures: Structure[]; length: number; references: string; pieces: 1 | 2; reserveGate: boolean } | null = null;
  lastTutId = "";
  animalT = 0;
  spawnCooldown = 8;
  buildPatrolDay = 0;
  raidPeak = 0;
  pendingRespawn = false;
  deathReport: DeathReport | null = null;
  wakeT = 0;
  recoveryNoticeT = 0;
  worldProps: WorldProp[] = [];
  villageHouses: VillageHouse[] = [];
  villageBuildings: VillageBuilding[] = [];
  private roads: ReturnType<typeof tileAreaIndex> | null = null;
  private nodeExclusions: ReturnType<typeof tileAreaIndex> | null = null;
  private savedNodeExclusions: ReturnType<typeof tileAreaIndex> | null = null;

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
  combatWeapon: CombatWeapon = "sword";
  swingTool: ToolKey = "axe";
  swingBow = false;
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
  cutParticleAcc = 0;
  prodToastT = 0;
  windCheckT = 0;
  footstepT = 0;
  private ambienceSilenced = true;
  fireContactT = 0;

  // minimap
  mini: HTMLCanvasElement | null = null;

  // light canvas
  lightCv: HTMLCanvasElement | null = null;
  lightStamp: HTMLCanvasElement | null = null;
  hudCv: HTMLCanvasElement | null = null;
  hudAt = -1000;
  hudHp = -1;
  // Fence rails are static between building changes. Cache each short link
  // instead of issuing hundreds of identical strokes at every frame.
  fenceLinks = new Map<string, { canvas: HTMLCanvasElement; left: number; top: number }>();
  fencePosts = new Map<string, { canvas: HTMLCanvasElement; left: number; top: number }>();

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
    // Optional assets load asynchronously; procedural art works immediately.
    if (this.settings.craftPix) { void loadCraftPix(); void loadReferenceArt(); }
    this.sfx.vol = Math.max(0, Math.min(1, this.settings.sfxVol)) * 0.5;
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
    this.initRescues();
    if (loaded) {
      // A death already saved its consequences; reloading must not restore a
      // previous inventory or apply the raid a second time.
      this.state = this.pendingRespawn ? "gameover" : "playing";
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
    this.savedNodeExclusions = null;
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
        const index = y * W + x;
        this.tiles[index] = t;
        this.oceanTiles[index] = t === T_WATER ? 1 : 0;
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
    this.addBiomeDetails(seed);
    this.distributeBiomes(seed);
    this.prepareLegacyVillageFoundations();
    this.prepareHamlets();
    this.planVillageBuildings();
    this.spaceDeposits();
    this.spaceTrees();
    this.spaceSmallPlants();
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
    // Optional buildings appear only after their images load; their solid
    // footprints are enabled at the same time so fallbacks stay unobstructed.
    this.worldProps.push(
      { sprite: "reference_market", x: VILLAGE.x + 220, y: VILLAGE.y + 35 },
      { sprite: "reference_chapel", x: VILLAGE.x + 145, y: VILLAGE.y - 200 },
      { sprite: "reference_camp", ...CAMP_COMPACT },
      { sprite: "reference_sewer", x: CAVE.x + 160, y: CAVE.y + 195 },
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

  /** Add the mineral basin and three small streams after legacy node generation.
   * No random numbers are consumed and existing node indices never change. */
  private addBiomeDetails(seed: number) {
    const basin = MINERAL_BASIN;
    const x0 = Math.floor((basin.x - basin.rx) / TILE), x1 = Math.ceil((basin.x + basin.rx) / TILE);
    const y0 = Math.floor((basin.y - basin.ry) / TILE), y1 = Math.ceil((basin.y + basin.ry) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const nx = (x * TILE - basin.x) / basin.rx, ny = (y * TILE - basin.y) / basin.ry;
      const irregular = Math.sin(x * 0.8 + y * 0.5 + seed * 0.0001) * 0.08;
      const i = y * W + x, t = this.tiles[i];
      if (nx * nx + ny * ny < 1 + irregular && (t === T_GRASS || t === T_ROCK)) this.tiles[i] = T_MINERAL;
    }
    // New deposits are appended after the old glacier deposits, preserving
    // nodeHp indices from existing saves and their regeneration order.
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.39996 + (seed % 101) * 0.01, radius = Math.sqrt((i + 1) / 38);
      const x = basin.x + Math.cos(angle) * basin.rx * radius * 0.86;
      const y = basin.y + Math.sin(angle) * basin.ry * radius * 0.82;
      if (this.tileAt(x, y) !== T_MINERAL) continue;
      const type: NodeType = i % 4 === 0 ? "crystal" : i % 4 === 1 ? "rock" : "ore";
      const hp = type === "rock" ? 30 : type === "ore" ? 44 : 56;
      this.nodes.push({ type, x, y, hp, maxHp: hp, respawn: 0, wob: 0 });
    }

    const streams: readonly (readonly [number, number][])[] = [
      [[39, 78], [32, 84], [25, 91], [17, 95]],
      [[158, 103], [165, 112], [169, 122], [178, 132]],
      [[66, 146], [73, 151], [79, 158], [85, 163]],
    ];
    const protectedTile = (x: number, y: number) => {
      const wx = x * TILE, wy = y * TILE;
      return dist2(wx, wy, BASE.x, BASE.y) < 1050 ** 2 || dist2(wx, wy, VILLAGE.x, VILLAGE.y) < 850 ** 2
        || dist2(wx, wy, WAKE.x, WAKE.y) < 270 ** 2 || SITES.some((site) => dist2(wx, wy, site.x, site.y) < 160 ** 2);
    };
    for (const stream of streams) for (let s = 0; s < stream.length - 1; s++) {
      const [ax, ay] = stream[s], [bx, by] = stream[s + 1];
      const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy), steps = Math.ceil(length * 3);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, bend = Math.sin((s + t) * Math.PI) * 0.65;
        for (const side of [0, 1]) {
          const x = Math.round(ax + dx * t - dy / length * (bend + side));
          const y = Math.round(ay + dy * t + dx / length * (bend + side));
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 || protectedTile(x, y)) continue;
          const at = y * W + x, tile = this.tiles[at];
          // Existing roads remain dry crossings. Sites, ice, and village/base
          // are left intact, so the escort and kingdom stay reachable.
          if (tile === T_PATH || tile === T_BRIDGE || tile === T_SNOW_PATH) this.tiles[at] = T_BRIDGE;
          else if (tile === T_GRASS || tile === T_DARK || tile === T_ROCK || tile === T_MINERAL || tile === T_SAND) this.tiles[at] = T_WATER;
        }
      }
    }
    // Older resource indices stay valid even where a new creek runs through a
    // node: move that node to the closest dry tile instead of removing it.
    for (const node of this.nodes) {
      if (this.tileAt(node.x, node.y) !== T_WATER) continue;
      const tx = Math.floor(node.x / TILE), ty = Math.floor(node.y / TILE);
      let placed = false;
      for (let r = 1; r <= 8 && !placed; r++) for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
        if (this.tileAt(x, y) !== T_WATER) { node.x = x; node.y = y; placed = true; break; }
      }
    }
  }

  /** Color existing grass as distinct western and southern biomes without
   * consuming the original RNG, changing resource order, roads or water. */
  private distributeBiomes(seed: number) {
    const regions = [
      { x: 47, y: 107, rx: 19, ry: 13, tile: T_AUTUMN },
      { x: 116, y: 125, rx: 19, ry: 15, tile: T_BLOSSOM },
      { x: 48, y: 48, rx: 15, ry: 12, tile: T_AUTUMN },
      { x: 115, y: 151, rx: 14, ry: 10, tile: T_BLOSSOM },
    ];
    for (const region of regions) {
      for (let y = Math.max(1, region.y - region.ry - 2); y <= Math.min(H - 2, region.y + region.ry + 2); y++) {
        for (let x = Math.max(1, region.x - region.rx - 2); x <= Math.min(W - 2, region.x + region.rx + 2); x++) {
          const index = y * W + x;
          if (this.tiles[index] !== T_GRASS) continue;
          const d = ((x - region.x) / region.rx) ** 2 + ((y - region.y) / region.ry) ** 2;
          const edge = Math.sin(x * 0.63 + y * 0.31 + (seed % 37)) * 0.1;
          if (d < 1 + edge) this.tiles[index] = region.tile;
        }
      }
    }
    this.nodes.forEach((node, index) => {
      if (node.type !== "tree" && node.type !== "pine") return;
      const tile = this.tileAt(node.x, node.y);
      if (tile === T_AUTUMN) node.skin = index % 5 === 0 ? "tree_fruit" : "tree_autumn";
      if (tile === T_BLOSSOM) node.skin = index % 5 === 0 ? "tree_fruit" : "tree_cherry";
    });
  }

  /** Lay only short paths to existing roads and reserve two spaced houses per
   * village. Never reorder/delete old resource nodes or touch the base ring. */
  private prepareHamlets() {
    this.hamlets = HAMLET_DEFS.map((village) => ({ ...village, houses: [] }));
    for (const village of this.hamlets) {
      const tx = Math.floor(village.x / TILE), ty = Math.floor(village.y / TILE);
      let best = Infinity, target: { x: number; y: number } | null = null;
      for (let y = Math.max(1, ty - 35); y <= Math.min(H - 2, ty + 35); y++) {
        for (let x = Math.max(1, tx - 35); x <= Math.min(W - 2, tx + 35); x++) {
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < best && d >= 36 && (this.tiles[y * W + x] === T_PATH || this.tiles[y * W + x] === T_BRIDGE)) { best = d; target = { x, y }; }
        }
      }
      // A compact dry square ensures residents and their entrances can be
      // reached across seeds; preserve water elsewhere and bridge crossings.
      for (let y = ty - 5; y <= ty + 5; y++) for (let x = tx - 5; x <= tx + 5; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const i = y * W + x;
        if (this.tiles[i] === T_WATER) this.tiles[i] = T_GRASS;
        if (Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2 && this.tiles[i] !== T_RUIN && this.tiles[i] !== T_NECRO) this.tiles[i] = T_PATH;
      }
      for (const [dx, dy] of LEGACY_HAMLET_HOUSES) {
        const house = { x: village.x + dx, y: village.y + dy };
        for (let y = Math.floor((house.y - 345) / TILE); y <= Math.ceil((house.y + 50) / TILE); y++) {
          for (let x = Math.floor((house.x - 160) / TILE); x <= Math.ceil((house.x + 160) / TILE); x++) {
            if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && this.tiles[y * W + x] === T_WATER) this.tiles[y * W + x] = T_GRASS;
          }
        }
      }
      if (target) {
        const steps = Math.max(Math.abs(target.x - tx), Math.abs(target.y - ty)) * 3;
        for (let step = 0; step <= steps; step++) {
          const x = Math.round(tx + (target.x - tx) * step / steps), y = Math.round(ty + (target.y - ty) * step / steps);
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox, yy = y + oy;
            if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
            const wx = xx * TILE, wy = yy * TILE;
            if (dist2(wx, wy, BASE.x, BASE.y) < 1100 ** 2 || SITES.some((site) => dist2(wx, wy, site.x, site.y) < 170 ** 2)) continue;
            const i = yy * W + xx, tile = this.tiles[i];
            if (tile === T_WATER || tile === T_BRIDGE) this.tiles[i] = T_BRIDGE;
            else if (tile !== T_RUIN && tile !== T_NECRO && tile !== T_CAVE && tile !== T_ICE) this.tiles[i] = T_PATH;
          }
        }
      }
    }
  }

  /** Keep pre-existing dry foundations without consuming RNG or altering
   * resource indices. The visible buildings are placed separately below. */
  private prepareLegacyVillageFoundations() {
    for (const [dx, dy] of LEGACY_VILLAGE_HOUSES) {
      const hx = VILLAGE.x + dx, hy = VILLAGE.y + dy;
      for (let y = Math.floor((hy - 350) / TILE); y <= Math.ceil((hy + 55) / TILE); y++) {
        for (let x = Math.floor((hx - 165) / TILE); x <= Math.ceil((hx + 165) / TILE); x++) {
          if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && this.tiles[y * W + x] === T_WATER) this.tiles[y * W + x] = T_GRASS;
        }
      }
    }
  }

  /** Find dry sites off every finished path. All sprite variants use the same
   * conservative rectangles, so asynchronous/disabled art cannot change the
   * layout or leave an invisible obstacle in the road. No RNG is consumed. */
  private planVillageBuildings() {
    this.roads = tileAreaIndex(this.tiles, W, H, TILE, (tile) => tile === T_PATH || tile === T_BRIDGE || tile === T_SNOW_PATH);
    const water = tileAreaIndex(this.tiles, W, H, TILE, (tile) => tile === T_WATER);
    const occupied: WorldRect[] = [];
    const plazas = [VILLAGE, ...this.hamlets].map((v) => ({ left: v.x - 112, right: v.x + 112, top: v.y - 100, bottom: v.y + 110 }));
    // A dry footprint alone may be on an isolated islet. Require an entrance
    // in the base's connected land/bridge component before placing anything.
    const connected = new Uint8Array(W * H), roadNetwork = new Uint8Array(W * H), queue = new Int32Array(W * H);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const start = Math.floor(BASE.y / TILE) * W + Math.floor(BASE.x / TILE);
    const flood = (result: Uint8Array, roadOnly: boolean) => {
      let head = 0, tail = 0; result[start] = 1; queue[tail++] = start;
      while (head < tail) {
        const i = queue[head++], x = i % W, y = Math.floor(i / W);
        for (const [dx, dy] of directions) {
          const nx = x + dx, ny = y + dy, next = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || result[next]) continue;
          const tile = this.tiles[next];
          if (tile === T_WATER || (roadOnly && tile !== T_PATH && tile !== T_BRIDGE && tile !== T_SNOW_PATH)) continue;
          result[next] = 1; queue[tail++] = next;
        }
      }
    };
    flood(connected, false); flood(roadNetwork, true);
    const solidTiles = new Uint8Array(W * H), seen = new Uint32Array(W * H);
    let searchId = 0;
    const inSolid = (tx: number, ty: number, x: number, y: number, halfWidth: number, depth: number) => {
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
      return Math.abs(px - x) < halfWidth && py > y - depth && py < y + 8;
    };
    const markSolid = (x: number, y: number, halfWidth: number, depth: number) => {
      for (let ty = Math.max(0, Math.floor((y - depth) / TILE)); ty <= Math.min(H - 1, Math.floor((y + 8) / TILE)); ty++)
        for (let tx = Math.max(0, Math.floor((x - halfWidth) / TILE)); tx <= Math.min(W - 1, Math.floor((x + halfWidth) / TILE)); tx++)
          if (inSolid(tx, ty, x, y, halfWidth, depth)) solidTiles[ty * W + tx] = 1;
    };
    const entryReachesRoad = (x: number, y: number, halfWidth: number, depth: number) => {
      const ex = Math.floor(x / TILE), ey = Math.floor((y + 24) / TILE);
      if (ex < 0 || ex >= W || ey < 0 || ey >= H || !connected[ey * W + ex]) return false;
      let head = 0, tail = 0; const id = ++searchId, entry = ey * W + ex;
      seen[entry] = id; queue[tail++] = entry;
      while (head < tail) {
        const i = queue[head++], tx = i % W, ty = Math.floor(i / W);
        if (roadNetwork[i]) return true;
        for (const [dx, dy] of directions) {
          const nx = tx + dx, ny = ty + dy, next = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[next] === id || solidTiles[next] || this.tiles[next] === T_WATER || inSolid(nx, ny, x, y, halfWidth, depth)) continue;
          seen[next] = id; queue[tail++] = next;
        }
      }
      return false;
    };
    const distanceToRect = (x: number, y: number, r: WorldRect) => dist2(x, y, clamp(x, r.left, r.right), clamp(y, r.top, r.bottom));
    const place = (preferredX: number, preferredY: number, width: number, height: number, home: { x: number; y: number }, maxDistance: number, halfWidth: number, depth: number) => {
      // Usually the first, all-dry pass succeeds. A larger all-dry search is
      // safer than filling a stream or moving an existing player-built base.
      for (const limit of [maxDistance, 2000, 3000]) for (const offset of layoutOffsets()) {
        const x = preferredX + offset.x, y = preferredY + offset.y;
        if (dist2(x, y, home.x, home.y) > limit * limit) continue;
        const rect = anchoredRect(x, y, width, height, 12);
        const entryX = Math.floor(x / TILE), entryY = Math.floor((y + 24) / TILE);
        if (entryX < 0 || entryX >= W || entryY < 0 || entryY >= H || !connected[entryY * W + entryX]) continue;
        if (this.roads!.count(rect) || water.count(rect)) continue;
        if (plazas.some((p) => rectanglesOverlap(rect, p, 12)) || occupied.some((b) => rectanglesOverlap(rect, b, 50))) continue;
        if (distanceToRect(BASE.x, BASE.y, rect) < 1000 ** 2 || distanceToRect(CRASH.x, CRASH.y, rect) < 220 ** 2) continue;
        if (SITES.some((site) => distanceToRect(site.x, site.y, rect) < 160 ** 2)) continue;
        if (!entryReachesRoad(x, y, halfWidth, depth)) continue;
        occupied.push(rect); markSolid(x, y, halfWidth, depth); return { x, y };
      }
      return null;
    };

    this.villageBuildings = [];
    for (const def of VILLAGE_BUILDING_DEFS) {
      const point = place(VILLAGE.x + def.dx, VILLAGE.y + def.dy, def.width, def.height, VILLAGE, 1000, def.halfWidth, def.depth);
      const prop = this.worldProps.find((p) => p.sprite === `reference_${def.name}`);
      if (!point) { if (prop) this.worldProps = this.worldProps.filter((p) => p !== prop); continue; }
      const building: VillageBuilding = { name: def.name, ...point, halfWidth: def.halfWidth, depth: def.depth, width: def.width, height: def.height };
      this.villageBuildings.push(building);
      if (prop) Object.assign(prop, point);
    }
    this.villageHouses = [];
    const homes = [[-680, -400], [-130, 1160], [850, 650], [900, 120], [-780, 130]] as const;
    for (const [index, [dx, dy]] of homes.entries()) {
      const point = place(VILLAGE.x + dx, VILLAGE.y + dy, 220 * VILLAGE_HOUSE_SCALE, 250 * VILLAGE_HOUSE_SCALE, VILLAGE, 1600, 100 * VILLAGE_HOUSE_SCALE, 250 * VILLAGE_HOUSE_SCALE / 1.35);
      if (point) this.villageHouses.push({ ...point, index, scale: VILLAGE_HOUSE_SCALE });
    }
    for (const [villageIndex, hamlet] of this.hamlets.entries()) {
      hamlet.houses = [];
      for (const [houseIndex, dx] of [-380, 380].entries()) {
        const point = place(hamlet.x + dx, hamlet.y - 110, 220 * HAMLET_HOUSE_SCALE, 250 * HAMLET_HOUSE_SCALE, hamlet, 900, 100 * HAMLET_HOUSE_SCALE, 250 * HAMLET_HOUSE_SCALE / 1.35);
        if (point) hamlet.houses.push({ ...point, index: villageIndex + houseIndex + 1, scale: HAMLET_HOUSE_SCALE });
      }
    }

    // One mask reserves both road tiles and visible building/plaza areas. A
    // query uses the full tree/deposit/plant art rectangle, not just its trunk.
    const excluded = new Uint8Array(W * H);
    for (let i = 0; i < excluded.length; i++) {
      const tile = this.tiles[i];
      if (tile === T_PATH || tile === T_BRIDGE || tile === T_SNOW_PATH) excluded[i] = 1;
    }
    const mark = (rect: WorldRect) => {
      const x0 = Math.max(0, Math.floor(rect.left / TILE)), x1 = Math.min(W - 1, Math.ceil(rect.right / TILE));
      const y0 = Math.max(0, Math.floor(rect.top / TILE)), y1 = Math.min(H - 1, Math.ceil(rect.bottom / TILE));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) excluded[y * W + x] = 1;
    };
    for (const rect of occupied) mark({ left: rect.left - 16, right: rect.right + 16, top: rect.top - 16, bottom: rect.bottom + 16 });
    for (const h of this.hamlets) mark({ left: h.x - 310, right: h.x + 310, top: h.y - 150, bottom: h.y + 280 });
    for (const camp of [CAMP_COMPACT, CAMP_LEGACY]) mark({ left: camp.x - 95, right: camp.x + 95, top: camp.y - 170, bottom: camp.y + 20 });
    this.nodeExclusions = tileAreaIndex(excluded, W, H, TILE, (tile) => tile === 1);
  }

  private resourceAreaBlocked(type: string, x: number, y: number) {
    const bounds = resourceArtBounds(type, x, y);
    return !!(this.nodeExclusions?.count(bounds) || this.savedNodeExclusions?.count(bounds));
  }

  /** A new deterministic layout can move a tree onto an old player build.
   * Reserve saved builds first, then reposition only as needed in the same
   * node order, so saved health/stumps still apply to the same indices. */
  private protectSavedStructuresFromNodes() {
    if (!this.structures.length) return;
    const excluded = new Uint8Array(W * H);
    const mark = (rect: WorldRect) => {
      const x0 = Math.max(0, Math.floor(rect.left / TILE)), x1 = Math.min(W - 1, Math.ceil(rect.right / TILE));
      const y0 = Math.max(0, Math.floor(rect.top / TILE)), y1 = Math.min(H - 1, Math.ceil(rect.bottom / TILE));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) excluded[y * W + x] = 1;
    };
    for (const st of this.structures) {
      if (st.type === "wall" || st.type === "gate") mark({ left: st.x - 60, right: st.x + 60, top: st.y - 60, bottom: st.y + 60 });
      else if (st.type === "training") mark({ left: st.x - 110, right: st.x + 110, top: st.y - 90, bottom: st.y + 90 });
      else mark(anchoredRect(st.x, st.y + (st.type === "house" ? 60 : 35), st.type === "house" ? 300 : 150, st.type === "house" ? 320 : 230));
    }
    const builds = tileAreaIndex(excluded, W, H, TILE, (tile) => tile === 1);
    if (!this.nodes.some((node) => builds.count(resourceArtBounds(node.type, node.x, node.y)))) return;
    for (const chest of this.chests) mark({ left: chest.x - 35, right: chest.x + 35, top: chest.y - 55, bottom: chest.y + 15 });
    this.savedNodeExclusions = tileAreaIndex(excluded, W, H, TILE, (tile) => tile === 1);
    this.spaceDeposits(); this.spaceTrees(); this.spaceSmallPlants();
    this.rebuildNodeBuckets();
  }

  /** Spread harvestable rocks and minerals after paths and village clearings.
   * Reposition rather than delete: saved node indices and health stay intact. */
  private spaceDeposits() {
    const cell = 96, occupied = new Map<string, RNode[]>();
    const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    const clear = (x: number, y: number, terrain: number, spacing: number) => {
      if (x < TILE || y < TILE || x >= WPX - TILE || y >= HPX - TILE) return false;
      const tile = this.tileAt(x, y);
      // Dense mineral patches can spill into neighboring rock/grass without
      // generating new nodes or consuming random numbers.
      const mineralFringe = terrain === T_MINERAL && (tile === T_ROCK || tile === T_GRASS || tile === T_AUTUMN) &&
        ((x - MINERAL_BASIN.x) / MINERAL_BASIN.rx) ** 2 + ((y - MINERAL_BASIN.y) / MINERAL_BASIN.ry) ** 2 < 3.2;
      const onRoad = terrain === T_WATER || terrain === T_PATH || terrain === T_BRIDGE || terrain === T_SNOW_PATH;
      if (tile === T_WATER || (!onRoad && tile !== terrain && !mineralFringe)) return false;
      if (this.resourceAreaBlocked("rock", x, y)) return false;
      if ([WAKE, RIAN_START, { x: CRASH.x + 110, y: CRASH.y - 60 }, { x: BASE.x + 100, y: BASE.y - 40 },
        { x: VILLAGE.x + 70, y: VILLAGE.y + 30 }, { x: MINERAL_BASIN.x + 70, y: MINERAL_BASIN.y + 50 }].some((p) => dist2(x, y, p.x, p.y) < 90 ** 2)) return false;
      if (SITES.some((site) => dist2(x, y, site.x, site.y) < 150 ** 2)) return false;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((occupied.get(`${cx + dx},${cy + dy}`) ?? []).some((other) => dist2(x, y, other.x, other.y) < spacing ** 2)) return false;
      }
      return true;
    };
    this.nodes.forEach((node, index) => {
      if (node.type !== "rock" && node.type !== "ore" && node.type !== "crystal") return;
      const terrain = this.tileAt(node.x, node.y), x0 = node.x, y0 = node.y;
      if (!clear(x0, y0, terrain, 90)) {
        let placed = false;
        for (const spacing of [90, 80, 70, 60, 50]) {
          for (let attempt = 0; attempt < 512; attempt++) {
            const angle = index * 1.1 + attempt * 2.399963, radius = 32 + Math.floor(attempt / 8) * 19;
            const x = x0 + Math.cos(angle) * radius, y = y0 + Math.sin(angle) * radius;
            if (clear(x, y, terrain, spacing)) { node.x = x; node.y = y; placed = true; break; }
          }
          if (placed) break;
        }
        if (!placed) for (let attempt = 0; attempt < 4096; attempt++) {
          const angle = index * 1.1 + attempt * 2.399963, radius = 32 + Math.floor(attempt / 8) * 19;
          const x = x0 + Math.cos(angle) * radius, y = y0 + Math.sin(angle) * radius;
          if (clear(x, y, T_WATER, 50)) { node.x = x; node.y = y; break; }
        }
      }
      const k = key(node.x, node.y), bucket = occupied.get(k) ?? [];
      bucket.push(node); occupied.set(k, bucket);
    });
  }

  /** Spread overlapping canopies without consuming RNG, deleting nodes or
   * changing their save indices. Candidates stay on matching/neighboring
   * terrain, away from roads, buildings and starting chests. */
  private spaceTrees() {
    const cell = 104, occupied = new Map<string, RNode[]>();
    const deposits = new Map<string, RNode[]>();
    for (const node of this.nodes) if (node.type === "rock" || node.type === "ore" || node.type === "crystal") {
      const key = `${Math.floor(node.x / cell)},${Math.floor(node.y / cell)}`, bucket = deposits.get(key) ?? [];
      bucket.push(node); deposits.set(key, bucket);
    }
    const treeCell = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    const clear = (x: number, y: number, terrain: number, spacing: number) => {
      if (x < TILE || y < TILE || x >= WPX - TILE || y >= HPX - TILE) return false;
      const tile = this.tileAt(x, y), onRoad = terrain === T_WATER || terrain === T_PATH || terrain === T_BRIDGE || terrain === T_SNOW_PATH;
      const relatedTerrain = (terrain === T_ICE && tile === T_SNOW) ||
        (terrain === T_RUIN && [T_GRASS, T_AUTUMN, T_BLOSSOM].includes(tile)) ||
        (terrain === T_NECRO && [T_DARK, T_GRASS].includes(tile)) ||
        (terrain === T_MINERAL && [T_ROCK, T_GRASS, T_AUTUMN].includes(tile));
      if (tile === T_WATER || (!onRoad && tile !== terrain && !relatedTerrain)) return false;
      if (this.resourceAreaBlocked("tree", x, y)) return false;
      if ([WAKE, RIAN_START, { x: CRASH.x + 110, y: CRASH.y - 60 }, { x: BASE.x + 100, y: BASE.y - 40 },
        { x: VILLAGE.x + 70, y: VILLAGE.y + 30 }].some((p) => dist2(x, y, p.x, p.y) < 55 ** 2)) return false;
      if (dist2(x, y, VILLAGE.x - 215, VILLAGE.y + 45) < 125 ** 2) return false;
      if ([CAMP_COMPACT, CAMP_LEGACY].some((p) => Math.abs(x - p.x) < 95 && y > p.y - 170 && y < p.y + 20)) return false;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((occupied.get(`${cx + dx},${cy + dy}`) ?? []).some((other) => dist2(x, y, other.x, other.y) < spacing ** 2)) return false;
        if ((deposits.get(`${cx + dx},${cy + dy}`) ?? []).some((other) => dist2(x, y, other.x, other.y) < 60 ** 2)) return false;
      }
      return true;
    };
    this.nodes.forEach((node, index) => {
      if (node.type !== "tree" && node.type !== "pine") return;
      const terrain = this.tileAt(node.x, node.y), x0 = node.x, y0 = node.y;
      const minimum = 88 + (index % 4) * 4;
      if (!clear(x0, y0, terrain, minimum)) {
        let placed = false;
        // Thin strips of a biome may not have room for the ideal spacing.
        // Gradually relax it instead of leaving two trunks on top of each other.
        for (const spacing of [minimum, 90, 76, 60, 50]) {
          for (let attempt = 0; attempt < (spacing === 50 ? 1024 : 512); attempt++) {
            const angle = (index * 1.1 + attempt * 2.399963), radius = 32 + Math.floor(attempt / 8) * 19;
            const x = x0 + Math.cos(angle) * radius, y = y0 + Math.sin(angle) * radius;
            if (clear(x, y, terrain, spacing)) { node.x = x; node.y = y; placed = true; break; }
          }
          if (placed) break;
        }
        if (!placed) for (let attempt = 0; attempt < 4096; attempt++) {
          const angle = index * 1.1 + attempt * 2.399963, radius = 32 + Math.floor(attempt / 8) * 19;
          const x = x0 + Math.cos(angle) * radius, y = y0 + Math.sin(angle) * radius;
          if (clear(x, y, T_WATER, 50)) { node.x = x; node.y = y; break; }
        }
      }
      const key = treeCell(node.x, node.y), bucket = occupied.get(key) ?? [];
      bucket.push(node); occupied.set(key, bucket);
    });
  }

  /** Small bushes and berries also leave trails and building entrances clear.
   * Their index and health remain unchanged, just like trees and deposits. */
  private spaceSmallPlants() {
    this.nodes.forEach((node, index) => {
      if (node.type !== "bush" && node.type !== "berry") return;
      const x0 = node.x, y0 = node.y, terrain = this.tileAt(x0, y0);
      const clear = (x: number, y: number, matchBiome: boolean) => {
        const tile = this.tileAt(x, y);
        if (tile === T_WATER || this.resourceAreaBlocked(node.type, x, y)) return false;
        const onRoad = terrain === T_WATER || terrain === T_PATH || terrain === T_BRIDGE || terrain === T_SNOW_PATH;
        return !matchBiome || onRoad || tile === terrain;
      };
      if (clear(x0, y0, true)) return;
      for (const matchBiome of [true, false]) {
        let placed = false;
        for (let attempt = 0; attempt < 2048; attempt++) {
          const angle = index * 1.1 + attempt * 2.399963, radius = 24 + Math.floor(attempt / 8) * 19;
          const x = x0 + Math.cos(angle) * radius, y = y0 + Math.sin(angle) * radius;
          if (clear(x, y, matchBiome)) { node.x = x; node.y = y; placed = true; break; }
        }
        if (placed) break;
      }
    });
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
      const terrain = this.tileAt(x, y);
      if (terrain !== T_GRASS && terrain !== T_AUTUMN && terrain !== T_BLOSSOM && terrain !== T_DARK && terrain !== T_SNOW && terrain !== T_ROCK && terrain !== T_MINERAL) continue;
      if (dist2(x, y, BASE.x, BASE.y) < BASE.r * BASE.r) continue;
      const r = Math.random(), rare = Math.random() < 0.06;
      // Reuse the supplied fauna rather than inventing unreferenced species:
      // hares/goats in snow and rocky fields, geese near the green forest.
      const kind: AnimalKind = terrain === T_SNOW ? (r < 0.7 ? "rabbit" : "goat")
        : terrain === T_ROCK || terrain === T_MINERAL ? (r < 0.7 ? "goat" : "rabbit")
          : terrain === T_DARK ? (r < 0.6 ? "rabbit" : "goat") : r < 0.5 ? "rabbit" : r < 0.8 ? "goose" : "goat";
      const hp = kind === "goat" ? 26 : kind === "goose" ? 14 : 10;
      this.animals.push({ kind, x, y, vx: 0, vy: 0, t: Math.random() * 3, hp: rare ? hp * 1.5 : hp, dir: 1, flee: 0, rare });
    }
  }

  placeChests() {
    this.chests = [
      { x: CRASH.x + 110, y: CRASH.y - 60, opened: false, loot: { wood: 10, fiber: 6, food: 4 }, label: "Bagagem do avião" },
      // Keep the enlarged chest beside, rather than underneath, the base flag.
      { x: BASE.x + 100, y: BASE.y - 40, opened: false, loot: { wood: 24, stone: 12, food: 3 }, label: "Kit do Rian" },
      { x: VILLAGE.x + 70, y: VILLAGE.y + 30, opened: false, loot: { stone: 10, fiber: 8, food: 6 }, label: "Baú do vilarejo" },
      { x: CAVE.x + 40, y: CAVE.y + CAVE.r * 0.6, opened: false, loot: { iron: 10, crystal: 2 }, label: "Baú da caverna" },
      { x: 150 * TILE, y: 102 * TILE, opened: false, loot: { iron: 6, food: 3, fiber: 10 }, label: "Baú sombrio" },
    ];
    // Chests keep their saved indices/loot, but sit beside paths and stay
    // visible outside foliage/buildings. The base chest stays at its old
    // position so it cannot conflict with an existing player's base.
    const buildings = [
      ...this.villageHouses.map((house) => houseBounds(house)),
      ...this.hamlets.flatMap((h) => h.houses.map((house) => houseBounds(house))),
      ...this.villageBuildings.map((b) => anchoredRect(b.x, b.y, b.width, b.height)),
    ];
    const chestClear = (x: number, y: number) => {
      const rect = anchoredRect(x, y + 4, 52, 34, 6);
      return this.tileAt(x, y) !== T_WATER && !this.roads!.count(rect) &&
        !buildings.some((b) => rectanglesOverlap(rect, b, 12)) &&
        !this.nodes.some((node) => node.hp > 0 && Math.abs(node.x - x) < 130 && Math.abs(node.y - y) < 200 && rectanglesOverlap(rect, resourceArtBounds(node.type, node.x, node.y), 8));
    };
    const moveOffPath = (chest: Chest) => {
      if (chestClear(chest.x, chest.y)) return;
      const startX = chest.x, startY = chest.y;
      let found = false;
      for (let ring = 1; ring <= 32 && !found; ring++) for (let dy = -ring; dy <= ring && !found; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = startX + dx * 16, y = startY + dy * 16;
        if (chestClear(x, y)) { chest.x = x; chest.y = y; found = true; break; }
      }
    };
    for (let i = 0; i < this.chests.length; i++) if (i !== 1) moveOffPath(this.chests[i]);
    // Append, never insert: saved chest-open flags use the original indices.
    const extras: Chest[] = [
      { x: MINERAL_BASIN.x + 70, y: MINERAL_BASIN.y + 50, opened: false, loot: { iron: 12, crystal: 5 }, label: "Tesouro dos cristais", rare: true },
      { x: GLACIER.x + 120, y: GLACIER.y + 80, opened: false, loot: { crystal: 4, iron: 6, food: 4 }, label: "Tesouro do degelo", rare: true },
      { x: 144 * TILE + 90, y: 108 * TILE + 75, opened: false, loot: { crystal: 3, iron: 8, fiber: 6 }, label: "Tesouro das ruínas", rare: true },
      { x: 44 * TILE, y: 90 * TILE, opened: false, loot: { fiber: 12, food: 7, crystal: 2 }, label: "Tesouro da floresta", rare: true },
    ];
    for (const chest of extras) { moveOffPath(chest); this.chests.push(chest); }
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
        vx: 0, vy: 0, t: Math.random() * 4, dir: Math.PI / 2, steps: 0, c: cols[i], look: `v${i}`, line: lines[i],
      });
    }
    for (const [index, hamlet] of this.hamlets.entries()) {
      for (let i = 0; i < 2; i++) this.villagers.push({
        x: hamlet.x + (i ? 70 : -70), y: hamlet.y + 80 + i * 45,
        vx: 0, vy: 0, t: i * 2, dir: Math.PI / 2, steps: 0,
        c: cols[(index + i) % cols.length], look: `v${(index + i) % cols.length}`, hamletId: hamlet.id,
        line: i ? "Nossa trilha leva de volta aos caminhos da ilha." : "Há pessoas procurando ajuda pela ilha. Siga com cuidado.",
      });
    }
    // The four submitted pictures have only a front pose, so these visitors
    // stand in place. They are not ordinary armed villagers or free recruits.
    const visitors = [
      { home: null, figure: 0, name: "Bardo", look: "v2", line: "Eu anoto as histórias de quem encontra abrigo nesta ilha." },
      { home: this.hamlets[0], figure: 1, name: "Monge", look: "v0", line: "Descanse um pouco antes de pegar a trilha novamente." },
      { home: this.hamlets[1], figure: 2, name: "Viajante", look: "v4", line: "Vi sobreviventes precisando de ajuda nos caminhos da ilha." },
      { home: this.hamlets[2], figure: 3, name: "Estudiosa", look: "v1", line: "As ruínas guardam pistas sobre o que aconteceu por aqui." },
    ];
    for (const visitor of visitors) {
      if (visitor.figure && !visitor.home) continue;
      const home = visitor.home ?? VILLAGE;
      this.villagers.push({ x: home.x + (visitor.home ? 0 : -215), y: home.y + 45,
        vx: 0, vy: 0, t: 0, dir: Math.PI / 2, steps: 0, c: "#dfcf9c", look: visitor.look,
        line: visitor.line, figure: visitor.figure, displayName: visitor.name, ...(visitor.home ? { hamletId: visitor.home.id } : {}) });
    }
  }

  initRescues() {
    this.rescues = SPECIALIST_IDS.map((id) => {
      const def = SPECIALISTS[id];
      let chosen = { x: def.x, y: def.y };
      let found = false;
      // Deterministic dry, unobstructed standing point; no world-generation RNG
      // or resource indices are consumed or changed for old saves.
      for (let ring = 0; ring <= 20 && !found; ring++) {
        for (let dy = -ring; dy <= ring && !found; dy++) for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = def.x + dx * 24, y = def.y + dy * 24;
          if (this.tileAt(x, y) === T_WATER || this.referenceStructureAt(x, y) || this.blockedByWall(x, y)) continue;
          if (this.nearbyNodes(x, y).some((node) => node.hp > 0 && node.type !== "bush" && node.type !== "berry" && dist2(x, y, node.x, node.y) < 42 ** 2)) continue;
          if (id === "archer" && [-42, 42].some((dx) => this.tileAt(x + dx, y) === T_WATER || this.referenceStructureAt(x + dx, y) || this.nearbyNodes(x + dx, y).some((node) => node.hp > 0 && node.type !== "bush" && node.type !== "berry" && dist2(x + dx, y, node.x, node.y) < 36 ** 2))) continue;
          if (this.chests.some((ch) => dist2(x, y, ch.x, ch.y) < 70 ** 2)) continue;
          chosen = { x, y }; found = true; break;
        }
      }
      return { id, ...chosen, phase: this.specialists[id].rescued ? "safe" : "waiting", defenders: [] };
    });
  }

  updateRescues() {
    for (const rescue of this.rescues) {
      const progress = this.specialists[rescue.id];
      if (progress.hired || progress.rescued) continue;
      if (rescue.phase === "waiting" && !this.escort.active && dist2(this.px, this.py, rescue.x, rescue.y) < 300 ** 2) {
        const guards: Monster[] = [];
        const available = Math.max(0, this.monsterCap() - this.monsters.filter((m) => m.hp > 0 && !m.defeated).length);
        for (let i = 0; i < Math.min(2, available); i++) {
          const type: MonType = this.day >= 4 && i === 1 ? "crawler" : "imp";
          for (let attempt = 0; attempt < 16; attempt++) {
            const angle = Math.PI / 2 + i * Math.PI + attempt * 0.45;
            const radius = 120 + Math.floor(attempt / 6) * 35;
            const x = rescue.x + Math.cos(angle) * radius, y = rescue.y + Math.sin(angle) * radius;
            if (dist2(x, y, this.px, this.py) < 70 ** 2 || !this.monsterSpawnClear(x, y, type) || this.nearbyNodes(x, y).some((node) => node.hp > 0 && node.type !== "bush" && node.type !== "berry" && dist2(x, y, node.x, node.y) < 24 ** 2)) continue;
            this.spawnMonster(x, y, type); guards.push(this.monsters[this.monsters.length - 1]); break;
          }
        }
        if (guards.length) {
          rescue.defenders = guards; rescue.phase = "fighting";
          this.toast(`Socorro! Ajude ${SPECIALISTS[rescue.id].name}: derrote as criaturas próximas.`);
        }
      } else if (rescue.phase === "fighting") {
        const alive = rescue.defenders.filter((m) => m.hp > 0 && !m.defeated);
        if (!alive.length) {
          progress.rescued = true; rescue.phase = "safe";
          this.sfx.quest(); this.toast(`${SPECIALISTS[rescue.id].name}: obrigado! Aproxime-se e use Interagir para convidar.`);
          this.saveGame(); this.emitSnapshot();
        } else if (alive.some((m) => !this.monsters.includes(m))) {
          // If the player falls or leaves and the encounter despawns, retry it;
          // never grant a rescue merely because enemies were unloaded.
          this.monsters = this.monsters.filter((m) => !alive.includes(m));
          rescue.phase = "waiting"; rescue.defenders = [];
        }
      }
    }
  }

  buildMinimap() {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    if (!c) return;
    const cols = ["#2f6c9c", "#e3d191", "#6f9a44", "#2f5230", "#b99a67", "#8d8678", "#3b3744", "#a87a48", "#d4e4e3", "#67b1cd", "#a29c86", "#bdac87", "#565e57", "#6c604f", "#a6a250", "#9abf70"];
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
    if (this.wakeT > 0) { this.keys.clear(); e.preventDefault(); return; }
    if (this.activePanel === "reference") { this.keys.clear(); return; }
    if (k === "i") { this.openPanel("inventory"); e.preventDefault(); return; }
    if (k === "n") { this.openPanel("bestiary"); e.preventDefault(); return; }
    if (k === "p") { this.openPanel("people"); e.preventDefault(); return; }
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
  // The canvas, touch joystick and HUD are separate elements. Any pointer
  // gesture must unlock the effects context, not only clicks on the canvas.
  onAudioGesture = () => { this.sfx.ensure(); };

  bindInput() {
    window.addEventListener("pointerdown", this.onAudioGesture);
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
    if (this.state !== "playing" || this.wakeT > 0) return;
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

  setTouchMove(x: number, y: number) { this.touchMove.x = this.wakeT > 0 ? 0 : x; this.touchMove.y = this.wakeT > 0 ? 0 : y; }
  touchAction(a: "attack" | "roll" | "interact" | "eat") {
    this.sfx.ensure();
    if (this.state === "cutscene") { this.advanceDialogue(); return; }
    if (this.state !== "playing" || this.wakeT > 0) return;
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
    if (next.craftPix) { void loadCraftPix(); void loadReferenceArt(); }
    this.applyQuality();
    if (resized) this.resize();
    this.music?.setEnabled(next.music);
    this.music?.setVolume(next.musicVol);
    this.music?.setVoice(next.voice);
    this.sfx.vol = Math.max(0, Math.min(1, next.sfxVol)) * 0.5;
    if (!next.windSounds) this.sfx.setAmbient("wind", 0);
    if (!next.ambientSounds) {
      this.sfx.setAmbient("sea", 0); this.sfx.setAmbient("water", 0); this.sfx.setAmbient("fire", 0);
    }
    this.windCheckT = 0;
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
    if (p.buttons.some((button, i) => button.pressed && !this.lastPadButtons[i])) {
      this.sfx.ensure(); this.music?.resume();
    }
    if (this.wakeT > 0) { this.lastPadButtons = p.buttons.map((button) => button.pressed); return { mx: 0, my: 0 }; }
    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const mx = dead(p.axes[0] ?? 0), my = dead(p.axes[1] ?? 0);
    const btn = (i: number) => !!p.buttons[i]?.pressed;
    if (this.activePanel === "reference") {
      this.lastPadButtons = p.buttons.map((button) => button.pressed);
      return { mx: 0, my: 0 };
    }
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
  private rememberHeldPadButtons() {
    const pad = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads()?.[0] : null;
    if (pad) this.lastPadButtons = pad.buttons.map((button) => button.pressed);
  }
  openPanel(panel: Exclude<GamePanel, "none">) {
    if (this.state !== "playing") return;
    if (this.activePanel === "reference") this.rememberHeldPadButtons();
    this.mapOpen = false;
    this.activePanel = panel;
    this.keys.clear();
    this.softPause = this.opts.mode === "single";
    this.opts.onUi({ type: "panel", panel });
    this.sfx.ui();
  }
  openReferenceScene(scene: ReferenceScene) {
    if (!this.settings.craftPix || !hasReferenceScene(scene) || this.state !== "playing") return false;
    this.openPanel("reference");
    this.opts.onUi({ type: "reference", scene });
    return true;
  }
  closePanel() {
    if (this.activePanel === "reference") this.rememberHeldPadButtons();
    this.activePanel = "none"; this.keys.clear(); this.softPause = false; this.opts.onUi({ type: "panel", panel: "none" });
  }
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
    if (this.heldTool !== t) this.sfx.equip();
    this.heldTool = t;
    this.toast(t === "sword" && this.combatWeapon === "bow" ? "🏹 Arco na mão" : `${TOOL_ICON[t]} ${TOOL_LABEL[t]} na mão`);
  }
  setCombatWeapon(weapon: CombatWeapon) {
    if (weapon !== "sword" && weapon !== "bow") return;
    this.combatWeapon = weapon;
    this.heldTool = "sword";
    this.toast(weapon === "bow" ? "🏹 Arco equipado" : "⚔️ Espada equipada");
    this.sfx.equip();
    this.emitSnapshot();
    this.saveGame();
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
    // The intro uses screen-space particles; don't carry them into the world.
    this.particles.length = 0;
    this.cutParticleAcc = 0;
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
    this.swingBow = this.heldTool === "sword" && this.combatWeapon === "bow";
    this.attackCd = this.swingBow ? 0.68 : 0.38;
    this.attackT = 0.22;
    this.swingTool = this.heldTool;
    this.stamina = Math.max(0, this.stamina - 4);
    // The selected tool determines the swing sound, even when harvesting
    // temporarily shows the appropriate tool for the resource being gathered.
    this.sfx.swing(this.swingBow ? "bow" : this.heldTool);
    if (this.swingBow) {
      const dx = Math.cos(this.pdir), dy = Math.sin(this.pdir);
      this.projectiles.push({ kind: "player", x: this.px + dx * 24, y: this.py + dy * 24, vx: dx * 520, vy: dy * 520, t: 0.9, dmg: 7 + this.tools.sword * 4 });
      return;
    }
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
      if (n.hp <= 0 && !(n.stumpHp && n.stumpHp > 0)) continue;
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
    if (n.hp <= 0) {
      if ((n.type !== "tree" && n.type !== "pine") || !n.stumpHp || n.stumpHp <= 0) return;
      n.stumpHp = Math.max(0, n.stumpHp - (5 + this.tools.axe * 4));
      this.spawnParticles(n.x, n.y - 5, "#8a5a2b", 6, 100); this.sfx.chop();
      if (n.stumpHp === 0) {
        for (let i = 0; i < 3; i++) {
          const angle = i * Math.PI * 2 / 3;
          this.drops.push({ res: "wood", x: n.x, y: n.y, vx: Math.cos(angle) * 55, vy: Math.sin(angle) * 55 - 35, n: 1, t: 0 });
        }
        this.floaters.push({ x: n.x, y: n.y - 18, t: 0, text: "+3 madeira", c: "#ffe3a1" });
      }
      return;
    }
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
    this.shakingNodes.add(n);
    const colors: Record<NodeType, string> = {
      tree: "#8a5a2b", pine: "#6b4a22", rock: "#9a9a9a", ore: "#c9a26a", crystal: "#7de0e8", bush: "#71b840", berry: "#d04560",
    };
    this.spawnParticles(n.x, n.y - 10, colors[n.type], 8, 150);
    this.shake = Math.min(6, this.shake + 2.5);
    if (n.type === "bush" || n.type === "berry") this.sfx.foliage();
    else if (tool === "axe") this.sfx.chop();
    else this.sfx.mine(n.type === "ore" ? "ore" : n.type === "crystal" ? "crystal" : "rock");

    if (n.hp <= 0) {
      n.hp = 0;
      n.stumpHp = n.type === "tree" || n.type === "pine" ? 12 : 0;
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
    if (this.settings.creatureSounds) this.sfx.monsterDeath(m.type, 1 - Math.sqrt(dist2(m.x, m.y, this.px, this.py)) / 600, (m.x - this.px) / 480);
    else this.sfx.hit();
    // loot
    const r = Math.random();
    if (r < 0.35) this.drops.push({ res: "fiber", x: m.x, y: m.y, vx: 0, vy: -60, n: 1, t: 0 });
    else if (r < 0.5) this.drops.push({ res: "food", x: m.x, y: m.y, vx: 20, vy: -60, n: 1, t: 0 });
    else if (r < 0.58 && m.type !== "crawler") this.drops.push({ res: "iron", x: m.x, y: m.y, vx: -20, vy: -60, n: 1, t: 0 });
    if (m.rare) this.drops.push({ res: "crystal", x: m.x, y: m.y, vx: 20, vy: -80, n: 2, t: 0 });
    this.checkQuests();
  }

  tryRoll() {
    if (this.rollCd > 0 || this.stamina < 15) return;
    this.rollT = 0.26; this.rollCd = 0.85; this.invulnT = 0.32;
    // A jump is vertical, even if the player had momentum beforehand.
    this.pvx = 0; this.pvy = 0;
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
    for (const rescue of this.rescues) {
      if (this.specialists[rescue.id].hired || dist2(rescue.x, rescue.y, this.px, this.py) >= 80 ** 2) continue;
      if (rescue.phase === "fighting") this.toast("Derrote as criaturas que cercam o grupo primeiro.");
      else if (this.specialists[rescue.id].rescued) this.hireSpecialist(rescue.id);
      else this.toast("Volte depois de acompanhar Rian até a base.");
      return;
    }
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
    if (this.settings.craftPix) for (const prop of this.worldProps) {
      if (!prop.sprite.startsWith("reference_") || dist2(prop.x, prop.y, this.px, this.py) >= 86 * 86) continue;
      const scene = prop.sprite.slice("reference_".length) as ReferenceScene;
      if (hasReferenceObject(scene) && this.openReferenceScene(scene)) return;
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
        this.toast(v.displayName ? `${v.displayName}: ${v.line}` : `🧑‍🌾 ${v.line}`);
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
  territoryRadius() { return this.fenceSpec(this.territoryLevel).radius; }
  fenceSpec(ring = this.fenceRing) {
    const index = clamp(Math.floor(ring), 1, TERRITORIES.length) - 1;
    return index === 0 && this.legacyTerritory ? LEGACY_FIRST_TERRITORY : TERRITORIES[index];
  }
  territoryUpgrade() {
    const next = TERRITORIES[this.territoryLevel];
    if (!next) return { nextRadius: null, cost: {} as Partial<Record<ResKey, number>>, reason: "Espaço máximo alcançado", affordable: false };
    const multiplier = this.diff.resMult * (this.allies.some((a) => a.id === "tito") ? 0.8 : 1);
    const cost: Partial<Record<ResKey, number>> = {};
    const raw: Partial<Record<ResKey, number>> = next.cost;
    for (const key of Object.keys(raw) as ResKey[]) cost[key] = Math.ceil((raw[key] ?? 0) * multiplier);
    let reason = "";
    if (this.baseLevel() < next.level) reason = `Requer reino nível ${next.level}`;
    else if (next.requires && !this.structures.some((s) => s.type === next.requires)) reason = `Construa ${STRUCT_DEF[next.requires].name} primeiro`;
    else if (dist2(this.px, this.py, BASE.x, BASE.y) > this.territoryRadius() ** 2) reason = "Volte à base para ampliar o terreno";
    return { nextRadius: next.radius, cost, reason, affordable: this.canAfford(cost) };
  }
  upgradeTerritory(): boolean {
    if (this.state !== "playing") return false;
    const next = this.territoryUpgrade();
    if (next.reason || !next.affordable) { this.toast(next.reason || "Recursos insuficientes!"); return false; }
    this.payCost(next.cost);
    this.territoryLevel++;
    this.fenceRing = this.territoryLevel;
    this.fenceSlot = 0;
    this.sfx.build();
    this.toast(`Território ampliado! O perímetro ${this.territoryLevel} já pode receber muralhas.`);
    this.emitSnapshot(); this.saveGame();
    return true;
  }
  setFenceRing(ring: number) {
    if (!Number.isInteger(ring) || ring < 1 || ring > this.territoryLevel) return;
    this.fenceRing = ring; this.fenceSlot = 0; this.mouseValid = false;
    if (this.placing === "wall" || this.placing === "gate") this.updatePlacement();
    this.sfx.ui(); this.emitSnapshot(); this.saveGame();
  }
  setFenceStyle(style: FenceStyle) {
    const def = FENCE_DEF[style];
    if (this.baseLevel() < def.lockLevel) { this.toast(`Requer reino nível ${def.lockLevel}.`); return; }
    this.fenceStyle = style;
    if (this.placing === "wall" || this.placing === "gate") this.updatePlacement();
    this.sfx.ui(); this.emitSnapshot();
  }
  defenseTierReason(tier: DefenseTier): string {
    const def = DEFENSE_TIERS[tier - 1];
    if (this.baseLevel() < def.realm) return `Requer reino nível ${def.realm}`;
    if (def.forge && !this.structures.some((s) => s.type === "forge")) return "Requer Forja";
    return "";
  }
  setDefenseTier(tier: DefenseTier) {
    if (defenseTier(tier) !== tier) return;
    const reason = this.defenseTierReason(tier);
    if (reason) { this.toast(reason); return; }
    this.defenseTier = tier;
    this.sfx.ui(); this.emitSnapshot(); this.saveGame();
  }
  /** If isolated sockets remain, allow a single wall rather than leaving an
   * unclosable hole after the ring's one gate was already built. */
  wallPurchaseSize(): 1 | 2 {
    const references = this.settings.craftPix ? ["camp", ...HOUSE_ART, "market", "chapel", "forge", "castle_tower"].map((name) => hasReferenceObject(name as ReferenceObject) ? "1" : "0").join("") : "off";
    const cached = this.fenceSpaceCache;
    if (cached && cached.ring === this.fenceRing && cached.structures === this.structures && cached.length === this.structures.length && cached.references === references) return cached.pieces;
    const { slots } = this.fenceSpec();
    const free = Array.from({ length: slots }, (_, i) => { const p = this.fencePosition(i); return !this.placeCheck("wall", p.x, p.y); });
    const pair = free.some((available, i) => available && free[(i + 1) % slots]);
    const radius = this.fenceSpec().fenceRadius;
    const hasGate = this.structures.some((s) => s.type === "gate" && Math.abs(Math.hypot(s.x - BASE.x, s.y - BASE.y) - radius) < 12);
    const reserveGate = !pair && free.some(Boolean) && !hasGate;
    const pieces: 1 | 2 = !pair && free.some(Boolean) && hasGate ? 1 : 2;
    this.fenceSpaceCache = { ring: this.fenceRing, structures: this.structures, length: this.structures.length, references, pieces, reserveGate };
    return pieces;
  }
  fenceStyleCost(style = this.fenceStyle): Partial<Record<ResKey, number>> {
    const def = FENCE_DEF[style];
    const m = this.diff.resMult * (this.allies.some((a) => a.id === "tito") ? 0.8 : 1);
    const radius = this.fenceSpec().fenceRadius;
    const built = this.structures.filter((s) => s.type === "wall" && Math.abs(Math.hypot(s.x - BASE.x, s.y - BASE.y) - radius) < 12).length;
    // Keep the original early-game pricing; larger rings grow more gently so
    // building a kingdom remains feasible rather than multiplying forever.
    const grown = this.fenceRing === 1 ? 1 + Math.floor(built / 2) * 0.18 : Math.min(3, 1 + Math.floor(built / 2) * 0.08);
    const out: Partial<Record<ResKey, number>> = {};
    for (const k of Object.keys(def.cost) as ResKey[]) out[k] = Math.ceil((def.cost[k] ?? 0) * m * grown * this.wallPurchaseSize());
    return out;
  }
  costFor(type: StructType): Partial<Record<ResKey, number>> {
    if (type === "wall") return this.fenceStyleCost();
    const selected = DEFENSE_TIERS[this.defenseTier - 1];
    const base = type === "spike_trap" ? selected.trapCost : type === "barricade" ? selected.barricadeCost : STRUCT_DEF[type].cost;
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
  structMaxHp(type: StructType, style: FenceStyle = this.fenceStyle, tier: DefenseTier = this.defenseTier) {
    const defense = DEFENSE_TIERS[defenseTier(tier) - 1];
    const base: Record<StructType, number> = {
      campfire: 180, wall: FENCE_DEF[style].hp, gate: Math.round(FENCE_DEF[style].hp * 1.35),
      spike_trap: defense.trapHp, barricade: defense.barricadeHp,
      training: 220, workbench: 200, house: 380, farm: 200, sawmill: 230, quarry: 260, forge: 300, tower: 320, raft: 400,
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
      if (i >= 0) { this.structures.splice(i, 1); this.fenceSpaceCache = null; }
      const label = s.type === "gate" ? "🚪 O PORTÃO CAIU! Eles estão entrando!" : s.type === "barricade" ? "🛡️ Uma barricada foi quebrada!" : "🧱 Sua cerca foi quebrada!";
      this.toast(label);
      this.spawnParticles(s.x, s.y, "#c9a26a", 22, 240);
      this.shake = Math.min(14, this.shake + 7);
      this.sfx.structureBreak();
    }
  }
  underAttackNow(): boolean {
    for (const m of this.monsters) {
      if (m.siege && dist2(m.x, m.y, BASE.x, BASE.y) < (this.territoryRadius() + 350) ** 2) return true;
      if (dist2(m.x, m.y, this.px, this.py) < 260 * 260) return true;
    }
    return false;
  }
  structLock(type: StructType): string {
    const def = STRUCT_DEF[type];
    if (type === "spike_trap" || type === "barricade") {
      const reason = this.defenseTierReason(this.defenseTier);
      if (reason) return reason;
    }
    if (type === "wall") {
      this.wallPurchaseSize();
      if (this.fenceSpaceCache?.reserveGate) return "Coloque o portão antes de fechar as lacunas";
    }
    if (def.lvl >= 2 && type !== "workbench" && !this.structures.some((s) => s.type === "workbench"))
      return "Requer Bancada";
    if (type === "workbench" && !this.questDone[0]) return "Complete a missão Primeiros Passos";
    if (type === "raft") {
      if (!this.structures.some((s) => s.type === "forge")) return "Requer Forja";
      if (this.baseLevel() < 10) return "Requer base nível 10";
    }
    if (type === "training" && this.structures.some((s) => s.type === "training")) return "Já existe uma arena de treino";
    if (type === "house" && this.structures.filter((s) => s.type === "house").length >= 5 * this.territoryLevel) return `Máximo de ${5 * this.territoryLevel} casas neste território`;
    return "";
  }

  /** Perimeter sockets have a consistent spacing for every territory size. */
  fencePosition(index: number, ring = this.fenceRing) {
    const { slots, fenceRadius } = this.fenceSpec(ring);
    const slot = ((index % slots) + slots) % slots;
    const a = (slot / slots) * Math.PI * 2;
    return { x: BASE.x + Math.cos(a) * fenceRadius, y: BASE.y + Math.sin(a) * fenceRadius };
  }
  fencePositions(type: StructType, slot = this.fenceSlot) {
    return type === "wall" && this.wallPurchaseSize() === 2 ? [this.fencePosition(slot), this.fencePosition(slot + 1)] : [this.fencePosition(slot)];
  }
  rotateStructure(direction = 1) {
    if (!this.placing) return;
    if (this.placing === "wall" || this.placing === "gate") { this.rotateFence(direction); return; }
    // These ground/single-sprite defenses have a circular footprint; rotating
    // their upright reference would make the barricade lie on the ground.
    if (this.placing === "spike_trap" || this.placing === "barricade" || this.placing === "training") return;
    this.placeRotation = Math.abs(this.placeRotation % Math.PI) > 0.1 ? 0 : Math.PI / 2;
    this.updatePlacement(); this.sfx.ui(); this.emitSnapshot();
  }
  rotateFence(direction: number) {
    if (this.placing !== "wall" && this.placing !== "gate") return;
    this.mouseValid = false;
    const sign = direction < 0 ? -1 : 1, { slots } = this.fenceSpec();
    let slot = ((this.fenceSlot + direction) % slots + slots) % slots;
    // Skip occupied sockets automatically, including both halves of a pair.
    let found = false;
    for (let tries = 0; tries < slots; tries++) {
      if (this.fencePositions(this.placing, slot).every((p) => !this.placeCheck(this.placing!, p.x, p.y))) { found = true; break; }
      slot = (slot + sign + slots) % slots;
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
      const a = Math.atan2(this.py - BASE.y, this.px - BASE.x), { slots } = this.fenceSpec();
      this.fenceSlot = ((Math.round(a * slots / (2 * Math.PI)) % slots) + slots) % slots;
      this.mouseValid = false;
      for (let tries = 0; tries < slots; tries++) {
        if (this.fencePositions(type).every((p) => !this.placeCheck(type, p.x, p.y))) break;
        this.fenceSlot = (this.fenceSlot + 1) % slots;
      }
    }
    this.softPause = false;
    this.mapOpen = false;
    this.activePanel = "none";
    this.opts.onUi({ type: "panel", panel: "none" });
    this.updatePlacement();
    this.toast(type === "wall" || type === "gate"
      ? `Arraste o mouse ou use Q/E, ←/→, LB/RB para girar. ${type === "wall" && this.wallPurchaseSize() === 1 ? "Um trecho para fechar a lacuna." : "Confirme para colocar."}`
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
        const a = Math.atan2(this.mouseY + this.camY - BASE.y, this.mouseX + this.camX - BASE.x), { slots } = this.fenceSpec();
        this.fenceSlot = ((Math.round(a * slots / (2 * Math.PI)) % slots) + slots) % slots;
      }
      const positions = this.fencePositions(type);
      this.placeX = positions[0].x; this.placeY = positions[0].y;
      this.placeReason = positions.map((p) => this.placeCheck(type, p.x, p.y)).find(Boolean) ?? "";
      if (type === "wall" && this.fenceSpaceCache?.reserveGate) this.placeReason = "Coloque o portão antes de fechar as lacunas";
      if (dist2(this.px, this.py, BASE.x, BASE.y) > (this.territoryRadius() + 240) ** 2) this.placeReason = "Aproxime-se da base para construir a cerca";
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
  /** The starting chest is a real, solid object even after it is emptied and
   * when optional reference art is unavailable. Its front stays reachable. */
  baseChestContains(x: number, y: number): boolean {
    const chest = this.chests.find((entry) => entry.label === "Kit do Rian");
    return !!chest && Math.abs(x - chest.x) < 34 && y > chest.y - 42 && y < chest.y + 9;
  }

  /** Ground footprints remain solid even when the optional house art is off;
   * optional chapel/market/camp footprints exist only while their art is loaded. */
  referenceStructureAt(x: number, y: number): boolean {
    const houseSolid = (house: VillageHouse) => {
      // Reject distant points before asking which optional atlas is loaded.
      if (Math.abs(x - house.x) >= 100 * house.scale || y >= house.y + 8 || y <= house.y - 250 * house.scale / 1.35) return false;
      const art = this.settings.craftPix ? houseArt(house.index) : null;
      const depth = (art === "house" ? 250 : 190) * house.scale / 1.35;
      return y > house.y - depth;
    };
    if (this.villageHouses.some(houseSolid)) return true;
    for (const hamlet of this.hamlets) if (hamlet.houses.some(houseSolid)) return true;
    if (!this.settings.craftPix) return false;
    if (this.villageBuildings.some((b) => Math.abs(x - b.x) < b.halfWidth && y > b.y - b.depth && y < b.y + 8 && hasReferenceObject(b.name))) return true;
    const camp = this.legacyTerritory ? CAMP_LEGACY : CAMP_COMPACT;
    return Math.abs(x - camp.x) < 78 && y > camp.y - 155 && y < camp.y + 8 && hasReferenceObject("camp");
  }

  placedStructureContains(s: Structure, x: number, y: number, radius = 24): boolean {
    const reference = s.type === "tower" ? "castle_tower" : s.type === "house" ? placedHouseArt(s.x, s.y) : s.type === "forge" ? "forge" : null;
    const craftTower = s.type === "tower" && this.settings.craftPix && hasCraftTower();
    if ((reference && this.settings.craftPix && hasReferenceObject(reference)) || craftTower) {
      const dx = x - s.x, dy = y - (s.y + 6), cos = Math.cos(s.rotation), sin = Math.sin(s.rotation);
      const along = dx * cos + dy * sin, depth = -dx * sin + dy * cos;
      const halfWidth = s.type === "house" ? 108 : reference === "forge" ? 88 : 48;
      const height = s.type === "house" ? reference === "house" ? 210 : 160 : reference === "forge" ? 125 : craftTower && !hasReferenceObject("castle_tower") ? 190 : 150;
      return Math.abs(along) < halfWidth && depth > -height && depth < 8;
    }
    return dist2(s.x, s.y, x, y) < radius * radius;
  }

  placeCheck(type: StructType, x: number, y: number): string {
    const t = this.tileAt(x, y);
    if (type === "raft") {
      if (t !== T_SAND && t !== T_WATER) return "A balsa vai na areia da praia";
    } else {
      if (t === T_WATER && !((type === "wall" || type === "gate") && this.fenceRing > 1)) return "Não dá para construir na água";
      const inBase = dist2(x, y, BASE.x, BASE.y) < this.territoryRadius() ** 2;
      if (type !== "campfire" && type !== "wall" && type !== "gate" && !inBase) return "Construa dentro da clareira";
    }
    if (type === "training") {
      // A real footprint, not a decorative sprite overlapping buildings,
      // water or the first fence. Sample its whole playable ground.
      for (let dx = -100; dx <= 100; dx += 25) for (let dy = -80; dy <= 80; dy += 20) {
        const px = x + dx, py = y + dy;
        if (dist2(px, py, BASE.x, BASE.y) > this.fenceSpec(this.territoryLevel).fenceRadius ** 2) return "Deixe a arena dentro do perímetro";
        if (this.tileAt(px, py) === T_WATER || this.referenceStructureAt(px, py) || this.baseChestContains(px, py)) return "Há água ou uma construção na área da arena";
        if (this.structures.some((st) => this.placedStructureContains(st, px, py))) return "A área da arena está ocupada";
      }
      if (this.structures.some((s) => Math.abs(s.x - x) < 125 && Math.abs(s.y - y) < 105)) return "A área da arena está ocupada";
      if (this.nearbyNodes(x, y).some((node) => node.hp > 0 && node.type !== "bush" && node.type !== "berry" && Math.abs(node.x - x) < 110 && Math.abs(node.y - y) < 90)) return "Remova árvores e rochas da área da arena";
    }
    for (const s of this.structures) {
      if (s.type === "training" && Math.abs(s.x - x) < 110 && Math.abs(s.y - y) < 90) return "Este espaço pertence à arena";
      const minD = (s.type === "wall" || s.type === "gate") && (type === "wall" || type === "gate") ? 27 : 44;
      if (dist2(s.x, s.y, x, y) < minD * minD || this.placedStructureContains(s, x, y)) return "Este espaço da cerca está ocupado";
    }
    if (this.referenceStructureAt(x, y) || this.baseChestContains(x, y)) return "Há uma construção nesse lugar";
    // The ring is intentionally cleared while placing: trees no longer block
    // wall slots. They are harvested only in the footprint after purchase.
    if (type !== "wall" && type !== "gate") {
      for (const n of this.nearbyNodes(x, y)) {
        if (n.hp > 0 && n.type !== "bush" && n.type !== "berry" && dist2(n.x, n.y, x, y) < 26 * 26) return "Há uma árvore/rocha no lugar";
      }
    }
    if (dist2(x, y, this.px, this.py) < 18 * 18 && type !== "campfire" && type !== "wall" && type !== "gate") return "Você está no caminho";
    if (type === "barricade" && this.monsters.some((m) => m.hp > 0 && dist2(x, y, m.x, m.y) < (m.r + 25) ** 2)) return "Uma criatura está no caminho";
    if (type === "gate" && this.structures.some((s) => s.type === "gate" && Math.abs(Math.hypot(s.x - BASE.x, s.y - BASE.y) - this.fenceSpec().fenceRadius) < 12)) return "Já existe um portão neste perímetro";
    return "";
  }
  /** Expanded perimeter segments can lay a small foundation over a river.
   * Reapply it from saved structures when loading the same generated world. */
  layFenceFoundations(positions: { x: number; y: number; type?: StructType }[]) {
    let changed = false;
    const foundation = (wx: number, wy: number) => {
      const x = Math.floor(wx / TILE), y = Math.floor(wy / TILE);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return T_GRASS;
      const index = y * W + x, tile = this.tiles[index];
      if (tile === T_WATER) { this.tiles[index] = T_BRIDGE; changed = true; }
      return tile;
    };
    for (const p of positions) {
      const original = foundation(p.x, p.y);
      if (p.type !== "gate" || (original !== T_WATER && original !== T_BRIDGE)) continue;
      // A gate on a river also needs a short crossing on both sides; otherwise
      // its dry socket could still be surrounded by impassable water.
      const angle = Math.atan2(p.y - BASE.y, p.x - BASE.x);
      for (const sign of [-1, 1]) for (let i = 1; i <= 12; i++) {
        const tile = foundation(p.x + Math.cos(angle) * sign * i * TILE / 2, p.y + Math.sin(angle) * sign * i * TILE / 2);
        if (tile !== T_WATER && tile !== T_BRIDGE && i >= 2) break;
      }
    }
    if (changed) { this.terrain?.invalidateAll(); this.buildMinimap(); }
  }
  confirmPlace(): boolean {
    const type = this.placing;
    if (!type) return false;
    const lock = this.structLock(type);
    if (lock) { this.toast("🔒 " + lock); return false; }
    this.updatePlacement();
    if (this.placeReason) { this.toast("⛔ " + this.placeReason); this.sfx.ui(); return false; }
    const cost = this.costFor(type);
    if (!this.canAfford(cost)) { this.toast("Recursos insuficientes!"); this.placing = null; this.emitSnapshot(); return false; }
    const positions = type === "wall" || type === "gate" ? this.fencePositions(type) : [{ x: this.placeX, y: this.placeY }];
    // Charge only after every piece in the chosen purchase fits.
    if (positions.some((p) => this.placeCheck(type, p.x, p.y))) return false;
    if ((type === "wall" || type === "gate") && this.fenceRing > 1) this.layFenceFoundations(positions.map((p) => ({ ...p, type })));
    this.payCost(cost);
    const mhp = this.structMaxHp(type);
    for (const p of positions) {
      const ring = type === "wall" || type === "gate";
      const rotation = ring ? Math.atan2(p.y - BASE.y, p.x - BASE.x) + Math.PI / 2 : this.placeRotation;
      this.structures.push({ type, x: p.x, y: p.y, prodT: 0, hp: mhp, maxHp: mhp, open: false, rotation, fenceStyle: this.fenceStyle,
        ...(type === "spike_trap" || type === "barricade" ? { tier: this.defenseTier } : {}) });
      for (const n of this.nearbyNodes(p.x, p.y)) {
        const underArena = type === "training" && Math.abs(n.x - p.x) < 110 && Math.abs(n.y - p.y) < 90;
        const tree = n.type === "tree" || n.type === "pine";
        const radius = ring && tree ? 60 : 24;
        if ((n.hp > 0 || (tree && (n.stumpHp ?? 0) > 0)) && (underArena || dist2(n.x, n.y, p.x, p.y) < radius * radius)) {
          n.hp = 0; n.stumpHp = 0; n.respawn = 200; this.depletedNodes.add(n);
        }
      }
      this.spawnParticles(p.x, p.y, "#ffd27d", 9, 160);
    }
    this.fenceSpaceCache = null;
    this.questP[2] = Math.min(QUESTS[2].target, this.questP[2] + 1);
    this.questP[5] = Math.min(QUESTS[5].target, this.baseLevel());
    if (type === "house") this.maxHp += 12;
    this.addScore(type === "wall" ? 220 : 150);
    this.shake = Math.min(8, this.shake + 4);
    this.sfx.build();
    const total = this.structures.length;
    if ((type === "campfire" || type === "wall" || type === "gate") && total <= 5 && !this.survivedNight && this.buildPatrolDay !== this.day) {
      // One small early patrol, not a new full wave after every fence piece.
      this.buildPatrolDay = this.day;
      this.spawnWave(this.day <= 2 ? 2 : 3);
      this.toast("👁️ Eles sentiram sua presença... uma pequena patrulha se aproxima!");
      this.sfx.night();
    } else {
      this.toast(type === "wall" ? positions.length === 1 ? "🧱 Trecho avulso colocado!" : "🧱 Dois trechos conectados! Gire para continuar o círculo." : `${STRUCT_DEF[type].icon} ${STRUCT_DEF[type].name} construída!`);
    }
    this.checkQuests();
    if (type === "wall" && this.canAfford(this.costFor("wall"))) {
      this.mouseValid = false;
      this.rotateFence(positions.length);
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

  /* ---------------- rescued specialists ---------------- */
  specialistLevel(person: SpecialistProgress): number {
    const trained = person.training >= 120 ? 3 : person.training >= 45 ? 2 : 1;
    return Math.min(person.weaponLevel, trained);
  }
  specialistUpgradeCost(person: SpecialistProgress): Partial<Record<ResKey, number>> {
    const m = this.diff.resMult;
    return person.weaponLevel === 1
      ? { wood: Math.ceil(16 * m), iron: Math.ceil(8 * m) }
      : { wood: Math.ceil(24 * m), iron: Math.ceil(16 * m), crystal: Math.ceil(4 * m) };
  }
  specialistUpgradeReason(person: SpecialistProgress): string {
    if (!person.hired) return "Resgate e convide primeiro";
    if (person.id === "miner") return "Trabalha com a picareta da pedreira";
    if (person.weaponLevel >= 3) return "Equipamento no nível máximo";
    if (!this.structures.some((s) => s.type === "forge")) return "Construa uma forja";
    if (person.training < (person.weaponLevel === 1 ? 45 : 120)) return "Treine durante o dia na base";
    return "";
  }
  specialistViews(): SpecialistView[] {
    return SPECIALIST_IDS.map((id) => {
      const person = this.specialists[id], def = SPECIALISTS[id];
      const cost = this.specialistUpgradeCost(person), reason = this.specialistUpgradeReason(person);
      return { id, name: def.name, role: def.role, hint: def.hint, rescued: person.rescued, hired: person.hired,
        duty: person.duty, level: id === "miner" ? 1 : this.specialistLevel(person), weaponLevel: person.weaponLevel,
        training: Math.floor(person.training), trainingTarget: person.weaponLevel >= 3 ? 120 : person.weaponLevel === 1 ? 45 : 120,
        upgradeCost: cost, upgradeReason: reason, affordable: this.canAfford(cost) };
    });
  }
  hireSpecialist(id: SpecialistId): boolean {
    const person = this.specialists[id];
    if (!person || !person.rescued || person.hired) return false;
    if (id !== "miner" && SPECIALIST_IDS.filter((key) => key !== "miner" && this.specialists[key].hired).length >= 3) {
      this.toast("A equipe de defesa já está completa."); return false;
    }
    person.hired = true;
    const def = SPECIALISTS[id];
    if (!this.allies.some((ally) => ally.id === id)) this.allies.push({ id, name: def.name, color: def.color, x: this.px - 30, y: this.py + 32, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
    this.sfx.quest(); this.toast(`${def.name} entrou para a equipe no nível 1. Abra Pessoas para definir a tarefa.`);
    this.saveGame(); this.emitSnapshot(); return true;
  }
  setRianDuty(duty: RianDuty): boolean {
    if (this.escort.active || (duty !== "stay" && duty !== "follow")) return false;
    this.rianDuty = duty;
    this.toast(duty === "follow" ? "Rian vai acompanhar você." : "Rian ficará defendendo a base.", "rian");
    this.saveGame(); this.emitSnapshot(); return true;
  }
  setSpecialistDuty(id: SpecialistId, duty: SpecialistDuty): boolean {
    const person = this.specialists[id];
    const allowed: SpecialistDuty[] = id === "miner" ? ["mine", "rest"] : ["follow", "defend", "train"];
    if (!person?.hired || !allowed.includes(duty)) return false;
    person.duty = duty; this.saveGame(); this.emitSnapshot(); return true;
  }
  upgradeSpecialist(id: SpecialistId): boolean {
    const person = this.specialists[id];
    if (!person) return false;
    const reason = this.specialistUpgradeReason(person);
    if (reason) { this.toast(reason); return false; }
    const cost = this.specialistUpgradeCost(person);
    if (!this.canAfford(cost)) { this.toast("Recursos insuficientes para o equipamento."); return false; }
    this.payCost(cost); person.weaponLevel++;
    this.sfx.build(); this.toast(`${SPECIALISTS[id].name}: equipamento forjado, nível ${person.weaponLevel}!`);
    this.saveGame(); this.emitSnapshot(); return true;
  }
  trainingStation(arena: Structure, id: SpecialistId) {
    const offset = id === "archer" ? -60 : id === "mage" ? 0 : 60;
    return { x: arena.x + offset, y: arena.y + 42 };
  }
  updateSpecialists(dt: number) {
    if (this.isNight()) return;
    for (const id of SPECIALIST_IDS) {
      const person = this.specialists[id], ally = this.allies.find((a) => a.id === id);
      if (!person.hired || !ally || ally.downT > 0) continue;
      const arena = this.structures.find((s) => s.type === "training");
      const trainingSite = arena ?? BASE;
      if (id !== "miner" && person.duty === "train" && dist2(ally.x, ally.y, trainingSite.x, trainingSite.y) < (arena ? 125 : 180) ** 2 &&
          !this.monsters.some((m) => m.hp > 0 && dist2(m.x, m.y, trainingSite.x, trainingSite.y) < 240 ** 2)) {
        const before = person.training; person.training = Math.min(120, person.training + dt);
        if ((before < 45 && person.training >= 45) || (before < 120 && person.training >= 120)) {
          this.toast(`${SPECIALISTS[id].name} terminou o treino. Forje o próximo equipamento na aba Pessoas.`);
          this.saveGame(); this.emitSnapshot();
        }
      }
      if (id === "miner" && person.duty === "mine") {
        const quarry = this.structures.find((s) => s.type === "quarry");
        if (!quarry || dist2(ally.x, ally.y, quarry.x, quarry.y) >= 120 ** 2 ||
            this.monsters.some((m) => m.hp > 0 && dist2(m.x, m.y, quarry.x, quarry.y) < 200 ** 2)) continue;
        person.workTime += dt;
        if (person.workTime >= 45) {
          person.workTime %= 45; this.inv.iron += 2;
          this.questP[3] = Math.min(QUESTS[3].target, this.questP[3] + 2);
          if (this.crystalDiscovered) this.inv.crystal++;
          this.toast(this.crystalDiscovered ? "Minerador: +2 ferro e +1 cristal." : "Minerador: +2 ferro. Encontre cristal para ampliar a mineração.");
          this.emitSnapshot();
        }
      }
    }
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
        if (i === 1) {
          this.allies.push({ id: "maya", name: "Maya", color: "#5ad0c9", x: this.px + 30, y: this.py + 30, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
        }
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
    const kA = touch ? "Atacar" : pad ? "A" : "J";
    const kE = touch ? "Usar" : pad ? "X" : "E";
    const kB = touch ? "Construir" : pad ? "Y" : "B";
    const kMove = touch ? "Joystick" : pad ? "Analógico" : "WASD";
    const kPick = touch ? "Arma até a picareta" : pad ? "LB/RB até a picareta" : "2";
    const steps: TutorialView[] = [
      { id: "t1", title: "1 · Corte sua primeira árvore", text: `Ande com ${kMove}, encare a árvore e ataque com ${kA} (machado). Cada golpe derruba madeira 🪵.`, keys: [kMove, kA], step: 1, total: 6 },
      { id: "t2", title: "2 · Junte 12 madeira e 8 pedra", text: `Quebre rochas com a picareta (${kPick}) e use ${kA}. Colete também fibra nas moitas.`, keys: [kPick, kA], step: 2, total: 6 },
      { id: "t3", title: "3 · Erga a fogueira", text: `Abra ${kB}, escolha Fogueira e coloque na clareira. Aproxime-se e use ${kE} para salvar.`, keys: [kB, kE], step: 3, total: 6 },
      { id: "t4", title: "4 · Cerque a base (2 pares)", text: `Compre duas cercas duplas: cada compra coloca 2 peças no círculo. ${touch || pad ? "Gire pelas setas na tela." : "Gire com Q/E ou as setas na tela."}`, keys: [kB], step: 4, total: 6 },
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
      const nodeHp: [number, number, number][] = [], nodeStumps: [number, number][] = [];
      this.nodes.forEach((n, i) => {
        if (n.hp < n.maxHp || n.respawn > 0) nodeHp.push([i, Math.max(0, Math.round(n.hp)), Math.round(n.respawn)]);
        if (n.hp <= 0 && (n.type === "tree" || n.type === "pine")) nodeStumps.push([i, Math.max(0, Math.round(n.stumpHp ?? 0))]);
      });
      const data: SaveData = {
        v: 2, seed: this.opts.seed,
        px: this.px, py: this.py, hp: this.hp, maxHp: this.maxHp,
        inv: { ...this.inv }, tools: { ...this.tools },
        time: this.time, day: this.day, score: this.score, kills: this.kills, deaths: this.deaths,
        structures: this.structures.map((s) => ({ type: s.type, x: s.x, y: s.y, hp: s.hp, open: s.open, rotation: s.rotation, fenceStyle: s.fenceStyle, tier: s.tier })),
        questP: [...this.questP], questDone: [...this.questDone],
        allies: this.allies.map((a) => a.id), visited: [...this.visited],
        nodeHp, nodeStumps,
        chests: this.chests.map((c) => c.opened),
        escortDone: !this.escort.active,
        escortIndex: this.escort.i, rianDuty: this.rianDuty,
        discoveredSites: [...this.discoveredSites], claimedSites: [...this.claimedSites],
        seenCreatures: [...this.seenCreatures], creatureKills: { ...this.creatureKills }, equipment: { ...this.equipment },
        fenceStyle: this.fenceStyle, defenseTier: this.defenseTier, combatWeapon: this.combatWeapon,
        territoryLevel: this.territoryLevel, territoryLayout: this.legacyTerritory ? "legacy" : "compact", fenceRing: this.fenceRing, buildPatrolDay: this.buildPatrolDay,
        pendingRespawn: this.pendingRespawn, deathReport: this.deathReport,
        specialists: this.specialists, crystalDiscovered: this.crystalDiscovered,
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
        this.nodeBuckets.clear(); this.depletedNodes.clear(); this.shakingNodes.clear();
        this.genWorld(d.seed);
        this.animals = []; this.spawnAnimals(90);
        this.placeChests();
      }
      this.px = d.px; this.py = d.py; this.hp = d.hp; this.maxHp = d.maxHp;
      this.inv = { ...this.inv, ...d.inv }; this.tools = { ...this.tools, ...d.tools };
      this.time = d.time; this.day = d.day; this.score = d.score; this.kills = d.kills; this.deaths = d.deaths;
      // Older saves with early structures have already seen the build patrol.
      this.buildPatrolDay = Number.isFinite(d.buildPatrolDay) ? Math.max(0, d.buildPatrolDay!) : d.structures.length ? this.day : 0;
      // Saves predating the compact ring keep the exact old sockets and tent.
      this.legacyTerritory = d.territoryLayout !== "compact";
      const camp = this.worldProps.find((prop) => prop.sprite === "reference_camp");
      if (camp) Object.assign(camp, this.legacyTerritory ? CAMP_LEGACY : CAMP_COMPACT);
      this.territoryLevel = Number.isInteger(d.territoryLevel) ? clamp(d.territoryLevel!, 1, TERRITORIES.length) : 1;
      this.fenceRing = Number.isInteger(d.fenceRing) ? clamp(d.fenceRing!, 1, this.territoryLevel) : this.territoryLevel;
      this.defenseTier = defenseTier(d.defenseTier);
      this.structures = d.structures.map((s) => {
        const fenceStyle = s.fenceStyle ?? "palisade";
        const tier = defenseTier(s.tier);
        const mhp = this.structMaxHp(s.type, fenceStyle, tier);
        const ring = s.type === "wall" || s.type === "gate";
        const rotation = s.rotation ?? (ring ? Math.atan2(s.y - BASE.y, s.x - BASE.x) + Math.PI / 2 : 0);
        return { type: s.type, x: s.x, y: s.y, prodT: 0, hp: Math.min(s.hp ?? mhp, mhp), maxHp: mhp, open: !!s.open, rotation, fenceStyle,
          ...(s.type === "spike_trap" || s.type === "barricade" ? { tier } : {}) };
      });
      // A generated building never hides or replaces an old player build.
      const savedRect = (st: Structure) => anchoredRect(st.x, st.y + 20, st.type === "house" ? 240 : 130, st.type === "house" ? 260 : 150);
      const conflicts = (rect: WorldRect) => this.structures.some((st) => rectanglesOverlap(rect, savedRect(st)));
      this.villageHouses = this.villageHouses.filter((house) => !conflicts(houseBounds(house)));
      const hidden = new Set(this.villageBuildings.filter((b) => conflicts(anchoredRect(b.x, b.y, b.width, b.height))).map((b) => b.name));
      if (hidden.size) {
        this.villageBuildings = this.villageBuildings.filter((b) => !hidden.has(b.name));
        this.worldProps = this.worldProps.filter((p) => ![...hidden].some((name) => p.sprite === `reference_${name}`));
      }
      const excluded = new Set(this.hamlets.filter((h) => this.structures.some((st) =>
        h.houses.some((house) => rectanglesOverlap(houseBounds(house), savedRect(st))) || dist2(st.x, st.y, h.x, h.y) < 150 ** 2
      )).map((h) => h.id));
      if (excluded.size) {
        this.hamlets = this.hamlets.filter((h) => !excluded.has(h.id));
        this.villagers = this.villagers.filter((v) => !v.hamletId || !excluded.has(v.hamletId));
        this.buildMinimap();
      }
      this.layFenceFoundations(this.structures.filter((s) => (s.type === "wall" || s.type === "gate") && Math.hypot(s.x - BASE.x, s.y - BASE.y) > this.fenceSpec(1).fenceRadius + 40));
      // A structure from an older save may predate a newly carved creek. Give
      // it a small dry foundation rather than deleting or moving the build.
      let savedFoundation = false;
      for (const s of this.structures) {
        if (s.type === "raft" || this.tileAt(s.x, s.y) !== T_WATER) continue;
        const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const at = y * W + x;
          if (this.tiles[at] === T_WATER) { this.tiles[at] = T_BRIDGE; savedFoundation = true; }
        }
      }
      if (savedFoundation) { this.terrain?.invalidateAll(); this.buildMinimap(); }
      this.protectSavedStructuresFromNodes();
      this.questP = d.questP; this.questDone = d.questDone;
      this.visited = new Set(d.visited);
      this.gatheredWoodStone = this.questP[0];
      const cols: Record<string, string> = { rian: "#e8a33d", maya: "#5ad0c9", tito: "#c9b45a", bren: "#c95a5a", ...Object.fromEntries(SPECIALIST_IDS.map((id) => [id, SPECIALISTS[id].color])) };
      const names: Record<string, string> = { rian: "Rian", maya: "Maya", tito: "Tito", bren: "Bren", ...Object.fromEntries(SPECIALIST_IDS.map((id) => [id, SPECIALISTS[id].name])) };
      this.allies = [...new Set(d.allies)].map((id) => ({ id, name: names[id] ?? id, color: cols[id] ?? "#fff", x: this.px + 40, y: this.py, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 }));
      this.specialists = newSpecialists();
      for (const id of SPECIALIST_IDS) {
        const old = d.specialists?.[id], person = this.specialists[id];
        if (old) {
          person.rescued = old.rescued === true; person.hired = old.hired === true;
          const duties: SpecialistDuty[] = id === "miner" ? ["mine", "rest"] : ["follow", "defend", "train"];
          if (duties.includes(old.duty)) person.duty = old.duty;
          person.training = Number.isFinite(old.training) ? clamp(old.training, 0, 120) : 0;
          person.weaponLevel = Number.isFinite(old.weaponLevel) ? clamp(Math.floor(old.weaponLevel), 1, 3) : 1;
          person.workTime = Number.isFinite(old.workTime) ? clamp(old.workTime, 0, 44.99) : 0;
        }
        // Grandfather an archer or other specialist actually present in an old
        // save; completing the old quest alone no longer creates a new one.
        if (this.allies.some((a) => a.id === id)) {
          person.rescued = true; person.hired = true;
          if (!old && id === "archer") {
            person.weaponLevel = clamp(this.tools.sword, 1, 3);
            person.training = person.weaponLevel === 3 ? 120 : person.weaponLevel === 2 ? 45 : 0;
          }
        } else if (person.hired) {
          person.rescued = true;
          const def = SPECIALISTS[id];
          this.allies.push({ id, name: def.name, color: def.color, x: this.px + 40, y: this.py, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 });
        }
      }
      this.crystalDiscovered = d.crystalDiscovered === true || (d.crystalDiscovered === undefined && this.inv.crystal > 0);
      const savedStumps = new Map(d.nodeStumps ?? []);
      for (const [i, hp, rs] of d.nodeHp) {
        const node = this.nodes[i];
        if (node) {
          node.hp = hp; node.respawn = rs;
          if (hp <= 0 && (node.type === "tree" || node.type === "pine")) {
            const stump = savedStumps.get(i);
            node.stumpHp = d.nodeStumps === undefined ? 12 : Number.isFinite(stump) ? clamp(stump!, 0, 12) : 0;
          }
          if (hp <= 0 && rs > 0) this.depletedNodes.add(node);
        }
      }
      for (const fence of this.structures.filter((s) => s.type === "wall" || s.type === "gate")) {
        for (const node of this.nearbyNodes(fence.x, fence.y)) {
          if ((node.type === "tree" || node.type === "pine") && dist2(node.x, node.y, fence.x, fence.y) < 60 ** 2 && (node.hp > 0 || (node.stumpHp ?? 0) > 0)) {
            node.hp = 0; node.stumpHp = 0; node.respawn = 30; this.depletedNodes.add(node);
          }
        }
      }
      for (const arena of this.structures.filter((s) => s.type === "training")) {
        for (const node of this.nearbyNodes(arena.x, arena.y)) {
          if (Math.abs(node.x - arena.x) < 110 && Math.abs(node.y - arena.y) < 90 && node.hp > 0 && node.type !== "bush" && node.type !== "berry") {
            node.hp = 0; node.stumpHp = 0; node.respawn = 30; this.depletedNodes.add(node);
          }
        }
      }
      if (d.chests) d.chests.forEach((o, i) => { if (this.chests[i]) this.chests[i].opened = o; });
      const relocated = this.ensurePlayablePosition();
      if (relocated) {
        for (const ally of this.allies) { ally.x = this.px + 40; ally.y = this.py - 20; }
        this.toast("Você foi colocado em segurança na praia. Siga Rian pela trilha.", "rian");
      }
      this.rianDuty = d.rianDuty === "follow" ? "follow" : "stay";
      if (d.escortDone === false) {
        const nearest = ESCORT_ROUTE.reduce((best, point, i) =>
          dist2(point.x, point.y, this.px, this.py) < dist2(ESCORT_ROUTE[best].x, ESCORT_ROUTE[best].y, this.px, this.py) ? i : best, 0);
        const savedIndex = typeof d.escortIndex === "number" ? d.escortIndex : nearest;
        this.escort = { active: true, i: clamp(Math.floor(savedIndex), 0, ESCORT_ROUTE.length - 1), waitT: 0, wp: ESCORT_ROUTE.map((point) => ({ ...point })) };
      } else {
        this.escort.active = false;
        const rian = this.allies.find((ally) => ally.id === "rian");
        if (rian && this.rianDuty === "stay") { rian.x = BASE.x + 35; rian.y = BASE.y + 90; }
      }
      this.discoveredSites = new Set(d.discoveredSites ?? []);
      this.claimedSites = new Set(d.claimedSites ?? []);
      this.seenCreatures = new Set(d.seenCreatures ?? []);
      this.creatureKills = d.creatureKills ?? {};
      this.equipment = { harness: true, coat: false, charm: false, ...(d.equipment ?? {}) };
      this.fenceStyle = d.fenceStyle ?? "palisade";
      this.combatWeapon = d.combatWeapon === "bow" ? "bow" : "sword";
      this.pendingRespawn = d.pendingRespawn === true;
      this.deathReport = d.deathReport ?? null;
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
  applyDeathRaid(): DeathReport {
    const nearby = this.monsters.filter((m) => m.hp > 0 && dist2(m.x, m.y, this.px, this.py) < 400 ** 2).length;
    const pressure = Math.max(this.raidPeak, nearby);
    const intensity = clamp(pressure / 12, 0, 1);
    const difficulty = this.opts.difficulty;
    const extra = difficulty === "impossivel" ? 0.22 : difficulty === "muito-dificil" ? 0.16 : 0.12;
    const fraction = this.diff.lossOnDeath + intensity * extra;
    const lost: Partial<Record<ResKey, number>> = {};
    // Scarce metals, crystals, crafted tools and equipment are never removed.
    for (const key of ["wood", "stone", "fiber", "food"] as ResKey[]) {
      const count = Math.floor(this.inv[key] * fraction);
      this.inv[key] -= count; lost[key] = count;
    }
    const baseDamage = difficulty === "impossivel" ? 0.30 : difficulty === "muito-dificil" ? 0.20 : 0.08;
    const destruction = baseDamage + intensity * (difficulty === "impossivel" ? 0.60 : difficulty === "muito-dificil" ? 0.30 : 0.22);
    const rng = mulberry32((this.opts.seed ^ Math.imul(this.deaths, 0x9e3779b9) ^ Math.imul(this.day, 0x85ebca6b)) >>> 0);
    let damaged = 0, destroyed = 0, lostHouses = 0;
    this.structures = this.structures.filter((s) => {
      // A fire remains as the recovery point, and a raft is not an attack target.
      if (s.type === "campfire" || s.type === "raft") return true;
      const exposed = s.type === "wall" || s.type === "gate" || s.type === "farm" || s.type === "spike_trap" || s.type === "barricade";
      const chance = destruction * (exposed ? 1 : 0.6);
      const roll = rng();
      if (roll < chance) {
        destroyed++;
        if (s.type === "house") lostHouses++;
        return false;
      }
      if (roll < Math.min(1, chance + 0.35 + intensity * 0.15)) {
        s.hp = Math.max(1, s.hp - s.maxHp * (0.2 + intensity * 0.35));
        damaged++;
      }
      return true;
    });
    if (lostHouses) this.maxHp = Math.max(100, this.maxHp - lostHouses * 12);
    this.fenceSpaceCache = null; this.fenceLinks.clear(); this.fencePosts.clear();
    return { lost, percent: Math.round(fraction * 100), pressure, damaged, destroyed };
  }

  die() {
    if (this.state === "gameover") return;
    this.deaths++;
    this.mapOpen = false;
    this.softPause = false;
    this.deathReport = this.applyDeathRaid();
    this.pendingRespawn = true;
    this.outcome = null;
    this.hp = 0;
    this.state = "gameover";
    this.sfx.die();
    this.shake = 16;
    this.spawnParticles(this.px, this.py, "#e03a3a", 30, 300);
    this.saveGame();
    this.emitState();
  }
  respawn() {
    if (this.state !== "gameover") return;
    this.softPause = false;
    this.pendingRespawn = false;
    this.hp = Math.max(1, Math.ceil(this.maxHp * 0.3));
    this.stamina = 25;
    const fire = this.structures.find((s) => s.type === "campfire");
    if (fire) { this.px = fire.x + 52; this.py = fire.y + 40; }
    else { this.px = BASE.x; this.py = BASE.y; }
    this.ensurePlayablePosition();
    this.centerCamera();
    // Keep nearby companions from covering the injured player during the
    // wake-up animation. Distant followers and their saved roles are unchanged.
    const spaced: { x: number; y: number }[] = [];
    for (const [index, ally] of this.allies.entries()) {
      if (dist2(ally.x, ally.y, this.px, this.py) >= 150 ** 2) { spaced.push(ally); continue; }
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = (index + attempt) * Math.PI * 2 / 6;
        const radius = 145 + Math.floor(attempt / 6) * 45;
        const x = this.px + Math.cos(angle) * radius, y = this.py + Math.sin(angle) * radius;
        if (this.tileAt(x, y) === T_WATER || this.referenceStructureAt(x, y) || this.blockedByWall(x, y) || spaced.some((other) => dist2(x, y, other.x, other.y) < 60 ** 2)) continue;
        ally.x = x; ally.y = y; ally.vx = 0; ally.vy = 0; break;
      }
      spaced.push(ally);
    }
    this.pvx = 0; this.pvy = 0; this.moving = false; this.running_ = false;
    this.keys.clear(); this.touchMove.x = 0; this.touchMove.y = 0; this.touchBtn.run = false;
    this.invulnT = 5; this.wakeT = 2.8; this.recoveryNoticeT = 10;
    // Survivors retreat before the player wakes; nearby enemies cannot chain-kill.
    this.monsters = this.monsters.filter((m) => dist2(m.x, m.y, this.px, this.py) >= 600 ** 2);
    this.projectiles = []; this.magicEffects = []; this.spawnCooldown = 16; this.raidPeak = 0;
    this.state = "playing";
    this.toast("Você acordou ferido na base. Reúna forças e repare os estragos.");
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
      if (resource === "crystal" && n > 0) this.crystalDiscovered = true;
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
      case "orc": return { hp: 90 * h, dmg: 20 * dm, speed: 126, r: 16 };
      case "zombie": return { hp: 50 * h, dmg: 12 * dm, speed: 88, r: 13 };
      case "skeleton": return { hp: 55 * h, dmg: 15 * dm, speed: 118, r: 13 };
      case "vampire": return { hp: 92 * h, dmg: 20 * dm, speed: 185, r: 15 };
      case "lich": return { hp: 105 * h, dmg: 18 * dm, speed: 95, r: 15 };
    }
  }
  spawnMonster(x: number, y: number, type: MonType, rare = false) {
    const c = this.monsterCfg(type), hp = c.hp * (rare ? 1.6 : 1);
    this.monsters.push({
      type, x, y, vx: 0, vy: 0, hp, maxHp: hp, dmg: c.dmg * (rare ? 1.15 : 1), speed: c.speed, r: c.r,
      state: "idle", t: Math.random() * 2, atkCd: 0, flash: 0, home: { x, y }, dir: 0, siege: false,
      skin: this.skinFor(type, x, y), rare,
    });
  }
  skinFor(type: MonType, x: number, y: number): string {
    const t = this.tileAt(x, y);
    switch (type) {
      case "imp": return "goblin";
      case "crawler": return "ghost";
      case "stalker": return "wraith";
      case "spitter": return "skelmage";
      case "brute": return t === T_ROCK || t === T_CAVE || t === T_MINERAL ? "golem" : "treant";
      case "hulk": return "crystalgolem";
      case "bat": return "demonbat";
      case "slime": return "iceslime";
      case "demon": return "emberdemon";
      case "lizard": return "lizardman";
      case "orc": return "orc";
      case "zombie": return "zombie";
      case "skeleton": return "skeleton";
      case "vampire": return "vampire";
      case "lich": return "lich";
    }
  }
  monsterTypeForZone(x: number, y: number): MonType {
    const t = this.tileAt(x, y);
    const roll = Math.random();
    const night = this.isNight();
    if (t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) return roll < 0.68 ? "slime" : roll < 0.9 ? "bat" : "hulk";
    if (t === T_MINERAL) return roll < 0.18 ? "hulk" : roll < 0.58 ? "brute" : roll < 0.8 ? "bat" : "crawler";
    const scaled = SITES.find((site) => site.id === "scaled");
    if (scaled && dist2(x, y, scaled.x, scaled.y) < scaled.radius * scaled.radius) return roll < 0.72 ? "lizard" : "slime";
    if (t === T_NECRO) return roll < 0.18 ? "zombie" : roll < 0.43 ? "skeleton" : roll < 0.61 ? "lich" : roll < 0.82 ? "vampire" : "demon";
    if (t === T_RUIN) return roll < 0.24 ? "zombie" : roll < 0.48 ? "skeleton" : roll < 0.66 ? "spitter" : roll < 0.82 ? "bat" : "lich";
    if (t === T_CAVE && roll > 0.80) return roll > 0.93 ? "lich" : "skeleton";
    if (t === T_DARK && roll > 0.90) return night ? "vampire" : "demon";
    if (night && roll > 0.90) return "bat";
    // Orcs have a built-in fallback, so encounters do not depend on a local ZIP.
    if (roll >= 0.75 && roll < 0.86) return "orc";
    const horror = t === T_CAVE || t === T_ROCK || t === T_DARK;
    const bigChance = this.day < 3 ? 0 : Math.min(0.24, 0.04 + this.day * 0.012) * (horror ? 1.6 : 1);
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
  monsterCap() {
    return Math.min(54, Math.max(1, Math.floor((5 + Math.max(0, this.day - 1) * 1.35) * this.diff.spawn)));
  }

  monsterSpawnClear(x: number, y: number, type: MonType) {
    if (this.tileAt(x, y) === T_WATER || this.referenceStructureAt(x, y) || this.blockedByWall(x, y)) return false;
    const radius = this.monsterCfg(type).r;
    // Do not materialize inside a trunk; subsequent movement can freely pass
    // underneath a canopy instead of getting trapped in the forest.
    if (this.nearbyNodes(x, y).some((n) => n.hp > 0 && (n.type === "tree" || n.type === "pine") && dist2(x, y, n.x, n.y) < (radius + 24) ** 2)) return false;
    return this.monsters.every((m) => m.hp <= 0 || dist2(x, y, m.x, m.y) >= Math.max(42, radius + m.r + 16) ** 2);
  }

  spawnWave(n: number, cx = BASE.x, cy = BASE.y) {
    const count = Math.max(0, Math.min(n, this.monsterCap() - this.monsters.length));
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const type: MonType = this.day >= 4 && i === 0 && count >= 5 ? "brute" : Math.random() < 0.7 ? "imp" : "crawler";
      for (let attempt = 0; attempt < 8; attempt++) {
        // Spread arrivals around the perimeter instead of stacking a crowd at
        // a single spawn point. Skip invalid sites rather than spawning in water.
        const a = start + i * Math.PI * 2 / Math.max(1, count) + (Math.random() - 0.5) * 0.35;
        const d = this.fenceSpec(this.territoryLevel).fenceRadius + 160 + Math.random() * 240;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (!this.monsterSpawnClear(x, y, type)) continue;
        this.spawnMonster(x, y, type); break;
      }
    }
  }

  updateSpawns(dt: number) {
    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0) return;
    const night = this.isNight();
    // A real cooldown avoids several random batches arriving in the same
    // second. Days and difficulty increase both pressure and the live cap.
    const interval = night ? Math.max(3.5, 13 - Math.max(0, this.day - 1) * 0.45) : 22;
    this.spawnCooldown = interval / Math.sqrt(this.diff.spawn / 1.2) * (0.8 + Math.random() * 0.4);
    const cap = this.monsterCap();
    if (this.monsters.length >= cap) return;
    const batch = night && this.day >= 8 ? 1 + Math.floor(Math.random() * 3) : night && this.day >= 3 ? 1 + Math.floor(Math.random() * 2) : 1;
    // Spawn in a ring around the player, biased to dangerous zones by day.
    for (let tryI = 0; tryI < 10; tryI++) {
      const a = Math.random() * Math.PI * 2;
      const nearBase = dist2(this.px, this.py, BASE.x, BASE.y) < this.territoryRadius() ** 2;
      const minimum = nearBase ? Math.max(460, this.fenceSpec(this.territoryLevel).fenceRadius + 120) : 460;
      const d = minimum + Math.random() * 420;
      const x = this.px + Math.cos(a) * d, y = this.py + Math.sin(a) * d;
      const t = this.tileAt(x, y);
      if (t === T_WATER) continue;
      const darkZone = t === T_DARK || t === T_CAVE || t === T_ROCK || t === T_MINERAL || t === T_RUIN || t === T_NECRO || t === T_SNOW || t === T_ICE;
      if (!night && !darkZone) continue;
      if (dist2(x, y, VILLAGE.x, VILLAGE.y) < VILLAGE_AREA_RADIUS ** 2 || this.hamlets.some((h) => dist2(x, y, h.x, h.y) < 320 ** 2)) continue;
      if (dist2(x, y, BASE.x, BASE.y) < (this.fenceSpec(this.territoryLevel).fenceRadius + 70) ** 2) continue;
      for (let b = 0; b < batch && this.monsters.length < cap; b++) {
        const angle = a + b * Math.PI * 2 / Math.max(1, batch);
        const sx = x + (b ? Math.cos(angle) * 70 : 0), sy = y + (b ? Math.sin(angle) * 70 : 0);
        if (dist2(sx, sy, VILLAGE.x, VILLAGE.y) < VILLAGE_AREA_RADIUS ** 2 || this.hamlets.some((h) => dist2(sx, sy, h.x, h.y) < 320 ** 2) || dist2(sx, sy, BASE.x, BASE.y) < (this.fenceSpec(this.territoryLevel).fenceRadius + 70) ** 2) continue;
        const type = this.monsterTypeForZone(sx, sy);
        if (this.monsterSpawnClear(sx, sy, type)) this.spawnMonster(sx, sy, type, Math.random() < 0.08);
      }
      break;
    }
  }

  blockedByWall(x: number, y: number): boolean {
    if (this.baseChestContains(x, y)) return true;
    for (const s of this.structures) {
      if (s.type === "gate" && s.open) continue;
      if ((s.type === "wall" || s.type === "gate" || s.type === "barricade" || s.type === "house" || s.type === "tower" || s.type === "forge") && this.placedStructureContains(s, x, y, 25)) return true;
    }
    return false;
  }

  nearestSiegeTarget(m: Monster): Structure | null {
    let best: Structure | null = null;
    let bd = Infinity;
    for (const st of this.structures) {
      if (st.type !== "wall" && st.type !== "gate" && st.type !== "barricade") continue;
      if (st.type === "gate" && st.open) continue;
      const d = dist2(st.x, st.y, m.x, m.y);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  separateMonsters(dt: number) {
    // Resolve only neighboring overlaps. Each pair moves gradually, keeping
    // the horde readable without teleporting creatures through solid walls.
    for (let i = 0; i < this.monsters.length; i++) {
      const a = this.monsters[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < this.monsters.length; j++) {
        const b = this.monsters[j];
        if (b.hp <= 0) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = Math.max(30, a.r + b.r + 12);
        if (distance >= minimum) continue;
        if (distance < 0.01) {
          const angle = (i * 17 + j * 29) * 2.399963;
          dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
        } else { dx /= distance; dy /= distance; }
        const amount = Math.min((minimum - distance) * 0.5, 65 * dt);
        const move = (m: Monster, x: number, y: number) => {
          if (this.tileAt(x, y) !== T_WATER && !this.blockedByWall(x, y) && !this.referenceStructureAt(x, y)) { m.x = x; m.y = y; }
        };
        move(a, a.x - dx * amount, a.y - dy * amount);
        move(b, b.x + dx * amount, b.y + dy * amount);
      }
    }
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
      if (!night && dp > 1500 && [T_GRASS, T_AUTUMN, T_BLOSSOM].includes(this.tileAt(m.x, m.y))) { this.monsters.splice(i, 1); continue; }
      if (dp > 1600) continue;

      const siegeTarget = this.nearestSiegeTarget(m);
      const closeToPlayer = dp < (night ? 250 : 170);
      const wallDist = siegeTarget ? Math.sqrt(dist2(siegeTarget.x, siegeTarget.y, m.x, m.y)) : Infinity;
      const nearWall = wallDist < 820;
      m.siege = !!siegeTarget && (wallDist < 140 || (!closeToPlayer && nearWall && (night || dist2(m.x, m.y, BASE.x, BASE.y) < (this.territoryRadius() * 1.9) ** 2)));
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
          if (dp < aggro || m.siege) {
            m.state = "chase";
            if (this.settings.creatureSounds && dp < 560) this.sfx.creature(m.type, 1 - dp / 600, (m.x - this.px) / 480);
          }
          break;
        }
        case "chase": {
          let a = Math.atan2(ty - m.y, tx - m.x);
          // Follow a consistent side of water/buildings until the direct line
          // is clear. Brief side-steps alone oscillated against large walls.
          // Trees deliberately do not obstruct monsters: only player-built
          // defenses remain siege targets, never trees or canopies.
          const look = (angle: number, far: boolean) => {
            const steps = far ? [m.r + 20, m.r + 50, m.r + 80, m.r + 110] : [m.r + 24];
            for (const distance of steps) {
              const x = m.x + Math.cos(angle) * distance, y = m.y + Math.sin(angle) * distance;
              if (this.tileAt(x, y) === T_WATER || this.referenceStructureAt(x, y)) return false;
            }
            return true;
          };
          if (this.referenceStructureAt(m.x, m.y)) m.detourSide = undefined;
          else {
            if (m.detourSide && look(a, true)) m.detourSide = undefined;
            if (!m.detourSide && !look(a, false)) m.detourSide = (Math.floor(m.home.x + m.home.y) & 1) ? 1 : -1;
            if (m.detourSide) {
              const side = m.detourSide;
              let found = false;
              for (const direction of [side, -side] as const) {
                for (const turn of [1.7, 2, 2.35, 1.35]) {
                  if (!look(a + direction * turn, false)) continue;
                  a += direction * turn; m.detourSide = direction as -1 | 1; found = true; break;
                }
                if (found) break;
              }
            }
          }
          m.dir = a;
          const sp = m.speed * (night ? 1.16 : 1);
          m.vx += (Math.cos(a) * sp - m.vx) * Math.min(1, dt * 5);
          m.vy += (Math.sin(a) * sp - m.vy) * Math.min(1, dt * 5);
          const range = m.siege ? m.r + 34 : (m.type === "spitter" || m.type === "lich") ? 250 : m.r + 26;
          if (targetDist < range && m.atkCd <= 0) {
            m.state = "windup";
            m.t = m.type === "hulk" ? 0.6 : m.type === "brute" ? 0.5 : m.type === "imp" ? 0.3 : 0.38;
            m.vx *= 0.15; m.vy *= 0.15;
            if (this.settings.creatureSounds && dp < 560) this.sfx.creature(m.type, 1 - dp / 600, (m.x - this.px) / 480);
          }
          if (!m.siege && dp > 1000) m.state = "idle";
          break;
        }
        case "windup": {
          m.t -= dt;
          if (m.t <= 0) {
            m.state = "attack"; m.t = 0.16;
            if ((m.type === "spitter" || m.type === "lich") && !m.siege) {
              const a = Math.atan2(this.py - m.y, this.px - m.x);
              this.projectiles.push({ x: m.x, y: m.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, t: 2, dmg: m.dmg });
              this.sfx.swing();
            } else if (m.siege) {
              // A target can disappear or change during a windup; never damage
              // a distant barricade/fence after colliding with another object.
              if (siegeTarget && dist2(m.x, m.y, siegeTarget.x, siegeTarget.y) < (m.r + 45) ** 2) {
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
          if (!m.siege && m.type !== "spitter" && m.type !== "lich" && dp < m.r + 22 && this.invulnT <= 0) {
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
      const wallX = this.blockedByWall(nx, m.y), wallY = this.blockedByWall(m.x, ny);
      // Fixed buildings stop creatures, but do not make them attack an unrelated
      // player-built fence. Let creatures spawned inside a footprint escape.
      const insideReference = this.referenceStructureAt(m.x, m.y);
      const buildingX = !insideReference && this.referenceStructureAt(nx, m.y);
      const buildingY = !insideReference && this.referenceStructureAt(m.x, ny);
      if (this.tileAt(nx, m.y) !== T_WATER && !wallX && !buildingX) m.x = nx; else m.vx *= -0.5;
      if (this.tileAt(m.x, ny) !== T_WATER && !wallY && !buildingY) m.y = ny; else m.vy *= -0.5;
      if (wallX || wallY) {
        m.siege = true;
        if (m.state === "chase") { m.state = "windup"; m.t = 0.12; }
      }
      m.vx *= Math.pow(0.6, dt * 6); m.vy *= Math.pow(0.6, dt * 6);
    }
    this.separateMonsters(dt);
    const pressure = this.monsters.filter((m) => m.hp > 0 && (m.siege || dist2(m.x, m.y, this.px, this.py) < 400 ** 2)).length;
    this.raidPeak = Math.max(this.raidPeak, pressure);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t -= dt;
      if (p.kind === "ally" || p.kind === "magic" || p.kind === "player") {
        // Substeps prevent fast arrows from tunneling through enemies or walls.
        // Friendly arrows never test the player or other allies as targets.
        const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * dt / 8));
        let consumed = p.t <= 0;
        for (let step = 0; step < steps && !consumed; step++) {
          p.x += p.vx * dt / steps; p.y += p.vy * dt / steps;
          if (this.tileAt(p.x, p.y) === T_WATER || this.blockedByWall(p.x, p.y) || this.referenceStructureAt(p.x, p.y)) { consumed = true; break; }
          for (const m of this.monsters) {
            if (m.hp <= 0 || m.defeated || dist2(p.x, p.y, m.x, m.y) > (m.r + 4) * (m.r + 4)) continue;
            m.hp -= p.dmg; m.flash = 0.12; m.state = "hurt"; m.t = 0.12;
            const speed = Math.hypot(p.vx, p.vy) || 1;
            m.vx += p.vx / speed * 100; m.vy += p.vy / speed * 100;
            this.spawnParticles(m.x, m.y, "#ffd34d", 5, 120);
            if (p.kind === "magic" && this.magicEffects.length < 24) this.magicEffects.push({ x: m.x, y: m.y, remaining: 0.55 });
            this.floaters.push({ x: m.x, y: m.y - 18, t: 0, text: `${p.dmg}`, c: "#ffeaa0" });
            this.sfx.hit();
            if (m.hp <= 0) this.killMonster(m);
            consumed = true; break;
          }
          if (!consumed && p.kind === "player") for (const animal of this.animals) {
            if (dist2(p.x, p.y, animal.x, animal.y) > 18 * 18) continue;
            this.hitAnimal(animal, p.dmg);
            consumed = true; break;
          }
        }
        if (consumed) this.projectiles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t <= 0 || this.tileAt(p.x, p.y) === T_WATER || this.blockedByWall(p.x, p.y) || this.referenceStructureAt(p.x, p.y)) { this.projectiles.splice(i, 1); continue; }
      if (this.invulnT <= 0 && dist2(p.x, p.y, this.px, this.py) < 22 * 22) {
        this.damagePlayer(p.dmg, p.x, p.y);
        this.projectiles.splice(i, 1);
      }
    }
  }

  damagePlayer(dmg: number, fromX: number, fromY: number, knockback = 320) {
    if (this.invulnT > 0 || this.state !== "playing") return;
    const final = Math.max(1, Math.round(dmg * (this.equipment.coat ? 0.82 : 1)));
    this.hp -= final;
    this.invulnT = 0.55;
    this.hurtFlash = 0.3;
    this.shake = Math.min(16, this.shake + 9);
    this.hitstop = 0.05;
    const a = Math.atan2(this.py - fromY, this.px - fromX);
    this.pvx += Math.cos(a) * knockback; this.pvy += Math.sin(a) * knockback;
    this.spawnParticles(this.px, this.py, "#e03a3a", 14, 220);
    this.floaters.push({ x: this.px, y: this.py - 34, t: 0, text: `-${final}`, c: "#ff6060" });
    this.sfx.hurt();
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  updateAllies(dt: number) {
    for (const al of this.allies) {
      if (al.downT > 0) { al.downT -= dt; if (al.downT <= 0) { al.x = BASE.x; al.y = BASE.y; } continue; }
      al.atkCd = Math.max(0, al.atkCd - dt);
      const person = this.specialists[al.id as SpecialistId];
      const duty = al.id === "rian" && !this.escort.active
        ? (this.rianDuty === "follow" ? "follow" : "defend")
        : person?.hired ? person.duty : undefined;
      const ranged = al.id === "archer" || al.id === "mage";
      let tgt: Monster | null = null; let bd = (ranged ? 360 : 230) ** 2;
      for (const m of this.monsters) {
        if (m.hp <= 0 || m.defeated || duty === "train" || duty === "mine" || duty === "rest") continue;
        if (duty === "defend" && dist2(m.x, m.y, BASE.x, BASE.y) > 400 ** 2) continue;
        const d = dist2(m.x, m.y, al.x, al.y);
        if (d < bd) { bd = d; tgt = m; }
      }
      let gx = this.px - 46 + ((al.id.charCodeAt(0) % 3) - 1) * 36;
      let gy = this.py + 34 + ((al.id.charCodeAt(1) % 3) - 1) * 30;
      if (al.id === "tito" || al.id === "bren") { gx = BASE.x + (al.id === "tito" ? -60 : 60); gy = BASE.y + 20; }
      if (duty === "defend" || duty === "train" || duty === "rest" || duty === "mine") {
        const quarry = duty === "mine" ? this.structures.find((s) => s.type === "quarry") : undefined;
        gx = (quarry?.x ?? BASE.x) + (al.id === "rian" ? 35 : al.id === "guard" ? 70 : -70);
        gy = (quarry?.y ?? BASE.y) + (al.id === "rian" ? 90 : 55);
      }
      const arena = duty === "train" ? this.structures.find((s) => s.type === "training") : undefined;
      if (arena) {
        const station = this.trainingStation(arena, al.id as SpecialistId);
        gx = station.x; gy = station.y;
        if (dist2(al.x, al.y, gx, gy) < 38 ** 2 && !this.isNight() &&
            !this.monsters.some((m) => m.hp > 0 && dist2(m.x, m.y, arena.x, arena.y) < 240 ** 2)) {
          al.dir = -Math.PI / 2;
          // Practice uses the existing character animation; it does not create
          // projectiles or damage creatures outside the arena.
          if (al.atkCd <= 0) al.atkCd = al.id === "archer" ? 1.2 : 0.7;
        }
      }
      if (tgt && (al.id === "rian" || al.id === "maya" || al.id === "guard")) { gx = tgt.x; gy = tgt.y; }
      if (tgt && ranged && (duty === "defend" || dist2(al.x, al.y, this.px, this.py) < 480 * 480)) {
        const distance = Math.sqrt(dist2(tgt.x, tgt.y, al.x, al.y));
        const angle = Math.atan2(tgt.y - al.y, tgt.x - al.x);
        if (distance > 280) { gx = tgt.x - Math.cos(angle) * 220; gy = tgt.y - Math.sin(angle) * 220; }
        else if (distance < 110) { gx = al.x - Math.cos(angle) * 110; gy = al.y - Math.sin(angle) * 110; }
        else { gx = al.x; gy = al.y; }
      }
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
      // Keep the old long-distance catch-up for followers. Stationary duties
      // return to their own destination instead of being teleported to the player.
      if (d > 1200 && !escorting) {
        if (duty && duty !== "follow") { al.x = gx + 30; al.y = gy + 30; }
        else { al.x = this.px + 40; al.y = this.py + 40; }
      }
      const oldX = al.x, oldY = al.y, nx = oldX + al.vx * dt, ny = oldY + al.vy * dt;
      const inside = this.referenceStructureAt(oldX, oldY);
      const clear = (x: number, y: number) => this.tileAt(x, y) !== T_WATER && (!this.referenceStructureAt(x, y) || inside);
      if (clear(nx, oldY)) al.x = nx;
      if (clear(al.x, ny)) al.y = ny;
      if (dt > 0) { al.vx = (al.x - oldX) / dt; al.vy = (al.y - oldY) / dt; }
      if (tgt && ranged) {
        al.dir = Math.atan2(tgt.y - al.y, tgt.x - al.x);
        if (al.atkCd <= 0 && dist2(tgt.x, tgt.y, al.x, al.y) < 360 * 360) {
          al.atkCd = 1.2;
          const speed = 420, dx = Math.cos(al.dir), dy = Math.sin(al.dir);
          const distance = Math.sqrt(dist2(tgt.x, tgt.y, al.x, al.y));
          // Do not spawn past an enemy standing right next to the archer.
          const offset = Math.max(0, Math.min(18, distance - tgt.r - 5));
          this.projectiles.push({ kind: al.id === "mage" ? "magic" : "ally", x: al.x + dx * offset, y: al.y + dy * offset, vx: dx * speed, vy: dy * speed, t: 1, dmg: 4 + (person ? this.specialistLevel(person) : 1) * 3 });
          this.sfx.swing();
        }
      }
      // Existing melee allies keep their previous attack.
      if (tgt && al.atkCd <= 0 && dist2(tgt.x, tgt.y, al.x, al.y) < 46 * 46 && (al.id === "rian" || al.id === "maya" || al.id === "guard")) {
        al.atkCd = 0.7;
        const dmg = 4 + (person ? this.specialistLevel(person) : this.tools.sword) * 3;
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
      } else if (a.t <= 0 || (a.goalX !== undefined && a.goalY !== undefined && dist2(a.x, a.y, a.goalX, a.goalY) < 12 ** 2)) {
        a.t = 2 + Math.random() * 3;
        if (a.goalX !== undefined) { a.goalX = undefined; a.goalY = undefined; a.vx = 0; a.vy = 0; }
        else {
          const ang = Math.random() * Math.PI * 2, distance = 45 + Math.random() * 90;
          a.goalX = a.x + Math.cos(ang) * distance; a.goalY = a.y + Math.sin(ang) * distance;
        }
      }
      if (a.flee <= 0 && a.goalX !== undefined && a.goalY !== undefined) {
        const ang = Math.atan2(a.goalY - a.y, a.goalX - a.x), sp = a.kind === "rabbit" ? 55 : 38;
        a.vx += (Math.cos(ang) * sp - a.vx) * Math.min(1, dt * 5);
        a.vy += (Math.sin(ang) * sp - a.vy) * Math.min(1, dt * 5);
      }
      if (Math.abs(a.vx) > 4) a.dir = a.vx > 0 ? 1 : -1;
      const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
      const t = this.tileAt(nx, ny);
      if (t !== T_WATER && t !== T_CAVE && !this.referenceStructureAt(nx, ny) && !this.blockedByWall(nx, ny)) { a.x = nx; a.y = ny; }
      else { a.vx = -a.vx * 0.4; a.vy = -a.vy * 0.4; a.goalX = undefined; a.goalY = undefined; a.t = 0.4; }
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
      if (a.rare) this.drops.push({ res: "crystal", x: a.x, y: a.y, vx: 20, vy: -70, n: 1, t: 0 });
      this.addScore(a.rare ? 40 : 10);
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
    this.sfx.chest();
    this.addScore(60);
    this.toast(`📦 ${ch.label} aberto!`);
  }

  /* ---------------- production ---------------- */
  updateStructures(dt: number) {
    const isDay = !this.isNight();
    for (const s of this.structures) {
      if (s.type === "spike_trap" && dt > 0) {
        s.prodT = Math.max(0, s.prodT - dt);
        if (s.prodT <= 0) {
          let triggered = false;
          const damage = DEFENSE_TIERS[defenseTier(s.tier) - 1].damage;
          for (const m of this.monsters) {
            if (m.hp <= 0 || m.defeated || dist2(m.x, m.y, s.x, s.y) >= (30 + m.r * 0.5) ** 2) continue;
            triggered = true;
            m.hp -= damage; m.flash = 0.12; m.state = "hurt"; m.t = 0.12;
            this.floaters.push({ x: m.x, y: m.y - 18, t: 0, text: `${damage}`, c: "#ffeaa0" });
            if (m.hp <= 0) this.killMonster(m);
          }
          if (triggered) {
            s.prodT = TRAP_REARM;
            this.spawnParticles(s.x, s.y, "#d7d8df", 5, 80);
            this.sfx.hit();
          }
        }
      }
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
        const distance = dist2(s.x, s.y, this.px, this.py);
        // Warmth heals around the fire, but its center burns. Contact is
        // deliberately walkable, and has no knockback so it can be crossed.
        if (distance < 20 * 20) {
          if (this.fireContactT <= 0 && this.invulnT <= 0) {
            this.fireContactT = 1;
            this.damagePlayer(5, s.x, s.y, 0);
          }
        } else if (distance < 110 * 110 && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + 2.2 * dt);
        }
        // Emit in simulation time, not during drawing: high-refresh displays
        // must not create proportionally more particles (or emit while paused).
        const visible = s.x >= this.camX - 100 && s.x <= this.camX + this.viewW + 100 &&
          s.y >= this.camY - 100 && s.y <= this.camY + this.viewH + 100;
        if (visible && this.particles.length < this.particleCap && Math.random() < dt * 7.8) {
          this.particles.push({ x: s.x + (Math.random() - 0.5) * 10, y: s.y - 22, vx: (Math.random() - 0.5) * 20, vy: -55, t: 0, max: 0.8, c: Math.random() < 0.5 ? "#ffb347" : "#ff7a2a", s: 3, grav: -50 });
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
        if (d.res === "crystal") this.crystalDiscovered = true;
        this.addScore(1);
        if (d.res === "wood" || d.res === "stone") this.gatheredWoodStone += d.n;
        if (d.res === "iron") this.questP[3] = Math.min(QUESTS[3].target, this.questP[3] + d.n);
        this.spawnParticles(this.px, this.py - 8, "#fff7c0", 4, 80);
        this.sfx.pickup(d.res);
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
    for (let i = this.magicEffects.length - 1; i >= 0; i--) {
      this.magicEffects[i].remaining -= dt;
      if (this.magicEffects[i].remaining <= 0) this.magicEffects.splice(i, 1);
    }
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
    if (dist2(this.px, this.py, VILLAGE.x, VILLAGE.y) < VILLAGE_AREA_RADIUS ** 2 || this.hamlets.some((h) => dist2(this.px, this.py, h.x, h.y) < 250 ** 2)) return true;
    for (const s of this.structures) {
      if ((s.type === "campfire" || s.type === "forge" || s.type === "tower") && dist2(s.x, s.y, this.px, this.py) < 170 * 170) return true;
    }
    return false;
  }

  /* ---------------- zone detection ---------------- */
  zoneName(): string {
    if (dist2(this.px, this.py, VILLAGE.x, VILLAGE.y) < VILLAGE_AREA_RADIUS ** 2) { this.visited.add("vilarejo"); return "Vilarejo de Porto Cinza"; }
    const hamlet = this.hamlets.find((h) => dist2(this.px, this.py, h.x, h.y) < 300 ** 2);
    if (hamlet) return hamlet.name;
    if (dist2(this.px, this.py, BASE.x, BASE.y) < this.territoryRadius() ** 2) return this.territoryLevel > 1 ? `Território do Reino · ${this.territoryLevel}` : "Clareira da Base 🏕️";
    const site = SITES.find((entry) => dist2(this.px,this.py,entry.x,entry.y) < entry.radius ** 2);
    if (site) return site.name;
    const t = this.tileAt(this.px, this.py);
    if (t === T_SNOW || t === T_ICE || t === T_SNOW_PATH) return "❄ Vale do Degelo";
    if (t === T_CAVE) { this.visited.add("caverna"); return "Caverna Uivante"; }
    if (t === T_MINERAL) return "Campos de Cristal";
    if (t === T_AUTUMN) return "Bosque de Outono";
    if (t === T_BLOSSOM) return "Bosque das Cerejeiras";
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
    const limiter = new FrameLimiter(this.lastT, this.settings.fpsCap);
    const loop = (t: number) => {
      if (this.destroyed) return;
      this.rafId = requestAnimationFrame(loop);
      if (!limiter.shouldRender(t, this.settings.fpsCap)) return;
      const elapsed = Math.max(0, (t - this.lastT) / 1000);
      this.lastT = t;
      const dt = Math.min(elapsed, 0.1);
      // Report actual wall-clock FPS even after a background-tab pause.
      this.fpsAcc += elapsed;
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
    const canHearWorld = this.state === "playing" && !this.softPause;
    if (!canHearWorld && !this.ambienceSilenced) {
      this.sfx.silenceAmbience(); this.ambienceSilenced = true;
    } else if (canHearWorld && this.ambienceSilenced) {
      this.windCheckT = 0; this.ambienceSilenced = false;
    }
    // The reference room covers the world. In single-player it is paused, so
    // avoid rendering the hidden canvas while visiting the preview.
    if (this.activePanel === "reference" && this.softPause) return;
    const pad = this.pollGamepad();
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.12; }

    if (this.state === "cutscene") {
      this.cutT += dt;
      if (this.cutPhase === 0 && this.cutT > 4.2) this.cutPhase = 1;
      else if (this.cutPhase === 1 && this.cutT > 7.2) { this.cutPhase = 2; this.flashWhite = 1; this.shake = 20; this.sfx.noise(0.5, 0.8); }
      else if (this.cutPhase === 2 && this.cutT > 8.6) { this.cutPhase = 3; this.dialogueIdx = 0; }
      this.flashWhite = Math.max(0, this.flashWhite - dt * 1.2);
      this.shake = Math.max(0, this.shake - dt * 30);
      this.renderCutscene(dt);
      return;
    }

    if (this.state === "playing" && !this.softPause) {
      if (this.wakeT > 0) this.wakeT = Math.max(0, this.wakeT - dt);
      else this.update(dt, pad);
      this.recoveryNoticeT = Math.max(0, this.recoveryNoticeT - dt);
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
    else if (this.state === "victory") want = "day";
    else if (this.state === "playing" || this.state === "paused") {
      want = this.isNight() ? (this.underAttackNow() ? "siege" : "night") : "day";
    } else want = "night";
    if (this.music.current !== want) this.music.play(want);
  }

  /** Sample nearby ambience at most once per second, never per sprite/frame. */
  updateAmbience() {
    if (this.settings.windSounds) this.sfx.wind();
    else this.sfx.setAmbient("wind", 0);
    if (this.settings.creatureSounds) {
      if (!this.isNight()) this.sfx.bird();
      let nearest: Animal | null = null, best = 320 * 320;
      for (const animal of this.animals) {
        const d = dist2(animal.x, animal.y, this.px, this.py);
        if (d < best) { best = d; nearest = animal; }
      }
      if (nearest) this.sfx.animal(nearest.kind, 1 - Math.sqrt(best) / 320, (nearest.x - this.px) / 320);
    }
    if (this.settings.ambientSounds) {
      const tx = Math.floor(this.px / TILE), ty = Math.floor(this.py / TILE);
      let sea = 192 * 192, stream = 192 * 192;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = tx + dx, y = ty + dy, index = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || this.tiles[index] !== T_WATER) continue;
        const d = dist2((x + 0.5) * TILE, (y + 0.5) * TILE, this.px, this.py);
        if (this.oceanTiles[index]) sea = Math.min(sea, d);
        else stream = Math.min(stream, d);
      }
      // Original ocean and subsequently carved streams use separate distance
      // fields, so both can blend naturally where a river meets the coast.
      this.sfx.water(1 - Math.sqrt(sea) / 192, "sea");
      this.sfx.water(1 - Math.sqrt(stream) / 192, "water");
      let fire = 220 * 220;
      for (const structure of this.structures) if (structure.type === "campfire") {
        fire = Math.min(fire, dist2(structure.x, structure.y, this.px, this.py));
      }
      this.sfx.fire(1 - Math.sqrt(fire) / 220);
    } else {
      this.sfx.setAmbient("sea", 0); this.sfx.setAmbient("water", 0); this.sfx.setAmbient("fire", 0);
    }
  }

  update(dt: number, pad: { mx: number; my: number; run?: boolean }) {
    this.windCheckT -= dt;
    if (this.windCheckT <= 0) { this.windCheckT = 1; this.updateAmbience(); }
    // --- time ---
    const prevNight = this.isNight();
    this.time += dt;
    const newDay = Math.floor(this.time / CYCLE) + 1;
    if (newDay > this.day) {
      this.day = newDay;
      this.raidPeak = 0;
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
    const jumping = this.rollT > 0;
    this.moving = ml > 0.1 && !jumping;
    const wantRun = this.keys.has("shift") || !!pad.run || this.touchBtn.run;
    this.running_ = wantRun && this.moving && this.stamina > 2;

    const baseSpeed = 196;
    const speed = this.running_ ? baseSpeed * 1.42 : baseSpeed;
    if (jumping) {
      this.rollT = this.rollT <= dt + 1e-9 ? 0 : this.rollT - dt;
      this.pvx = 0; this.pvy = 0;
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

    // Only the narrow trunk (not the canopy) is solid. Resolve each axis
    // independently for smooth sliding, and let old saves escape an overlap.
    const nearby = this.nearbyNodes(this.px, this.py);
    const tryMove = (nx: number, ny: number) => {
      if (this.tileAt(nx, ny) === T_WATER) return false;
      if (this.referenceStructureAt(nx, ny) && !this.referenceStructureAt(this.px, this.py)) return false;
      if (this.baseChestContains(nx, ny) && !this.baseChestContains(this.px, this.py)) return false;
      for (const st of this.structures) {
        if ((st.type === "wall" || st.type === "barricade" || st.type === "house" || st.type === "tower" || st.type === "forge") && this.placedStructureContains(st, nx, ny) && !this.placedStructureContains(st, this.px, this.py)) return false;
      }
      const dx = nx - this.px, dy = ny - this.py, step2 = dx * dx + dy * dy;
      for (const node of nearby) {
        if (node.hp <= 0 || node.type === "bush" || node.type === "berry") continue;
        const radius = node.type === "tree" || node.type === "pine" ? 10 : 14;
        const previous = dist2(this.px, this.py, node.x, node.y);
        const next = dist2(nx, ny, node.x, node.y);
        if (previous < radius * radius) {
          if (next + 0.001 < previous) return false;
          continue;
        }
        // Test the entire step rather than just its endpoint: fast running or
        // a long frame cannot tunnel through the small collision circle.
        const along = step2 ? clamp(((node.x - this.px) * dx + (node.y - this.py) * dy) / step2, 0, 1) : 0;
        if (dist2(this.px + dx * along, this.py + dy * along, node.x, node.y) < radius * radius) return false;
      }
      return true;
    };
    const oldX = this.px, oldY = this.py;
    const nx = this.px + this.pvx * dt;
    const ny = this.py + this.pvy * dt;
    if (tryMove(nx, this.py)) this.px = nx; else this.pvx = 0;
    if (tryMove(this.px, ny)) this.py = ny; else this.pvy = 0;
    this.px = clamp(this.px, TILE, WPX - TILE);
    this.py = clamp(this.py, TILE, HPX - TILE);
    // Steps follow actual movement (not held input against a wall or a jump).
    if (this.moving && !jumping && dist2(oldX, oldY, this.px, this.py) > 0.01) {
      this.footstepT -= dt;
      if (this.footstepT <= 0) {
        const tile = this.tileAt(this.px, this.py);
        const surface = tile === T_BRIDGE ? "bridge" : tile === T_SNOW || tile === T_SNOW_PATH || tile === T_ICE ? "snow"
          : tile === T_ROCK || tile === T_CAVE || tile === T_RUIN || tile === T_MINERAL ? "rock"
            : tile === T_SAND || tile === T_PATH ? "dirt" : "grass";
        this.sfx.footstep(surface, this.running_);
        this.footstepT = this.running_ ? 0.27 : 0.38;
      }
    } else this.footstepT = 0;

    // timers
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.fireContactT = Math.max(0, this.fireContactT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // Update only recently hit nodes, not every tree on the island.
    for (const n of this.shakingNodes) {
      n.wob += dt * 2.5;
      if (n.wob >= 1) { n.wob = 0; this.shakingNodes.delete(n); }
    }

    // Only depleted nodes need a respawn timer; there can be thousands of
    // intact trees, so do not iterate the whole island every frame.
    for (const n of this.depletedNodes) {
      n.respawn -= dt;
      if (n.respawn <= 0) {
        if (this.structures.some((st) => {
          if (st.type === "training") return Math.abs(st.x - n.x) < 110 && Math.abs(st.y - n.y) < 90;
          const tree = n.type === "tree" || n.type === "pine";
          const radius = tree && (st.type === "wall" || st.type === "gate") ? 60 : 38;
          return dist2(st.x, st.y, n.x, n.y) < radius * radius;
        })) n.respawn = 30;
        else { n.hp = n.maxHp; n.stumpHp = 0; n.respawn = 0; this.depletedNodes.delete(n); }
      }
    }

    // touch attack hold -> repeated
    this.updateSpawns(dt);
    this.updateMonsters(dt);
    this.updateRescues();
    this.updateAllies(dt);
    this.updateSpecialists(dt);
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
    for (const rescue of this.rescues) {
      if (this.specialists[rescue.id].hired || dist2(rescue.x, rescue.y, this.px, this.py) >= 80 ** 2) continue;
      const key = this.settings.controls === "touch" ? "Usar" : this.settings.controls === "gamepad" ? "X" : "E";
      this.interactHint = rescue.phase === "fighting" ? "Resgate: derrote as criaturas" : this.specialists[rescue.id].rescued ? `${key}: Convidar ${SPECIALISTS[rescue.id].name}` : "Sobreviventes precisam de ajuda";
      break;
    }
    if (!this.interactHint && this.settings.craftPix) {
      for (const prop of this.worldProps) {
        if (!prop.sprite.startsWith("reference_") || dist2(prop.x, prop.y, this.px, this.py) >= 86 * 86) continue;
        const scene = prop.sprite.slice("reference_".length) as ReferenceScene;
        if (hasReferenceObject(scene) && hasReferenceScene(scene)) {
          const key = this.settings.controls === "touch" ? "Usar" : this.settings.controls === "gamepad" ? "X" : "E";
          this.interactHint = `${key}: Entrar — ${REFERENCE_LABELS[scene]}`; break;
        }
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
    if (dt <= 0) return;
    for (const v of this.villagers) {
      if (v.figure !== undefined) { v.vx = 0; v.vy = 0; continue; }
      if ((v.stopT ?? 0) > 0) { v.stopT = Math.max(0, (v.stopT ?? 0) - dt); v.vx = 0; v.vy = 0; continue; }
      v.t -= dt;
      if (v.goalX === undefined || v.goalY === undefined || v.t <= 0) {
        // Stops near the square, market and path give each resident a reason
        // to walk somewhere instead of picking an arbitrary velocity forever.
        const hamlet = v.hamletId ? this.hamlets.find((h) => h.id === v.hamletId) : null;
        const destinations = hamlet ? [[-105, 45], [-80, 145], [0, 160], [100, 110], [120, 35], [10, 65]] : [[-180, -130], [-160, 150], [10, 190], [150, 135], [255, 110], [25, -145]];
        v.route = ((v.route ?? (Number(v.look.slice(1)) || 0)) + 1) % destinations.length;
        const [dx, dy] = destinations[v.route];
        v.goalX = (hamlet?.x ?? VILLAGE.x) + dx; v.goalY = (hamlet?.y ?? VILLAGE.y) + dy; v.t = 16; v.blockedT = 0;
      }
      const goalDistance = Math.hypot(v.goalX - v.x, v.goalY - v.y);
      if (goalDistance < 14) { v.goalX = undefined; v.goalY = undefined; v.stopT = 1.5 + (v.route ?? 0) * 0.3; v.vx = 0; v.vy = 0; continue; }
      const angle = Math.atan2(v.goalY - v.y, v.goalX - v.x);
      v.vx = Math.cos(angle) * 32; v.vy = Math.sin(angle) * 32;
      const oldX = v.x, oldY = v.y;
      const valid = (x: number, y: number) => {
        const home = v.hamletId ? this.hamlets.find((h) => h.id === v.hamletId) : null;
        if (dist2(x, y, home?.x ?? VILLAGE.x, home?.y ?? VILLAGE.y) >= (home ? 260 ** 2 : VILLAGE.r * VILLAGE.r * 0.6) || this.tileAt(x, y) === T_WATER) return false;
        if (this.referenceStructureAt(x, y) && !this.referenceStructureAt(oldX, oldY)) return false;
        const movingInto = (ox: number, oy: number, radius: number) => {
          const next = dist2(x, y, ox, oy), previous = dist2(oldX, oldY, ox, oy);
          return next < radius * radius && next < previous;
        };
        if (movingInto(this.px, this.py, 27)) return false;
        if (this.villagers.some((other) => other !== v && movingInto(other.x, other.y, 30))) return false;
        if (this.chests.some((chest) => movingInto(chest.x, chest.y, 28))) return false;
        return !this.nearbyNodes(x, y).some((node) => node.hp > 0 && node.type !== "bush" && node.type !== "berry" && movingInto(node.x, node.y, node.type === "tree" || node.type === "pine" ? 13 : 18));
      };
      const nx = oldX + v.vx * dt, ny = oldY + v.vy * dt;
      if (valid(nx, ny)) { v.x = nx; v.y = ny; }
      else if (valid(nx, oldY)) { v.x = nx; v.vy = 0; }
      else if (valid(oldX, ny)) { v.y = ny; v.vx = 0; }
      else {
        // Try a small local detour before choosing a different destination.
        const side = (v.route ?? 0) % 2 ? 1 : -1;
        let moved = false;
        for (const turn of [side * 0.8, -side * 0.8, side * 1.35, -side * 1.35]) {
          const tx = oldX + Math.cos(angle + turn) * 32 * dt, ty = oldY + Math.sin(angle + turn) * 32 * dt;
          if (valid(tx, ty)) { v.x = tx; v.y = ty; moved = true; break; }
        }
        v.blockedT = (v.blockedT ?? 0) + dt;
        if (!moved || v.blockedT > 3) { v.goalX = undefined; v.goalY = undefined; v.stopT = 0.5; }
      }
      const dx = v.x - oldX, dy = v.y - oldY;
      if (Math.hypot(dx, dy) > 0.01) {
        v.dir = Math.atan2(dy, dx);
        // Animation advances with ground distance, not with wall-clock time.
        v.steps += Math.hypot(dx, dy) * 0.25;
      } else { v.vx = 0; v.vy = 0; }
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
        id: t, name: t === "wall" && this.wallPurchaseSize() === 1 ? "Cerca simples" : def.name, icon: def.icon,
        desc: t === "wall" && this.wallPurchaseSize() === 1 ? "Um trecho avulso para fechar a lacuna restante."
          : t === "spike_trap" ? `${def.desc} Nível ${this.defenseTier}: ${DEFENSE_TIERS[this.defenseTier - 1].damage} de dano a cada ${TRAP_REARM.toFixed(1).replace(".", ",")} s.`
          : t === "barricade" ? `${def.desc} Nível ${this.defenseTier}: ${this.structMaxHp("barricade")} de vida.` : def.desc, cost,
        affordable: this.canAfford(cost), locked: !!lock, lockReason: lock,
      };
    });
    const upgradeOptions: UpgradeOption[] = (["axe", "pick", "sword"] as ToolKey[]).map((t) => {
      const cost = this.upgradeCost(t, this.tools[t]);
      const lock = this.upgradeLock(t);
      return { tool: t, level: this.tools[t], nextLevel: this.tools[t] + 1, cost, affordable: this.canAfford(cost), locked: !!lock, lockReason: lock };
    });
    const territoryUpgrade = this.territoryUpgrade();
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
      specialists: this.specialistViews(),
      rianDuty: this.rianDuty,
      baseLevel: this.baseLevel(),
      buildOptions, upgradeOptions,
      raftReasons: this.raftBlockReasons(),
      canRespawn: true,
      recovery: this.deathReport && (this.pendingRespawn || this.recoveryNoticeT > 0)
        ? { waking: this.wakeT > 0, remaining: this.recoveryNoticeT, report: this.deathReport } : null,
      outcome: this.outcome,
      teamScore: this.teamScore,
      mpCount: this.remotes.length,
      zone: this.zoneName(),
      fps: this.fps,
      seenCreatures: [...this.seenCreatures], creatureKills: { ...this.creatureKills },
      discoveredSites: [...this.discoveredSites], claimedSites: [...this.claimedSites],
      equipment: { ...this.equipment }, heldTool: this.heldTool, combatWeapon: this.combatWeapon, renderScale: this.dpr,
      fenceStyle: this.fenceStyle,
      territory: { level: this.territoryLevel, maxLevel: TERRITORIES.length, radius: this.territoryRadius(), ...territoryUpgrade, locked: !!territoryUpgrade.reason },
      fenceRing: this.fenceRing,
      fencePieces: this.wallPurchaseSize(),
      defenseTier: this.defenseTier,
      defenseTiers: DEFENSE_TIERS.map((def) => {
        const reason = this.defenseTierReason(def.tier);
        return { tier: def.tier, locked: !!reason, reason, spikeDamage: def.damage, barricadeHp: this.structMaxHp("barricade", this.fenceStyle, def.tier) };
      }),
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
        ? ["Joystick mover", "⚔️ atacar", "Pular", "✋ interagir", "🗺️ mapa"]
        : this.settings.controls === "gamepad"
          ? ["Analógico mover", "A atacar", "B pular", "X interagir", "Y construir", "LB/RB arma", "Start pausa"]
          : ["WASD mover", "J atacar", "E interagir", "B construir", "M mapa", "1/2/3 arma", "Espaço pular", "Shift correr", "F comer", "ESC pausa"],
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
    drawWaterAnim(c, this.tiles, W, H, TILE, x0, y0, x1, y1, ox, oy, tnow, this.settings.craftPix);
    if (this.settings.craftPix) this.terrain?.drawBridges(c, this.camX, this.camY, this.viewW, this.viewH, ox, oy);

    // base clearing — stone posts so the camp is visible from far
    c.strokeStyle = "rgba(226,194,122,0.55)";
    c.lineWidth = 2; c.setLineDash([10, 8]);
    c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, this.fenceSpec(this.territoryLevel).fenceRadius, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(214,196,120,0.14)";
    c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, BASE.r * 0.5, 0, Math.PI * 2); c.fill();

    for (const arena of this.structures) if (arena.type === "training" &&
        Math.abs(arena.x - (this.camX + this.viewW / 2)) < this.viewW / 2 + 150 && Math.abs(arena.y - (this.camY + this.viewH / 2)) < this.viewH / 2 + 150) {
      this.drawTrainingFloor(arena.x + ox, arena.y + oy);
    }

    // plane wreck at crash site
    this.drawWreck(CRASH.x + ox, CRASH.y + oy);

    // collect drawables sorted by y
    interface DrawItem { y: number; fn: () => void; }
    const items: DrawItem[] = [];
    // The rails are actual upright structures, not a shadow under every
    // character. Sort them by their ground anchors along with all entities.
    this.drawFenceConnections(ox, oy, (y, fn) => items.push({ y, fn }));
    const camL = this.camX - 80, camR = this.camX + this.viewW + 80, camT = this.camY - 230, camB = this.camY + this.viewH + 80;
    const inView = (x: number, y: number) => x > camL && x < camR && y > camT && y < camB;
    // A tall roof can remain visible even when its anchor is below the screen.
    const inViewBuilding = (x: number, y: number) => x > camL - 150 && x < camR + 150 && y > camT && y < camB + 470;

    for (let by = Math.floor(camT / 128); by <= Math.floor(camB / 128); by++) {
      for (let bx = Math.floor(camL / 128); bx <= Math.floor(camR / 128); bx++) {
        const bucket = this.nodeBuckets.get(bx + by * 64);
        if (!bucket) continue;
        for (const n of bucket) {
          if (!inView(n.x, n.y) || (n.hp <= 0 && !(n.stumpHp && n.stumpHp > 0))) continue;
          items.push({ y: n.y, fn: () => this.drawNode(n, ox, oy, tnow) });
        }
      }
    }
    for (const s of this.structures) {
      const tall = s.type === "house" || s.type === "forge" || s.type === "tower" || s.type === "wall" || s.type === "gate" || s.type === "barricade";
      if (!(tall ? inViewBuilding(s.x, s.y) : inView(s.x, s.y))) continue;
      items.push({ y: s.type === "training" ? s.y - 45 : s.y, fn: () => this.drawStructure(s, ox, oy, tnow) });
    }
    for (const m of this.monsters) {
      if (!inView(m.x, m.y)) continue;
      items.push({ y: m.y, fn: () => this.drawMonster(m, ox, oy, tnow) });
    }
    for (const v of this.villagers) {
      if (!inView(v.x, v.y)) continue;
      items.push({ y: v.y, fn: () => this.drawVillager(v, ox, oy, tnow) });
    }
    for (const rescue of this.rescues) {
      if (this.specialists[rescue.id].hired || !inView(rescue.x, rescue.y)) continue;
      items.push({ y: rescue.y, fn: () => this.drawRescue(rescue, ox, oy, tnow) });
    }
    for (const al of this.allies) {
      if (al.downT > 0 || !inView(al.x, al.y)) continue;
      const walking = Math.hypot(al.vx, al.vy) > 20;
      items.push({ y: al.y, fn: () => {
        const pace = Math.hypot(al.vx, al.vy);
        if (al.id === "archer") {
          const x = al.x + ox, y = al.y + oy;
          if (this.settings.craftPix && hasReferenceArcher()) {
            const direction = viewFromAngle(al.dir);
            const action = al.atkCd > 0.8 ? "attack" : pace > 210 ? "run" : walking ? "walk" : "idle";
            this.drawShadow(x, y + 2, 13);
            c.save(); c.translate(Math.round(x), Math.round(y + 2));
            drawReferenceArcher(c, direction.view, direction.flip, action, tnow, clamp((1.2 - al.atkCd) / 0.4, 0, 1));
            c.restore();
          } else {
            // With no optional preview, keep an existing humanoid as fallback.
            this.drawHumanoid(x, y, "maya", al.dir, walking, tnow * (pace > 210 ? 13 : 9));
            this.drawArcherBow(x, y, al.dir);
          }
        } else if (al.id === "mage") {
          const x = al.x + ox, y = al.y + oy, direction = viewFromAngle(al.dir);
          this.drawShadow(x, y + 2, 13);
          c.save(); c.translate(Math.round(x), Math.round(y + 2));
          const drawn = this.settings.craftPix && drawReferenceResident(c, "mage-blue", direction.view, direction.flip, walking, tnow);
          c.restore();
          if (!drawn) this.drawHumanoid(x, y, "maya", al.dir, walking, tnow * 9);
        } else {
          const look = al.id === "guard" ? "player" : al.id === "miner" ? "bren" : al.id;
          this.drawHumanoid(al.x + ox, al.y + oy, look, al.dir, walking, tnow * (pace > 210 ? 13 : 9), 1, al.atkCd > 0.48 ? "attack" : pace > 210 ? "run" : walking ? "walk" : undefined, al.atkCd > 0.48 ? undefined : al.id === "bren" || al.id === "miner" ? "pick" : al.id === "tito" ? "axe" : "sword", 2);
          if (al.atkCd > 0.48) this.drawAllyWeapon(al.x + ox, al.y + oy, al.dir - 0.7 + (0.7-al.atkCd)*8, al.id, walking ? tnow * 9 : 0);
        }
        const training = this.specialists[al.id as SpecialistId]?.duty === "train" && this.structures.some((s) => s.type === "training" && dist2(s.x, s.y, al.x, al.y) < 125 ** 2);
        if (!training) this.drawName(al.name, al.x + ox, al.y + oy - 99, "#ffe9b0");
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
      if (!inViewBuilding(prop.x, prop.y)) continue;
      if (prop.sprite.startsWith("reference_")) {
        const name = prop.sprite.slice("reference_".length) as ReferenceObject;
        if (this.settings.craftPix && hasReferenceObject(name)) items.push({ y: prop.y, fn: () => {
          drawReferenceObject(c, name, prop.x + ox, prop.y + oy, REFERENCE_SCALE[name]);
        } });
      } else items.push({ y: prop.y, fn: () => drawSprite(c, prop.sprite, prop.x + ox, prop.y + oy) });
    }
    const addHouse = (house: VillageHouse) => {
      const { x, y, index, scale } = house;
      if (!inViewBuilding(x, y)) return;
      items.push({ y, fn: () => {
        const behind = (px: number, py: number) => Math.abs(px - x) < 110 * scale && py < y && py > y - 250 * scale;
        const occluded = behind(this.px, this.py) || this.monsters.some((m) => m.hp > 0 && behind(m.x, m.y));
        const name = this.settings.craftPix ? houseArt(index) : null;
        if (occluded) { c.save(); c.globalAlpha *= 0.45; }
        if (name) drawReferenceObject(c, name, x + ox, y + oy, scale);
        else if (this.settings.craftPix && hasCraftVillage()) drawCraftVillageHouse(c, index, x + ox, y + oy, scale / 1.5);
        else drawSprite(c, "hut", x + ox, y + oy, { scale: scale === VILLAGE_HOUSE_SCALE ? 12 : 9 });
        if (occluded) c.restore();
      } });
    };
    for (const house of this.villageHouses) addHouse(house);
    for (const hamlet of this.hamlets) {
      for (const house of hamlet.houses) addHouse(house);
      if (inView(hamlet.x, hamlet.y + 10)) items.push({ y: hamlet.y + 10, fn: () => drawSign(c, hamlet.x + ox, hamlet.y + oy, "VILA", "#ffe0a3") });
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

    // The mage's projectile keeps its existing damage and collision; the
    // lightning is a short-lived impact animation, not an extra attack.
    for (const effect of this.magicEffects) {
      if (!inView(effect.x, effect.y)) continue;
      const frame = Math.min(5, Math.floor((1 - effect.remaining / 0.55) * 6));
      const x = effect.x + ox, y = effect.y + oy;
      c.save(); c.globalAlpha = Math.min(1, effect.remaining / 0.14);
      if (!this.settings.craftPix || !drawReferenceLightning(c, frame, x, y)) {
        c.strokeStyle = "#d3f6ff"; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x - 5, y - 115); c.lineTo(x + 5, y - 78); c.lineTo(x - 4, y - 58); c.lineTo(x + 8, y - 32); c.lineTo(x, y); c.stroke();
      }
      c.restore();
    }

    // projectiles
    for (const p of this.projectiles) {
      if (p.kind === "magic") {
        c.fillStyle = "rgba(137,211,255,0.35)"; c.beginPath(); c.arc(p.x + ox, p.y + oy, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#cceeff"; c.beginPath(); c.arc(p.x + ox, p.y + oy, 4, 0, Math.PI * 2); c.fill();
      } else if (p.kind === "ally" || p.kind === "player") {
        c.save(); c.translate(p.x + ox, p.y + oy); c.rotate(Math.atan2(p.vy, p.vx));
        c.fillStyle = "#6f482a"; c.fillRect(-13, -1, 22, 3);
        c.fillStyle = "#d9e6eb"; c.beginPath(); c.moveTo(12, 0); c.lineTo(6, -4); c.lineTo(6, 4); c.closePath(); c.fill();
        c.fillStyle = "#e6d8b5"; c.fillRect(-13, -4, 4, 3); c.fillRect(-13, 2, 4, 3);
        c.restore();
      } else {
        c.fillStyle = "#9be04a";
        c.beginPath(); c.arc(p.x + ox, p.y + oy, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(155,224,74,0.4)";
        c.beginPath(); c.arc(p.x + ox - p.vx * 0.02, p.y + oy - p.vy * 0.02, 4, 0, Math.PI * 2); c.fill();
      }
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
    if (this.settings.treeMotion && (climate === T_GRASS || climate === T_AUTUMN || climate === T_BLOSSOM || climate === T_DARK || climate === T_PATH)) {
      // Stateless, bounded particles: no allocations or spawn-rate dependence
      // on FPS. Quality Leve uses fewer leaves and the setting disables both.
      const count = this.settings.quality === "leve" ? 7 : 14;
      c.globalAlpha = 0.68;
      for (let i = 0; i < count; i++) {
        const x = Math.round(((i * 193 + tnow * (18 + i % 4 * 5)) % (this.viewW + 80)) - 40);
        const y = Math.round(((i * 157 + tnow * (8 + i % 3 * 3)) % (this.viewH + 60)) - 30 + Math.sin(tnow * 1.4 + i) * 9);
        c.fillStyle = i % 3 === 0 ? "#d3ae62" : i % 3 === 1 ? "#a4b95e" : "#d87e4a";
        c.fillRect(x + 1, y, 4, 2); c.fillRect(x, y + 2, 5, 2);
        c.fillStyle = "#6c7845"; c.fillRect(x + 2, y + 2, 3, 1);
      }
      c.globalAlpha = 1;
    }
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
      // The cached HUD only occupies the top and bottom of the screen. Avoid
      // blending its large transparent center onto the world every frame.
      const top = Math.min(120, this.viewH);
      const bottom = this.hudBottomStart();
      c.drawImage(this.hudCv, 0, 0, this.viewW, top, 0, 0, this.viewW, top);
      if (bottom < this.viewH) {
        const height = this.viewH - bottom;
        c.drawImage(this.hudCv, 0, bottom, this.viewW, height, 0, bottom, this.viewW, height);
      }
    } else this.renderHud();
    this.drawBasePointer();
    if (this.mapOpen) this.renderAtlas();
  }

  drawArcherBow(x: number, y: number, dir: number) {
    const c = this.ctx;
    c.save(); c.translate(x + Math.cos(dir) * 12, y - 24); c.rotate(dir);
    c.strokeStyle = "#4b2c1d"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-10, -14); c.quadraticCurveTo(12, 0, -10, 14); c.stroke();
    c.strokeStyle = "#e8d7a0"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-10, -14); c.lineTo(-10, 14); c.stroke();
    c.restore();
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
    for (const hamlet of this.hamlets) {
      if (Math.abs(hamlet.x + ox) < this.viewW + 250 && Math.abs(hamlet.y + oy) < this.viewH + 250) hole(hamlet.x + ox, hamlet.y + oy, 210, 0.75);
    }
    // Combine the moonlight tint with the light mask at 1/3 resolution.
    // This avoids a second full-screen translucent fill on every frame.
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = `rgba(40,50,120,${total * 0.18})`;
    lc.fillRect(0, 0, this.lightCv.width, this.lightCv.height);
    const c = this.ctx;
    c.imageSmoothingEnabled = this.settings.quality !== "leve";
    c.drawImage(this.lightCv, 0, 0, this.lightCv.width, this.lightCv.height, 0, 0, this.viewW, this.viewH);
    c.imageSmoothingEnabled = false;
  }

  drawShadow(x: number, y: number, r: number) {
    let shadow = shadowCache.get(r);
    if (!shadow) {
      shadow = document.createElement("canvas");
      shadow.width = Math.ceil(r * 2 + 2);
      shadow.height = Math.ceil(r * 0.8 + 2);
      const painter = shadow.getContext("2d");
      if (!painter) return;
      painter.fillStyle = "rgba(0,0,0,0.25)";
      painter.beginPath(); painter.ellipse(r + 1, r * 0.4 + 1, r, r * 0.4, 0, 0, Math.PI * 2); painter.fill();
      shadowCache.set(r, shadow);
    }
    this.ctx.drawImage(shadow, x - r - 1, y - r * 0.4 - 1);
  }

  drawNode(n: RNode, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = n.x + ox, y = n.y + oy;
    const wob = this.shakingNodes.has(n) ? Math.sin(n.wob * Math.PI * 6) * 3 * (1 - n.wob) : 0;
    const hpr = n.hp / n.maxHp;
    if (n.hp <= 0) { if (n.stumpHp && n.stumpHp > 0) drawSprite(c, "stump", x, y + 4); return; }
    const ground = this.tileAt(n.x, n.y), dark = ground === T_DARK;
    let tallDeposit = false;
    if (n.type === "tree" || n.type === "pine") {
      const name = n.skin ?? (n.type === "tree" ? (dark ? "tree_dark" : "tree") : dark ? "pine_dark" : "pine");
      this.drawShadow(x, y + 4, 23);
      const behind = (px: number, py: number) => Math.abs(px - n.x) < 54 && py < n.y + 4 && py > n.y - 135;
      // A hidden enemy can look stuck even when it is moving. Fade a canopy
      // for both the player and living monsters while they pass behind it.
      const occluded = behind(this.px, this.py) || this.monsters.some((m) => m.hp > 0 && behind(m.x, m.y));
      const options = { flip: (Math.floor(n.x) & 1) === 1, alpha: occluded ? 0.45 : 1 };
      const breeze = this.settings.treeMotion ? Math.sin(tnow * 0.9 + n.x * 0.01 + n.y * 0.005) * 0.035 : 0;
      const bend = breeze + wob * 0.012;
      // Only replace plants with a matching supplied design; preserve snowy,
      // dark, cherry and pine variants until their originals are available.
      const original = name === "tree" ? "tree" : name === "tree_fruit" ? "fruit" : name === "tree_palm" ? "palm" : null;
      const imported = this.settings.craftPix && original && drawCraftPlant(c, original, x, y + 4, bend, options.flip, options.alpha);
      if (!imported) {
        // The trunk stays planted; the few bend frames are cached once per tree.
        if (bend) drawSwaySprite(c, name, x, y + 4, bend, options);
        else drawSprite(c, name, x, y + 4, options);
      }
    } else {
      const isPlant = n.type === "bush" || n.type === "berry";
      const supported = isPlant && (!n.skin || n.skin === "snow_bush");
      const variant = n.skin === "snow_bush" ? 5 : n.type === "berry" ? 3 : [0, 1, 2, 4][Math.abs(Math.floor(n.x / 73) + Math.floor(n.y / 59)) % 4];
      let reference = supported && this.settings.craftPix && drawReferencePlant(c, variant, x + Math.round(wob), y + 4, n.type === "berry" ? 58 : 54);
      if (!isPlant && this.settings.craftPix) {
        const sample = Math.abs(Math.floor(n.x / 61) + Math.floor(n.y / 47));
        const snow = ground === T_SNOW || ground === T_ICE || ground === T_SNOW_PATH;
        const deposit = n.type === "rock"
          ? snow ? (sample % 2 ? 4 : 1) : dark ? 6 : ground === T_MINERAL ? (sample % 2 ? 2 : 3) : sample % 4
          : snow ? 3 : dark ? (n.type === "crystal" ? 8 : sample % 2 ? 1 : 4)
            : n.type === "crystal" ? (sample % 2 ? 8 : 9) : sample % 10;
        tallDeposit = drawReferenceDeposit(c, n.type === "rock" ? "rock" : "mineral", deposit, x + Math.round(wob), y + 4, n.type === "rock" ? 68 : 74);
        reference = tallDeposit;
      }
      if (!reference) {
        this.drawShadow(x, y + 3, 14);
        const imported = n.type === "bush" && !n.skin && this.settings.craftPix && drawCraftPlant(c, "bush", x + Math.round(wob), y + 4);
        if (!imported) drawSprite(c, n.skin ?? n.type, x, y + 4, { dx: Math.round(wob) });
      }
    }
    if (hpr < 1) {
      const top = n.type === "tree" || n.type === "pine" || tallDeposit ? y - 86 : y - 42;
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 16, top, 32, 5);
      c.fillStyle = "#8ae06a"; c.fillRect(x - 16, top, 32 * hpr, 5);
    }
  }

  drawPalisadePost(x: number, y: number, rotation: number, alpha = 1, tint?: string) {
    const c = this.ctx;
    c.save(); c.translate(x,y); c.globalAlpha *= alpha;
    // The footprint follows the ring; the sharpened log remains upright in the
    // top-down projection, so it never looks like a spike lying on the floor.
    c.save();c.rotate(rotation);c.fillStyle=tint??"#3d291d";c.fillRect(-11,1,22,5);c.fillStyle=tint??"#8a5b38";c.fillRect(-9,1,18,2);c.restore();
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
    // Position stays anchored to the fence; no artificial ground oval.
    c.fillStyle=tint??"#5c3b29";c.fillRect(-7,-23,14,28);c.fillStyle=tint??"#9a6a48";c.fillRect(-5,-22,10,26);c.fillStyle=tint??"#c89668";c.fillRect(-3,-21,3,24);
    c.fillStyle=tint??"#e0b681";c.fillRect(-2,-20,1,16);c.fillStyle="#4d3326";c.fillRect(-7,-8,14,3);c.fillRect(-7,1,14,3);c.fillStyle="#a87852";c.fillRect(-6,-8,12,1);c.fillRect(-6,1,12,1);
    c.fillStyle="#38261d";c.fillRect(-1,-15,2,2);c.restore();
  }
  drawStonePost(x:number,y:number,rotation:number,alpha=1,tint?:string){
    const c=this.ctx;c.save();c.translate(x,y);c.globalAlpha*=alpha;
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
    const c = this.ctx;
    if (style === "stone" && this.settings.craftPix && hasReferenceObject("castle_wall")) {
      const sideView = Math.abs(Math.sin(rotation)) > Math.abs(Math.cos(rotation));
      c.save(); c.translate(x, y); c.scale(sideView ? 0.68 : 1, 1.55); c.globalAlpha *= alpha;
      drawReferenceObject(c, "castle_wall", 0, 0, 1); c.restore(); return;
    }
    // Raise the upright elements rather than rotating the sprite onto the
    // ground: wood starts as a fence and masonry becomes a taller wall.
    c.save(); c.translate(x, y); c.scale(1, style === "rustic" ? 1.8 : style === "stone" ? 2.7 : 2.0);
    if(style==="rustic")this.drawRusticPost(0,0,rotation,alpha,tint);
    else if(style==="stone")this.drawStonePost(0,0,rotation,alpha,tint);
    else if(style==="hedge")this.drawHedgePost(0,0,rotation,alpha,tint);
    else this.drawPalisadePost(0,0,rotation,alpha,tint);
    c.restore();
  }
  drawStyledGate(s:Structure,x:number,y:number,alpha=1,tint?:string){
    if (s.fenceStyle === "stone" && this.settings.craftPix && hasReferenceObject("castle_gate")) {
      const c = this.ctx, sideView = Math.abs(Math.sin(s.rotation)) > Math.abs(Math.cos(s.rotation));
      c.save(); c.translate(x, y); c.scale(sideView ? 0.68 : 1, 1.4); c.globalAlpha *= alpha;
      drawReferenceObject(c, "castle_gate", 0, 0, 1);
      if (!s.open) {
        if (!drawReferenceObject(c, "castle_grate", 0, -2, 1)) {
          // If only the arch was imported, the fallback grate keeps the closed
          // state visible instead of silently looking like an open passage.
          c.fillStyle = "#263646"; for (let i = -12; i <= 12; i += 6) c.fillRect(i, -25, 3, 23);
          for (let i = -22; i <= -4; i += 6) c.fillRect(-15, i, 30, 2);
        }
      }
      c.restore(); return;
    }
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(1, s.fenceStyle === "stone" ? 2.2 : 1.9);
    if(s.fenceStyle==="stone"){
      this.drawPalisadeGate(s,0,0,alpha,tint??"#7d8990");
      this.drawStonePost(-27,0,s.rotation,alpha,tint);this.drawStonePost(27,0,s.rotation,alpha,tint);
    }else if(s.fenceStyle==="hedge"){
      this.drawPalisadeGate(s,0,0,alpha,tint??"#6b7442");
      this.drawHedgePost(-27,0,s.rotation,alpha,tint);this.drawHedgePost(27,0,s.rotation,alpha,tint);
    }else this.drawPalisadeGate(s,0,0,alpha,tint??(s.fenceStyle==="rustic"?"#aa7952":undefined));
    c.restore();
  }
  drawTrainingFloor(x: number, y: number) {
    const c = this.ctx;
    if (!this.settings.craftPix || !drawReferenceObject(c, "training_mat", x, y + 84, 1)) {
      c.fillStyle = "#b99c68"; c.fillRect(x - 100, y - 80, 200, 160);
      c.strokeStyle = "#876b45"; c.lineWidth = 2;
      for (let row = -72; row < 80; row += 8) { c.beginPath(); c.moveTo(x - 96, y + row); c.lineTo(x + 96, y + row); c.stroke(); }
    }
    if (!this.settings.craftPix || !drawReferenceObject(c, "training_fence", x, y + 90, 1)) {
      c.strokeStyle = "#6d4d34"; c.lineWidth = 5; c.strokeRect(x - 100, y - 80, 200, 160);
      for (const px of [-100, 0, 100]) for (const py of [-80, 80]) {
        c.fillStyle = "#614132"; c.fillRect(x + px - 4, y + py - 8, 8, 16);
        c.fillStyle = "#ab7953"; c.fillRect(x + px - 2, y + py - 6, 4, 9);
      }
    }
  }
  drawTrainingProps(x: number, y: number) {
    const c = this.ctx;
    if (!this.settings.craftPix || !drawReferenceObject(c, "training_canopy", x - 36, y - 32, 1)) {
      c.fillStyle = "#5a4030"; c.fillRect(x - 112, y - 124, 5, 92); c.fillRect(x + 40, y - 124, 5, 92);
      c.fillStyle = "#303a45"; c.fillRect(x - 116, y - 132, 164, 32);
      for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#dadfe4" : "#303a45"; c.fillRect(x - 112 + i * 31, y - 130, 28, 26); }
      for (const dx of [-70, -10]) { c.fillStyle = "#e6dccb"; c.beginPath(); c.arc(x + dx, y - 57, 13, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#bb5546"; c.lineWidth = 3; c.stroke(); }
    }
    for (const dx of [42, 82]) {
      if (this.settings.craftPix && drawReferenceObject(c, "training_dummy", x + dx, y + 6, 1)) continue;
      c.fillStyle = "#65492e"; c.fillRect(x + dx - 3, y - 32, 6, 38); c.fillRect(x + dx - 12, y - 20, 24, 5);
      c.fillStyle = "#c5a776"; c.beginPath(); c.ellipse(x + dx, y - 36, 9, 12, 0, 0, Math.PI * 2); c.fill();
    }
    if (!this.settings.craftPix || !drawReferenceObject(c, "training_rack", x - 65, y + 66, 0.8)) {
      c.fillStyle = "#754b2f"; c.fillRect(x - 95, y + 51, 60, 7); c.fillRect(x - 95, y + 40, 5, 25); c.fillRect(x - 40, y + 40, 5, 25);
    }
  }
  drawStructure(s: Structure, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = s.x + ox, y = s.y + oy;
    if (s.type === "training") {
      this.drawTrainingProps(x, y);
      if (s.hp < s.maxHp) this.drawStructureHealth(s, x, y - 150);
      return;
    }
    if (s.type === "spike_trap") {
      const elapsed = TRAP_REARM - s.prodT;
      const frame = s.prodT > 0 && elapsed < 0.65 ? Math.min(5, Math.floor(elapsed * 9)) : 1;
      if (!this.settings.craftPix || !drawReferenceSpikes(c, defenseTier(s.tier), frame, x, y + 6)) drawSprite(c, "spike_trap", x, y + 6);
      if (s.hp < s.maxHp) this.drawStructureHealth(s, x, y - 55);
      return;
    }
    if (s.type === "barricade") {
      const art = BARRICADE_ART[defenseTier(s.tier) - 1];
      if (!this.settings.craftPix || !drawReferenceObject(c, art, x, y + 6, REFERENCE_SCALE[art])) drawSprite(c, "barricade", x, y + 6);
      if (s.hp < s.maxHp) this.drawStructureHealth(s, x, y - 100);
      return;
    }
    if(s.type==="wall") {
      if (this.dpr !== 1 || (s.fenceStyle === "stone" && this.settings.craftPix && hasReferenceObject("castle_wall"))) this.drawFencePost(s.fenceStyle, x, y + 5, s.rotation);
      else {
        const key = `${s.fenceStyle}:${s.x}:${s.y}:${s.rotation}`;
        let cached = this.fencePosts.get(key);
        if (!cached) {
          const left = Math.floor(s.x - 40), top = Math.floor(s.y - 100);
          const canvas = document.createElement("canvas");
          // Rotated foot braces can extend below the taller post. Leave enough
          // transparent margin so cached and direct renders match on diagonals.
          canvas.width = Math.ceil(s.x + 40) - left; canvas.height = Math.ceil(s.y + 48) - top;
          const painter = canvas.getContext("2d");
          if (painter) {
            this.ctx = painter;
            try { this.drawFencePost(s.fenceStyle, s.x - left, s.y + 5 - top, s.rotation); }
            finally { this.ctx = c; }
            cached = { canvas, left, top };
            if (this.fencePosts.size >= 128) {
              const oldest = this.fencePosts.keys().next().value;
              if (oldest !== undefined) this.fencePosts.delete(oldest);
            }
            this.fencePosts.set(key, cached);
          }
        }
        if (cached) c.drawImage(cached.canvas, cached.left + ox, cached.top + oy);
        else this.drawFencePost(s.fenceStyle, x, y + 5, s.rotation);
      }
      if(s.hp<s.maxHp) this.drawStructureHealth(s,x,y-(s.fenceStyle === "stone" ? 125 : 75));
      return;
    }
    if(s.type==="gate") {
      this.drawStyledGate(s,x,y+5);
      if(s.hp<s.maxHp) this.drawStructureHealth(s,x,y-110);
      return;
    }
    let name: string = s.type;
    if (s.type === "campfire") name = Math.floor(tnow * 8) % 2 ? "campfire1" : "campfire0";
    const sz = spriteSize(name);
    const referenceName = s.type === "tower" ? "castle_tower" : s.type === "house" ? placedHouseArt(s.x, s.y) : s.type === "forge" ? "forge" : null;
    const referenceBuilding = referenceName && this.settings.craftPix && hasReferenceObject(referenceName) ? referenceName : null;
    if (s.type === "campfire") {
      c.fillStyle = `rgba(255,150,60,${0.08 + Math.sin(tnow * 9) * 0.015})`;
      c.beginPath(); c.ellipse(x, y + 2, 38, 13, 0, 0, Math.PI * 2); c.fill();
    }
    c.save(); c.translate(x, y + 6); c.rotate(s.rotation);
    const craftTower = !referenceBuilding && s.type === "tower" && this.settings.craftPix && drawCraftTower(c, 0, 0);
    if (!craftTower && (!referenceBuilding || !drawReferenceObject(c, referenceBuilding, 0, 0, REFERENCE_SCALE[referenceBuilding]))) drawSprite(c, name, 0, 0);
    if (s.type === "farm" && this.settings.craftPix) drawCraftPlant(c, "crate", 52, 4);
    c.restore();
    if (s.type === "forge" && !referenceBuilding) {const g = Math.sin(tnow * 7) * 0.5 + 0.5;c.fillStyle = `rgba(255,120,40,${0.15 + g * 0.15})`;c.beginPath(); c.arc(x, y - 16, 30, 0, Math.PI * 2); c.fill();}
    if (s.type === "tower" && !referenceBuilding && !craftTower) {c.fillStyle = `rgba(255,220,120,${0.18 + Math.sin(tnow * 3) * 0.06})`;c.beginPath(); c.arc(x, y - 100, 26, 0, Math.PI * 2); c.fill();}
    const buildingHeight = referenceBuilding ? (s.type === "house" ? 250 : referenceBuilding === "forge" ? 210 : 196) * REFERENCE_SCALE[referenceBuilding] : sz.h;
    if(s.hp<s.maxHp)this.drawStructureHealth(s,x,y-buildingHeight-12);
  }
  drawStructureHealth(s:Structure,x:number,top:number){
    const c=this.ctx,hpr=clamp(s.hp/s.maxHp,0,1);c.fillStyle="rgba(0,0,0,.65)";c.fillRect(x-18,top,36,5);c.fillStyle=hpr>.5?"#8ae06a":hpr>.25?"#e0c14a":"#e04a4a";c.fillRect(x-18,top,36*hpr,5);
  }

  drawAnimal(a: Animal, ox: number, oy: number, tnow: number) {
    const x = a.x + ox, y = a.y + oy;
    const moving = Math.hypot(a.vx, a.vy) > 6;
    const hop = moving && a.kind === "rabbit" ? -Math.abs(Math.sin(tnow * 14)) * 6 : moving ? -Math.abs(Math.sin(tnow * 10)) * 2 : 0;
    this.drawShadow(x, y + 2, a.kind === "goat" ? 16 : 10);
    const c = this.ctx, motion = moving ? Math.sin(tnow * (a.kind === "rabbit" ? 14 : 10) + a.x * 0.01) : Math.sin(tnow * 1.6 + a.x * 0.02) * 0.3;
    c.save(); c.translate(x, y + 2); c.scale(1 + motion * 0.025, 1 - motion * 0.035);
    drawSprite(c, a.kind, 0, 0, { flip: a.dir < 0 ? a.kind !== "goat" : a.kind === "goat", dy: hop }); c.restore();
    const maxHp = (a.kind === "goat" ? 26 : a.kind === "goose" ? 14 : 10) * (a.rare ? 1.5 : 1);
    if (a.rare) this.drawName("RARO ✦", x, y - 44, "#ffe59b");
    if (a.hp < maxHp) {
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 10, y - 40, 20, 3);
      c.fillStyle = "#e04a4a"; c.fillRect(x - 10, y - 40, 20 * clamp(a.hp / maxHp, 0, 1), 3);
    }
  }

  drawChest(ch: Chest, ox: number, oy: number, tnow: number) {
    const c = this.ctx;
    const x = ch.x + ox, y = ch.y + oy;
    const baseChest = ch.label === "Kit do Rian";
    const referenceChest = baseChest && this.settings.craftPix && drawReferenceObject(c, "chest", x, y + 4, REFERENCE_SCALE.chest);
    // The reference includes only a closed lid. Keep that same detailed chest
    // after looting instead of replacing it with the old rectangular box.
    if (!referenceChest) drawSprite(c, ch.opened ? "chest_open" : "chest", x, y + 4, { scale: baseChest ? 4.2 : SCALE });
    if (referenceChest && ch.opened) {
      c.save(); c.font = "700 10px Nunito, sans-serif"; c.textAlign = "center";
      c.fillStyle = "rgba(14,12,20,.8)"; c.fillRect(x - 21, y - 90, 42, 14);
      c.fillStyle = "#f4dfa9"; c.fillText("VAZIO", x, y - 79); c.restore();
    }
    if (!ch.opened) {
      if (ch.rare) this.drawName("TESOURO ✦", x, y - 48, "#ffe59b");
      const g = 0.5 + Math.sin(tnow * 4) * 0.4;
      c.fillStyle = `rgba(255,226,138,${g * 0.55})`;
      c.beginPath(); c.arc(x, y - (referenceChest ? 76 : baseChest ? 50 : 36) - Math.sin(tnow * 3) * 3, 3, 0, Math.PI * 2); c.fill();
    }
  }

  drawWreck(x: number, y: number) {
    const c = this.ctx;
    if (x < -200 || x > this.viewW + 200 || y < -200 || y > this.viewH + 200) return;
    this.drawShadow(x, y + 12, 50);
    c.save();
    c.translate(x, y);
    c.rotate(-0.3);
    c.scale(0.75, 0.75);
    this.drawIntroPlane(0, 0, 0);
    c.fillStyle = "#454752"; c.fillRect(-14, -4, 24, 12); c.fillRect(-24, 4, 18, 5);
    c.fillStyle = "#8b715a"; c.fillRect(-8, 0, 6, 3); c.fillRect(5, 4, 5, 3);
    c.restore();
  }

  drawVillager(v: Villager, ox: number, oy: number, tnow: number) {
    const c = this.ctx, x = v.x + ox, y = v.y + oy;
    const walking = Math.hypot(v.vx, v.vy) > 1;
    const dir = v.dir ?? Math.PI / 2;
    const index = Math.max(0, Number(v.look.slice(1)) || 0);
    // A small contact shadow meets the feet, without casting shadows on buildings.
    this.drawShadow(x, y + 2, 10);
    if (v.figure !== undefined && this.settings.craftPix && drawReferenceFigure(c, v.figure, x, y + 2)) return;
    const facing = viewFromAngle(dir);
    c.save(); c.translate(Math.round(x), Math.round(y + 2));
    const imported = this.settings.craftPix && drawCraftVillager(c, facing.view, facing.flip, index, walking, v.steps ?? 0, tnow + index * 0.3);
    c.restore();
    if (!imported) drawCharacter(c, v.look, x, y + 2, dir, walking, v.steps ?? 0, { craftPix: false });
  }

  drawHumanoid(x: number, y: number, lookId: string, dir: number, walking: boolean, cycle: number, alpha = 1, action?: "walk" | "run" | "attack", carryTool?: ToolKey, toolLevel = 1, shadow = true) {
    if (shadow) this.drawShadow(x, y + 2, 13);
    drawCharacter(this.ctx, lookId, x, y + 2, dir, walking, cycle, {
      alpha, action, carryTool, toolLevel,
      craftPix: this.settings.craftPix, heroLevel: this.tools.sword,
      attackProgress: 1 - this.attackT / 0.22,
    });
  }

  drawRescue(rescue: RescueEncounter, ox: number, oy: number, tnow: number) {
    const c = this.ctx, x = rescue.x + ox, y = rescue.y + oy;
    const facing = viewFromAngle(Math.atan2(this.py - rescue.y, this.px - rescue.x));
    const drawReferencePerson = (look: "archer" | "archer-hood" | "mage-blue", dx: number, dy: number) => {
      this.drawShadow(x + dx, y + dy + 2, 12);
      c.save(); c.translate(Math.round(x + dx), Math.round(y + dy + 2));
      const ok = this.settings.craftPix && drawReferenceResident(c, look, facing.view, facing.flip, false, tnow);
      c.restore();
      if (!ok) this.drawHumanoid(x + dx, y + dy, "maya", 0, false, 0);
    };
    if (rescue.id === "archer") { drawReferencePerson("archer", -42, 0); drawReferencePerson("archer-hood", 42, 0); }
    else if (rescue.id === "mage") drawReferencePerson("mage-blue", 0, 0);
    else this.drawHumanoid(x, y, rescue.id === "guard" ? "player" : "bren", 0, false, 0, 1, undefined, rescue.id === "guard" ? "sword" : "pick", 1);
    this.drawName(this.specialists[rescue.id].rescued ? "A SALVO · CONVIDAR" : "PRECISA DE AJUDA", x, y - 105, this.specialists[rescue.id].rescued ? "#baffc3" : "#ffdf9b");
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
    if (this.wakeT > 0) {
      const rise = clamp((1.35 - this.wakeT) / 1.1, 0, 1);
      this.drawShadow(x, y + 2, 18);
      c.save(); c.translate(x, y - 4); c.rotate((1 - rise) * Math.PI / 2);
      drawCharacter(c, "player", 0, 0, Math.PI / 2, false, 0, { craftPix: this.settings.craftPix, heroLevel: this.tools.sword });
      c.fillStyle = "#9c3435"; c.fillRect(-5, -27, 7, 3);
      c.fillStyle = "#d77468"; c.fillRect(-4, -27, 4, 1);
      c.restore();
      this.drawName(this.opts.playerName, x, y - (rise > 0.6 ? 99 : 45), "#dff1ff");
      return;
    }
    const dodging = this.rollT > 0;
    const jump = dodgeJumpHeight(this.rollT);
    // Leave the contact shadow on the ground and move only the character.
    // No spin: a small lean and smooth arc read as a jump in every direction.
    const blink = !dodging && this.invulnT > 0 && Math.sin(tnow * 40) > 0;
    if (dodging) {
      this.drawShadow(x, y + 2, Math.round(13 - jump * 0.12));
      c.save(); c.translate(x, y - jump); c.rotate(Math.sin(Math.PI * (1 - this.rollT / 0.26)) * 0.09 * Math.cos(this.pdir)); c.translate(-x, -y);
    }
    const attacking = this.attackT > 0;
    const action = attacking ? "attack" : this.running_ && this.moving ? "run" : this.moving ? "walk" : undefined;
    const tool = attacking ? this.swingTool : this.heldTool;
    const level = this.tools[tool];
    const usingBow = attacking ? this.swingBow : tool === "sword" && this.combatWeapon === "bow";
    // The imported sword includes its own swing; the bow is drawn separately.
    this.drawHumanoid(x, y, "player", this.pdir, this.moving, this.walkCycle, blink ? 0.45 : 1, action, usingBow ? undefined : tool, level, !dodging);
    const originalSword = !usingBow && tool === "sword" && level <= 3 && this.settings.craftPix && hasCraftHero();
    const handX = x + Math.cos(this.pdir) * (attacking ? 19 : 13) + (Math.cos(this.pdir) >= 0 ? 4 : -4);
    const stride = this.moving ? Math.sin(this.walkCycle * 1.3) * (this.running_ ? 4 : 2) : 0;
    const handY = y - 24 + (attacking ? -3 : stride);
    if (usingBow) {
      c.save(); c.translate(handX, handY); c.rotate(this.pdir + Math.PI / 4);
      const reference = this.settings.craftPix && drawReferenceIcon(c, "bow", -20, -20, 40);
      c.restore();
      if (!reference) this.drawArcherBow(x, y, this.pdir);
    }
    if (attacking && !usingBow && !originalSword) {
      const prog = 1 - this.attackT / 0.22;
      const eased = 1 - Math.pow(1 - clamp(prog, 0, 1), 2);
      const a = this.pdir - 1.12 + eased * 2.24;
      drawToolSprite(c, tool, handX, handY, a, 2.05, blink ? 0.5 : 1, level);
      c.strokeStyle = level >= 4 ? "rgba(155,240,250,0.65)" : "rgba(255,245,198,0.46)";
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y - 22, 39, this.pdir - 1.12, this.pdir - 1.12 + eased * 2.24); c.stroke();
    }
    if (dodging) c.restore();
    this.drawName(this.opts.playerName, x, y - 99 - jump, "#dff1ff");
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
    const preview = this.settings.craftPix && hasReferenceCreature(m.skin);
    const imported = !preview && m.type === "orc" && this.settings.craftPix && hasCraftOrcs();
    const bob = imported ? 0 : floating ? Math.sin(phase * 0.38) * 5 - 7 : moving ? -Math.abs(Math.sin(phase)) * (m.type === "hulk" ? 2 : 4) : 0;
    const flip = Math.cos(m.dir) < 0;
    const sprite = m.skin;
    this.drawShadow(x, y + 4, m.r + 2);
    if (windup) {
      const pulse = 0.5 + 0.5 * Math.sin(tnow * 22);
      c.strokeStyle = `rgba(255,72,56,${0.32 + pulse * 0.48})`;
      c.lineWidth = m.type === "hulk" || m.type === "brute" ? 3 : 2;
      c.beginPath(); c.ellipse(x, y + 5, m.r + 18 + pulse * 5, (m.r + 18 + pulse * 5) * 0.34, 0, 0, Math.PI * 2); c.stroke();
    }
    c.save();
    c.translate(x, y + 4);
    c.scale(MONSTER_ART_SCALE, MONSTER_ART_SCALE);
    if (!imported) {
      if (windup) c.scale(1.18, 0.84);
      else if (m.state === "attack") c.scale(0.92, 1.15);
      else if (m.state === "hurt") c.rotate(Math.sin(phase) * 0.085);
      else if (moving && !floating) c.rotate(Math.sin(phase) * (m.type === "hulk" ? 0.025 : 0.045));
      if (preview) {
        c.save(); c.translate(0, bob); if (floating) c.globalAlpha *= 0.9;
        drawReferenceCreature(c, m.skin, flip);
        if (flash || windup) {
          c.globalAlpha *= flash ? 0.75 : 0.25 + Math.sin(tnow * 28) * 0.12;
          drawReferenceCreature(c, m.skin, flip, flash ? "white" : "red");
        }
        c.restore();
      } else {
        drawSprite(c, sprite, 0, 0, { flip, dy: bob, alpha: floating ? 0.9 : 1 });
        if (flash) drawSprite(c, sprite, 0, 0, { flip, dy: bob, tint: "#ffffff", alpha: 0.75 });
        else if (windup) drawSprite(c, sprite, 0, 0, { flip, dy: bob, tint: "#ff4040", alpha: 0.25 + Math.sin(tnow * 28) * 0.12 });
      }
    } else {
      const direction = viewFromAngle(m.dir);
      const action = m.state === "attack" ? "attack" : moving ? "walk" : "idle";
      const variant = 1 + Math.abs(Math.floor(m.home.x * 0.017 + m.home.y * 0.031)) % 3;
      const progress = 1 - m.t / 0.16;
      drawCraftOrc(c, variant, direction.view, direction.flip, action, tnow + m.home.x * 0.01, progress);
      if (flash || windup) {
        c.globalAlpha *= flash ? 0.75 : 0.25 + Math.sin(tnow * 28) * 0.12;
        drawCraftOrc(c, variant, direction.view, direction.flip, action, tnow + m.home.x * 0.01, progress, flash ? "#ffffff" : "#ff4040");
      }
    }
    c.restore();
    if (m.state === "attack" && m.type !== "spitter" && m.type !== "lich") {
      const reach = m.r + 20;
      c.strokeStyle = "rgba(255,185,110,0.56)";
      c.lineWidth = m.type === "hulk" ? 5 : 3;
      c.beginPath(); c.arc(x, y - 12, reach, m.dir - 0.55, m.dir + 0.55); c.stroke();
    }
    if (m.hp < m.maxHp || m.rare) {
      const sz = spriteSize(sprite);
      const top = y - (imported ? 102 : preview ? 92 : sz.h) * MONSTER_ART_SCALE - 8 + bob * MONSTER_ART_SCALE;
      if (m.rare) this.drawName("RARO ✦", x, top - 5, "#ffe59b");
      if (m.hp < m.maxHp) {
        c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 16, top, 32, 4);
        c.fillStyle = "#e04a4a"; c.fillRect(x - 16, top, 32 * clamp(m.hp / m.maxHp, 0, 1), 4);
      }
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

  drawFenceConnections(ox: number, oy: number, enqueue?: (y: number, draw: () => void) => void) {
    if (this.structures.length < 2) return;
    const reach = this.fenceSpec(this.territoryLevel).fenceRadius + 80;
    const bx = BASE.x + ox, by = BASE.y + oy;
    if (bx + reach < 0 || by + reach < 0 || bx - reach > this.viewW || by - reach > this.viewH) return;
    const c = this.ctx;
    const rings = new Map<number, (Structure | undefined)[]>();
    for (const s of this.structures) {
      if (s.type !== "wall" && s.type !== "gate") continue;
      const distance = Math.hypot(s.x - BASE.x, s.y - BASE.y);
      const ring = TERRITORIES.findIndex((_, i) => Math.abs(this.fenceSpec(i + 1).fenceRadius - distance) < 12) + 1;
      if (!ring) continue;
      const { slots } = this.fenceSpec(ring);
      const a = Math.atan2(s.y - BASE.y, s.x - BASE.x);
      const slot = ((Math.round(a * slots / (2 * Math.PI)) % slots) + slots) % slots;
      const position = this.fencePosition(slot, ring);
      if (dist2(position.x, position.y, s.x, s.y) >= 12 * 12) continue;
      let occupied = rings.get(ring);
      if (!occupied) { occupied = new Array<Structure | undefined>(slots); rings.set(ring, occupied); }
      occupied[slot] = s;
    }
    for (const [ring, occupied] of rings) {
      const { slots } = this.fenceSpec(ring);
      for (let slot = 0; slot < slots; slot++) {
        const first = occupied[slot], second = occupied[(slot + 1) % slots];
        if (!first || !second || (first.type === "gate" && first.open) || (second.type === "gate" && second.open)) continue;
        // The imported masonry pieces already touch and do not need the
        // procedural rails. Keep those rails for the asset-free fallback.
        if (first.fenceStyle === "stone" && second.fenceStyle === "stone" && this.settings.craftPix && hasReferenceObject("castle_wall")) continue;
        const x1 = first.x + ox, y1 = first.y + oy, x2 = second.x + ox, y2 = second.y + oy;
        if (Math.max(x1, x2) < -40 || Math.min(x1, x2) > this.viewW + 40 || Math.max(y1, y2) < -60 || Math.min(y1, y2) > this.viewH + 40) continue;
        const draw = () => {
          // At native 1x resolution the baked rails match the original canvas
          // geometry. Other render scales keep the vector path for crispness.
          if (this.dpr !== 1) { this.drawFenceLink(c, first.fenceStyle, x1, y1, x2, y2); return; }
          const key = `${first.fenceStyle}:${first.x}:${first.y}:${second.x}:${second.y}`;
          let cached = this.fenceLinks.get(key);
          if (!cached) {
            const left = Math.floor(Math.min(first.x, second.x) - 20), top = Math.floor(Math.min(first.y, second.y) - 100);
            const right = Math.ceil(Math.max(first.x, second.x) + 20), bottom = Math.ceil(Math.max(first.y, second.y) + 20);
            const canvas = document.createElement("canvas"); canvas.width = right - left; canvas.height = bottom - top;
            const painter = canvas.getContext("2d");
            if (!painter) { this.drawFenceLink(c, first.fenceStyle, x1, y1, x2, y2); return; }
            this.drawFenceLink(painter, first.fenceStyle, first.x - left, first.y - top, second.x - left, second.y - top);
            cached = { canvas, left, top };
            if (this.fenceLinks.size >= 128) {
              const oldest = this.fenceLinks.keys().next().value;
              if (oldest !== undefined) this.fenceLinks.delete(oldest);
            }
            this.fenceLinks.set(key, cached);
          }
          c.drawImage(cached.canvas, cached.left + ox, cached.top + oy);
        };
        if (enqueue) enqueue((first.y + second.y) / 2, draw); else draw();
      }
    }
  }

  drawFenceLink(c: CanvasRenderingContext2D, style: FenceStyle, x1: number, y1: number, x2: number, y2: number) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const point = (t: number) => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    const rail = (height: number, dark: string, light: string) => {
      c.strokeStyle = dark; c.lineWidth = 8; c.beginPath(); c.moveTo(x1, y1 - height); c.lineTo(x2, y2 - height); c.stroke();
      c.strokeStyle = light; c.lineWidth = 5; c.beginPath(); c.moveTo(x1, y1 - height - 1); c.lineTo(x2, y2 - height - 1); c.stroke();
      c.strokeStyle = "rgba(245,199,120,.55)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x1, y1 - height - 3); c.lineTo(x2, y2 - height - 3); c.stroke();
    };
    if (style === "stone") {
      // Full-height masonry instead of a thick line lying on the ground.
      c.fillStyle = "#56626b"; c.beginPath(); c.moveTo(x1, y1 + 3); c.lineTo(x1, y1 - 67); c.lineTo(x2, y2 - 67); c.lineTo(x2, y2 + 3); c.closePath(); c.fill();
      c.fillStyle = "#87969e"; c.beginPath(); c.moveTo(x1, y1 - 2); c.lineTo(x1, y1 - 63); c.lineTo(x2, y2 - 63); c.lineTo(x2, y2 - 2); c.closePath(); c.fill();
      for (const h of [17, 34, 51]) { c.strokeStyle = "#55616a"; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1 - h); c.lineTo(x2, y2 - h); c.stroke(); }
      c.strokeStyle = "#c5ced0"; c.lineWidth = 4; c.beginPath(); c.moveTo(x1, y1 - 65); c.lineTo(x2, y2 - 65); c.stroke();
      for (let i = 1, steps = Math.max(1, Math.floor(len / 11)); i < steps; i++) {
        const { x, y } = point(i / steps); c.fillStyle = i % 2 ? "#5c6971" : "#b1bec3";
        c.fillRect(x - 1, y - 49, 2, 14); c.fillRect(x + 3, y - 16, 2, 14);
      }
    } else if (style === "hedge") {
      rail(12, "#4c3927", "#856647"); rail(31, "#4c3927", "#856647");
      const steps = Math.max(2, Math.floor(len / 7));
      for (let i = 0; i <= steps; i++) {
        const { x, y } = point(i / steps);
        for (const h of [14, 30, 46]) {
          c.fillStyle = (i + h) % 3 ? "#568846" : "#79aa50"; c.beginPath(); c.arc(x, y - h + (i % 3 - 1) * 3, 7, 0, Math.PI * 2); c.fill();
        }
        if (i % 4 === 0) { c.fillStyle = "#b4d378"; c.fillRect(x - 2, y - 45, 3, 2); }
      }
    } else {
      if (style === "palisade") {
        // Narrow, pointed logs rise between the posts; each remains vertical
        // on screen even where the circular footprint turns sideways.
        const steps = Math.max(2, Math.floor(len / 7));
        for (let i = 1; i < steps; i++) {
          const { x, y } = point(i / steps);
          c.fillStyle = "#4a2d1d"; c.beginPath(); c.moveTo(x - 4, y + 1); c.lineTo(x - 4, y - 47); c.lineTo(x, y - 56); c.lineTo(x + 4, y - 47); c.lineTo(x + 4, y + 1); c.closePath(); c.fill();
          c.fillStyle = i % 2 ? "#a86c42" : "#bf8550"; c.fillRect(x - 2, y - 46, 4, 44);
          c.fillStyle = "#dfad6c"; c.fillRect(x - 1, y - 42, 1, 34);
        }
      }
      const heights = style === "rustic" ? [12, 30] : [12, 32, 48];
      for (const height of heights) rail(height, "#37241a", style === "rustic" ? "#a8734b" : "#96623a");
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
      const { slots, fenceRadius } = this.fenceSpec();
      c.strokeStyle = "rgba(222,191,120,0.52)";
      c.lineWidth = 2; c.setLineDash([6, 9]);
      c.beginPath(); c.arc(BASE.x + ox, BASE.y + oy, fenceRadius, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      for (let slot = 0; slot < slots; slot++) {
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
      const fw = ring ? 32 : type === "training" ? 200 : 44, fh = type === "training" ? 160 : fw - 8;
      c.beginPath(); c.rect(Math.round(x - fw / 2), Math.round(y - fh / 2 + (type === "training" ? 0 : 4)), fw, fh); c.fill(); c.stroke();
      const name = type === "campfire" ? "campfire0" : type;
      const previewRotation = ring ? Math.atan2(p.y-BASE.y,p.x-BASE.x)+Math.PI/2 : this.placeRotation;
      if (type === "training") { c.save(); c.globalAlpha = 0.7; this.drawTrainingFloor(x, y); this.drawTrainingProps(x, y); c.restore(); }
      else if(type==="wall") this.drawFencePost(this.fenceStyle,x,y+6,previewRotation,.76,ok?"#63c87e":"#d66060");
      else if(type==="gate") this.drawStyledGate({type:"gate",x:p.x,y:p.y,prodT:0,hp:1,maxHp:1,open:false,rotation:previewRotation,fenceStyle:this.fenceStyle},x,y+6,.76,ok?"#63c87e":"#d66060");
      else {
        c.save(); c.translate(x, y + 6); c.rotate(previewRotation);
        c.globalAlpha = 0.72;
        const referenceName = type === "tower" ? "castle_tower" : type === "house" ? placedHouseArt(p.x, p.y) : type === "forge" ? "forge" : type === "barricade" ? BARRICADE_ART[this.defenseTier - 1] : null;
        const referenceBuilding = type === "spike_trap" && this.settings.craftPix ? drawReferenceSpikes(c, this.defenseTier, 2, 0, 0) : referenceName && this.settings.craftPix && drawReferenceObject(c, referenceName, 0, 0, REFERENCE_SCALE[referenceName]);
        c.globalAlpha = 1;
        if (!referenceBuilding) { drawSprite(c, name, 0, 0, { alpha: .72 }); drawSprite(c, name, 0, 0, { alpha: .22, tint: ok ? "#7dff9b" : "#ff6060" }); }
        c.restore();
      }
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
    const displayName = type === "wall" && positions.length === 1 ? "Cerca simples" : STRUCT_DEF[type].name;
    const orientation = ring ? ` · anel ${this.fenceRing}` : type === "spike_trap" || type === "barricade" ? ` · nível ${this.defenseTier}` : type === "training" ? "" : this.placeRotation ? " · lado" : " · frente";
    const label = ok ? `${STRUCT_DEF[type].icon} ${displayName}${orientation}` : `⛔ ${this.placeReason}`;
    c.fillStyle = "rgba(10,12,20,0.84)";
    const tw = c.measureText(label).width + 16;
    const previewRef = type === "tower" ? "castle_tower" : type === "house" ? placedHouseArt(this.placeX, this.placeY) : type === "forge" ? "forge" : null;
    const referenceHeight = previewRef && this.settings.craftPix && hasReferenceObject(previewRef) ? (type === "house" ? 250 : previewRef === "forge" ? 210 : 196) * REFERENCE_SCALE[previewRef] : 0;
    const labelY = type === "training" ? y - 155 : referenceHeight ? y - referenceHeight - 25 : y - 70 - spriteSize(name).h * 0.4;
    this.rr(x - tw / 2, labelY, tw, 22, 6); c.fill();
    c.fillStyle = ok ? "#c8ffd8" : "#ffc8c8";
    c.fillText(label, x, labelY + 15);
  }

  /* ---------------- HUD ---------------- */
  /** HUD regions share a row on small screens rather than overlapping. */
  hudLayout() {
    const compact = this.viewW < 790;
    if (!compact) return {
      compact,
      health: { x: 8, width: 236 },
      day: { x: this.viewW / 2 - 150, width: 300 },
      score: { x: this.viewW - 180, width: 170 },
    };
    const available = this.viewW - 24; // margins and two 4px gaps
    const healthWidth = Math.floor(available * 0.32);
    const dayWidth = Math.floor(available * 0.36);
    const scoreWidth = available - healthWidth - dayWidth;
    return {
      compact,
      health: { x: 8, width: healthWidth },
      day: { x: 12 + healthWidth, width: dayWidth },
      score: { x: 16 + healthWidth + dayWidth, width: scoreWidth },
    };
  }

  hotbarLayout() {
    const small = this.viewW < 760;
    const gap = 4;
    // Nine slots plus a separator and 8px of border on each side.
    const slot = small ? Math.min(40, Math.floor((this.viewW - 62) / 9)) : 46;
    const total = 9 * (slot + gap) + 14 - gap;
    return { small, gap, slot, total, x: Math.round((this.viewW - total) / 2), y: this.viewH - slot - 14 };
  }

  minimapLayout() {
    const compact = this.viewW < 700;
    const size = compact ? 92 : 140;
    return {
      size,
      x: compact ? 12 : this.viewW - size - 12,
      // On a phone the map sits below the joystick, above the full hotbar and
      // opposite the touch actions instead of covering item counts.
      y: compact ? this.viewH - size - this.hotbarLayout().slot - 28 : this.viewH - size - 12,
    };
  }

  hudBottomStart() {
    return Math.max(Math.min(120, this.viewH), this.viewH - (this.viewW < 700 ? 185 : 190));
  }

  renderHud() {
    const c = this.ctx;
    const w = this.viewW;
    const layout = this.hudLayout();
    const underAttack = this.underAttackNow();
    c.textAlign = "left";

    // top-left: hp + stamina (pixel panel)
    const bx = 14, by = 14;
    this.panel(layout.health.x, by - 6, layout.health.width, 52);
    const barW = layout.health.width - 50;
    c.fillStyle = "#3a1414"; c.fillRect(bx + 24, by + 2, barW, 13);
    const hpw = barW * clamp(this.hp / this.maxHp, 0, 1);
    c.fillStyle = this.hp / this.maxHp < 0.3 ? "#ff4040" : "#e04a4a";
    if (hpw > 1) c.fillRect(bx + 24, by + 2, hpw, 13);
    c.fillStyle = "rgba(255,255,255,0.25)"; if (hpw > 1) c.fillRect(bx + 24, by + 2, hpw, 3);
    c.font = "700 11px Nunito, 'Trebuchet MS', system-ui, sans-serif"; c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, bx + 24 + barW / 2, by + 12, barW - 2);
    c.textAlign = "left";
    // Legible pixel heart with two lobes and a tapered point, rather than the
    // old rectangular cross. It remains inside the same compact HUD panel.
    c.fillStyle = "#491a22";
    c.fillRect(bx + 4, by + 1, 5, 2); c.fillRect(bx + 12, by + 1, 5, 2);
    c.fillRect(bx + 2, by + 3, 17, 5); c.fillRect(bx + 3, by + 8, 15, 2);
    c.fillRect(bx + 5, by + 10, 11, 2); c.fillRect(bx + 7, by + 12, 7, 2); c.fillRect(bx + 9, by + 14, 3, 1);
    c.fillStyle = "#e04a50";
    c.fillRect(bx + 4, by + 3, 13, 5); c.fillRect(bx + 5, by + 8, 11, 2);
    c.fillRect(bx + 7, by + 10, 7, 2); c.fillRect(bx + 9, by + 12, 3, 2);
    c.fillStyle = "#ffb1a6"; c.fillRect(bx + 5, by + 3, 3, 2); c.fillRect(bx + 4, by + 5, 2, 2);
    c.fillStyle = "#1b2e1b"; c.fillRect(bx + 24, by + 20, barW, 9);
    const stw = barW * this.stamina / 100;
    c.fillStyle = this.stamina < 20 ? "#d0c060" : "#6ad06a";
    if (stw > 1) c.fillRect(bx + 24, by + 20, stw, 9);
    c.fillStyle = "#ffe36a"; c.beginPath(); c.moveTo(bx + 12, by + 19); c.lineTo(bx + 6, by + 26); c.lineTo(bx + 10, by + 26); c.lineTo(bx + 8, by + 31); c.lineTo(bx + 15, by + 23); c.lineTo(bx + 11, by + 23); c.closePath(); c.fill();

    // top-center: day/phase/zone
    c.textAlign = "center";
    const dayCenter = layout.day.x + layout.day.width / 2;
    this.panel(layout.day.x, 8, layout.day.width, 44);
    c.font = `800 ${layout.compact ? 12 : 14}px Nunito, 'Trebuchet MS', system-ui, sans-serif`; c.fillStyle = "#ffe9b0";
    const phase = layout.compact ? this.phaseLabel().replace(/^\S+\s+/u, "") : this.phaseLabel();
    c.fillText(`Dia ${this.day} · ${phase}`, dayCenter, 26, layout.day.width - 10);
    c.font = `600 ${layout.compact ? 10 : 12}px Nunito, 'Trebuchet MS', system-ui, sans-serif`; c.fillStyle = "#b8c8d8";
    c.fillText(this.zoneName(), dayCenter, 43, layout.day.width - 10);
    // The clock ring is omitted on compact screens to make room for the text.
    if (!layout.compact) {
      const prog = (this.time % CYCLE) / CYCLE;
      c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 3;
      c.beginPath(); c.arc(w / 2 - 128, 30, 12, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = this.isNight() ? "#8ab0ff" : "#ffd34d";
      c.beginPath(); c.arc(w / 2 - 128, 30, 12, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke();
    }

    // score top-right
    c.textAlign = "right";
    this.panel(layout.score.x, 8, layout.score.width, 44);
    const scoreRight = layout.score.x + layout.score.width - 10;
    c.font = `800 ${layout.compact ? 13 : 16}px Nunito, 'Trebuchet MS', system-ui, sans-serif`; c.fillStyle = "#ffd34d";
    c.fillText(`${this.score.toLocaleString("pt-BR")} pts`, scoreRight, 27, layout.score.width - 14);
    c.font = `${layout.compact ? 9 : 11}px system-ui`; c.fillStyle = "#b8c8d8";
    const mpTxt = this.opts.mode === "multi" ? ` · 👥${this.remotes.length + 1}` : "";
    c.fillText(`💀 ${this.kills} · 🏕️ nv.${this.baseLevel()}${mpTxt}`, scoreRight, 44, layout.score.width - 14);

    this.renderHotbar();

    // interact hint
    if (this.interactHint) {
      c.textAlign = "center";
      c.font = "700 13px Nunito, 'Trebuchet MS', system-ui, sans-serif";
      c.fillStyle = "rgba(10,14,20,0.85)";
      const hw = Math.min(w - 20, Math.max(220, c.measureText(this.interactHint).width + 40));
      // Keep the prompt above the tutorial and keyboard shortcuts, not hidden
      // beneath them. This also remains inside the cached HUD's top band.
      const hintY = underAttack ? 88 : 60;
      this.rr(w / 2 - hw / 2, hintY, hw, 28, 8); c.fill();
      c.fillStyle = "#9fe3ff";
      c.fillText(this.interactHint, w / 2, hintY + 19);
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

    if (underAttack) {
      const pulse = 0.5 + Math.sin(performance.now() / 220) * 0.5;
      c.textAlign = "center";
      c.fillStyle = `rgba(120,10,10,${0.45 + pulse * 0.35})`;
      this.rr(w / 2 - 132, 56, 264, 26, 8); c.fill();
      c.strokeStyle = "#ff6a6a"; c.lineWidth = 1.5;
      this.rr(w / 2 - 132, 56, 264, 26, 8); c.stroke();
      c.font = "bold 13px system-ui, sans-serif";
      c.fillStyle = "#ffe2e2";
      const baseThreat = dist2(this.px, this.py, BASE.x, BASE.y) < this.territoryRadius() ** 2 ||
        this.monsters.some((m) => m.siege && dist2(m.x, m.y, BASE.x, BASE.y) < (this.territoryRadius() + 350) ** 2);
      c.fillText(baseThreat ? "⚠ BASE SOB ATAQUE — DEFENDA A CERCA!" : "⚠ CRIATURAS PRÓXIMAS — FIQUE ATENTO!", w / 2, 74);
    }
    if (this.settings.showFps) {
      c.textAlign = this.viewW < 700 ? "left" : "right";
      c.font = "bold 11px ui-monospace, monospace";
      c.fillStyle = this.fps < 45 ? "#ffb46a" : "#9fe3a0";
      const gate = this.structures.find((s) => s.type === "gate");
      const gateTxt = gate ? ` · ${gate.open ? "🚪 aberto" : "🚪 fechado"}` : "";
      const mini = this.minimapLayout();
      c.fillText(`${this.fps} FPS${gateTxt}`, this.viewW < 700 ? mini.x : w - 12, mini.y - 8);
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
    const { small, slot, gap, total, x: x0, y: y0 } = this.hotbarLayout();
    const smallScale = Math.min(1, slot / 40);
    const tools: ToolKey[] = ["axe", "pick", "sword"];
    const res: ResKey[] = ["wood", "stone", "fiber", "food", "iron", "crystal"];
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
      const icon = t === "sword" && this.combatWeapon === "bow" ? "bow" : t;
      if (!this.settings.craftPix || !drawReferenceIcon(c, icon, x + 4, y0 + 3, slot - 8)) {
        if (icon === "bow") drawSprite(c, "tool_bow", x + slot / 2, y0 + slot * 0.85, { scale: small ? 2 * smallScale : 2.3 });
        else drawToolSprite(c, t, x + slot * 0.3, y0 + slot * 0.68, -Math.PI / 4, small ? 1.7 * smallScale : 2.0);
      }
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
      if (!this.settings.craftPix || !drawReferenceIcon(c, r, x + 4, y0 + 3, slot - 8)) {
        drawSprite(c, "it_" + r, x + slot / 2, y0 + slot * 0.72, { scale: small ? 3 * smallScale : 3.5 });
      }
      c.font = `800 ${slot < 34 ? 9 : 11}px Nunito, system-ui, sans-serif`;
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
    const { size, x: mx, y: my } = this.minimapLayout();
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
    for (const hamlet of this.hamlets) dot(hamlet.x, hamlet.y, "#ffe0a3", 2.5);
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
      // Keep the label out of the day/zone panel at the top of the screen.
      const labelY = by - 87 < 60 ? by + 30 : by - 87;
      c.font = "bold 13px system-ui, sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#04210c";
      c.fillText("SUA BASE", bx + 1, labelY + 1);
      c.fillStyle = "#b6ffc9";
      c.fillText("SUA BASE", bx, labelY);
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
      ...this.hamlets.map((h) => ({ name: h.name, sub: "Pequeno vilarejo", x: h.x, y: h.y, color: "#ffe0a3", lx: -25, ly: 10, big: false })),
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
    // Mark possible rescues as rumours; each is completed independently.
    for (const rescue of this.rescues) {
      if (this.specialists[rescue.id].hired) continue;
      const x = mx + rescue.x * sx, y = my + rescue.y * sy;
      c.fillStyle = "#35231c"; c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.specialists[rescue.id].rescued ? "#9df2a8" : "#ffd36a";
      c.font = "bold 12px system-ui, sans-serif"; c.textAlign = "center"; c.fillText("!", x, y + 4);
    }
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

  /* The supplied aircraft image is a watermarked stock preview. This generic
   * vector aircraft is drawn independently; no pixels are copied from it. */
  drawIntroPlane(x: number, y: number, rotation: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rotation); c.scale(1.35, 1.35);
    const poly = (color: string, points: [number, number][]) => {
      c.fillStyle = color; c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (const [px, py] of points.slice(1)) c.lineTo(px, py);
      c.closePath(); c.fill();
    };
    // Tail and swept wing sit behind the fuselage, not on top of windows.
    poly("#243d69", [[-58,-6],[-76,-34],[-58,-34],[-41,-8]]);
    poly("#54729a", [[-50,-10],[-64,-29],[-58,-29],[-45,-9]]);
    poly("#73869d", [[-15,3],[-38,24],[-18,24],[13,5]]);
    poly("#d7e2eb", [[-16,1],[-36,20],[-20,20],[9,2]]);
    poly("#334c6c", [[-70,-10],[39,-10],[57,-5],[66,1],[59,9],[42,13],[-55,13],[-68,7]]);
    poly("#f4f6f5", [[-66,-9],[37,-9],[54,-5],[63,0],[55,7],[39,9],[-55,9],[-66,4]]);
    poly("#d4e0e7", [[-65,4],[57,4],[55,8],[39,11],[-55,11],[-65,6]]);
    c.fillStyle = "#416f9a"; c.fillRect(-54, 5, 99, 3);
    c.fillStyle = "#243f62";
    for (let i = 0; i < 10; i++) c.fillRect(-39 + i * 8, -5, 4, 5);
    poly("#294564", [[45,-7],[52,-5],[58,-1],[46,-1]]);
    c.fillStyle = "#87afc2"; c.fillRect(47, -5, 4, 2);
    c.strokeStyle = "#9aabb4"; c.lineWidth = 1; c.strokeRect(-52, -7, 8, 12); c.strokeRect(29, -7, 7, 11);
    // Engine pod and small navigation light.
    poly("#61788f", [[-25,8],[-7,8],[-5,15],[-21,16],[-28,13]]);
    poly("#e2e8ec", [[-24,8],[-8,8],[-7,12],[-22,13],[-26,11]]);
    c.fillStyle = "#bd634f"; c.fillRect(-73, -34, 3, 2);
    c.restore();
  }

  drawCutsceneSun(x: number, y: number, radius: number) {
    const c = this.ctx;
    const glow = c.createRadialGradient(x, y, radius * 0.15, x, y, radius * 2.6);
    glow.addColorStop(0, "rgba(255,249,194,.65)"); glow.addColorStop(1, "rgba(255,238,180,0)");
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, radius * 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffe6a3"; c.beginPath(); c.arc(x, y, radius + 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff7d2"; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
  }

  /* ---------------- cutscene render ---------------- */
  renderCutscene(dt: number) {
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
      this.drawCutsceneSun(w * 0.8, h * 0.18, Math.min(36, h * 0.07));
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
      this.drawIntroPlane(px, py, rot);
      if (this.cutPhase === 1) {
        // Match the old 60 Hz rate regardless of the actual display refresh.
        this.cutParticleAcc += dt * 60;
        const bursts = Math.floor(this.cutParticleAcc);
        this.cutParticleAcc -= bursts;
        for (let burst = 0; burst < bursts; burst++) {
          for (let i = 0; i < 3 && this.particles.length < this.particleCap; i++) {
            this.particles.push({ x: px - 40 - Math.random() * 30, y: py + (Math.random() - 0.5) * 16, vx: -80 - Math.random() * 60, vy: (Math.random() - 0.5) * 40, t: 0, max: 0.8, c: i === 0 ? "#ff9b2d" : i === 1 ? "#ffd34d" : "#555", s: 4 + Math.random() * 5, grav: -20 });
          }
        }
        this.shake = Math.min(10, this.shake + dt * 24);
      }
      // particles (screen space)
      this.updateParticles(dt);
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
      // Time-based impact, flame, smoke and water spray; skipping the intro and
      // different refresh rates do not alter gameplay or particle counts.
      const progress = clamp((t - 7.2) / 1.4, 0, 1), x = w * 0.72, y = h * 0.63;
      c.fillStyle = "#1a3855"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#284f70"; c.fillRect(0, y, w, h - y);
      c.save(); c.globalAlpha = Math.max(0, 1 - progress * 0.85);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.399963, reach = (28 + i * 7) * (0.4 + progress);
        c.fillStyle = i % 3 === 0 ? "#594a46" : i % 2 ? "#f0782e" : "#f9ba4e";
        c.beginPath(); c.arc(x + Math.cos(a) * reach, y - Math.abs(Math.sin(a)) * reach, 20 + progress * (18 + i * 2), 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = "#fff4b9"; c.beginPath(); c.arc(x, y - 12, Math.max(0, 48 * (1 - progress)), 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#d0edf0"; c.lineWidth = 3 + progress * 3;
      c.beginPath(); c.ellipse(x, y + 8, 25 + progress * 145, 6 + progress * 28, 0, Math.PI, Math.PI * 2); c.stroke();
      for (let i = 0; i < 18; i++) {
        const a = Math.PI + i * Math.PI / 17, reach = 40 + progress * (70 + (i % 5) * 20);
        c.fillStyle = i % 3 ? "#f4c77b" : "#d7eef1"; c.fillRect(x + Math.cos(a) * reach, y + Math.sin(a) * reach * 0.75 + progress * progress * 65, 4 + i % 3, 4 + i % 3);
      }
      c.restore();
      if (this.flashWhite > 0) { c.fillStyle = `rgba(255,255,255,${this.flashWhite * 0.65})`; c.fillRect(0, 0, w, h); }
    } else {
      // beach dusk scene
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2c2a4a"); g.addColorStop(0.45, "#8a4a62"); g.addColorStop(0.6, "#e8955c"); g.addColorStop(0.62, "#1b3a5c"); g.addColorStop(0.75, "#d9c38a"); g.addColorStop(1, "#c9b37a");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // sun setting
      this.drawCutsceneSun(w * 0.5, h * 0.58, 29);
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
    c.scale(0.82, 0.82); this.drawIntroPlane(0, 0, 0);
    c.fillStyle = "#4c5055"; c.fillRect(-15, -7, 28, 13); c.fillRect(0, 7, 15, 5);
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
    window.removeEventListener("pointerdown", this.onAudioGesture);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (this.state === "playing" || this.state === "paused") this.saveGame();
    this.fenceLinks.clear(); this.fencePosts.clear();
    this.sfx.destroy();
  }
}
