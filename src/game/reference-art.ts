/** Optional art prepared locally from the screenshots supplied for this game. */
import type { View } from "./sprites";

export type ReferenceScene = "forge" | "chapel" | "market" | "camp" | "sewer";
export type ReferenceObject = ReferenceScene | "house" | "chest" | "castle_wall" | "castle_tower" | "castle_gate" | "castle_grate"
  | "house_half_timber" | "house_wood_a" | "house_wood_b" | "house_stone"
  | "bridge_wood_h" | "bridge_wood_v" | "bridge_stone_h" | "bridge_stone_v"
  | "barricade_1" | "barricade_2" | "barricade_3" | "barricade_4"
  | "training_fence" | "training_mat" | "training_canopy" | "training_dummy" | "training_rack";
export type ReferenceBridge = "bridge_wood_h" | "bridge_wood_v" | "bridge_stone_h" | "bridge_stone_v";
type ArcherAction = "idle" | "walk" | "run" | "attack";
export type ResidentLook = "mage-red" | "mage-blue" | "archer" | "archer-hood";
const iconNames = ["sword", "axe", "pick", "wood", "fiber", "food", "iron", "crystal"] as const;
export type ReferenceIcon = typeof iconNames[number] | "bow";

const dimensions: Record<ReferenceObject, [number, number]> = {
  forge: [260, 210], house: [220, 250], chest: [100, 82],
  chapel: [240, 294], market: [200, 176], camp: [200, 200], sewer: [200, 87],
  castle_wall: [44, 84], castle_tower: [112, 196], castle_gate: [82, 70], castle_grate: [31, 25],
  house_half_timber: [220, 250], house_wood_a: [220, 250], house_wood_b: [220, 250], house_stone: [220, 250],
  bridge_wood_h: [160, 108], bridge_wood_v: [64, 136], bridge_stone_h: [160, 116], bridge_stone_v: [80, 140],
  barricade_1: [96, 128], barricade_2: [96, 128], barricade_3: [96, 128], barricade_4: [96, 128],
  training_fence: [210, 180], training_mat: [210, 168], training_canopy: [168, 134], training_dummy: [44, 64], training_rack: [90, 65],
};
const objects = new Map<ReferenceObject, HTMLImageElement>();
const scenes = new Set<ReferenceScene>();
let archer: HTMLImageElement | null = null;
let archerHood: HTMLImageElement | null = null;
let mageBlue: HTMLImageElement | null = null;
let mageRed: HTMLImageElement | null = null;
let minerals: HTMLImageElement | null = null;
let rocks: HTMLImageElement | null = null;
let icons: HTMLImageElement | null = null;
let plants: HTMLImageElement | null = null;
let bow: HTMLImageElement | null = null;
let menu: HTMLImageElement | null = null;
let spikes: HTMLImageElement | null = null;
let lightning: HTMLImageElement | null = null;
let ripples: HTMLImageElement | null = null;
let figures: HTMLImageElement | null = null;
let figureFlags: boolean[] = [];
let creatures: HTMLImageElement | null = null;
let whiteCreatures: HTMLCanvasElement | null = null;
let redCreatures: HTMLCanvasElement | null = null;
const creatureCells: Record<string, number> = { goblin: 0, orc: 1, ghost: 2, lizardman: 3, zombie: 4, emberdemon: 5, vampire: 6, lich: 7, skeleton: 8, demonbat: 9, wraith: 10, skelmage: 11 };
const creatureThumbnails = new Map<string, string>();
const iconThumbnails = new Map<ReferenceIcon, string>();
const spikeThumbnails = new Map<number, string>();
let loading: Promise<void> | null = null;

function image(name: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.naturalWidth === width && img.naturalHeight === height ? resolve(img) : reject(new Error(`Imagem inválida: ${name}`));
    img.onerror = () => reject(new Error(`Imagem indisponível: ${name}`));
    img.src = `/referencias/${name}.png`;
  });
}

/** Load each group independently. Missing or invalid previews keep the fallback. */
export function loadReferenceArt(): Promise<void> {
  if (typeof window === "undefined" || typeof Image === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch("/referencias/manifest.json", { cache: "no-cache" });
      if (!response.ok) return;
      const manifest: unknown = await response.json();
      if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== 1) return;
      const flags = manifest as { archer?: unknown; archerHood?: unknown; mageBlue?: unknown; mageRed?: unknown; minerals?: unknown; rocks?: unknown; icons?: unknown; plants?: unknown; bow?: unknown; menu?: unknown; spikes?: unknown; lightning?: unknown; ripples?: unknown; figures?: unknown; creatures?: unknown; objects?: Partial<Record<ReferenceObject, unknown>>; scenes?: Partial<Record<ReferenceScene, unknown>> };
      const tasks: Promise<void>[] = [];
      if (flags.archer === true) tasks.push(image("archer", 768, 1152).then((loaded) => { archer = loaded; }).catch(() => {}));
      if (flags.archerHood === true) tasks.push(image("archer-hood", 768, 1152).then((loaded) => { archerHood = loaded; }).catch(() => {}));
      if (flags.mageBlue === true) tasks.push(image("mage-blue", 1152, 768).then((loaded) => { mageBlue = loaded; }).catch(() => {}));
      if (flags.mageRed === true) tasks.push(image("mage-red", 1152, 768).then((loaded) => { mageRed = loaded; }).catch(() => {}));
      if (flags.minerals === true) tasks.push(image("minerals", 960, 96).then((loaded) => { minerals = loaded; }).catch(() => {}));
      if (flags.rocks === true) tasks.push(image("rocks", 768, 96).then((loaded) => { rocks = loaded; }).catch(() => {}));
      if (flags.icons === true) tasks.push(image("icons", 512, 64).then((loaded) => { icons = loaded; }).catch(() => {}));
      if (flags.plants === true) tasks.push(image("plants", 384, 64).then((loaded) => { plants = loaded; }).catch(() => {}));
      if (flags.bow === true) tasks.push(image("bow", 64, 64).then((loaded) => { bow = loaded; }).catch(() => {}));
      if (flags.menu === true) tasks.push(image("menu", 960, 640).then((loaded) => { menu = loaded; }).catch(() => {}));
      if (flags.spikes === true) tasks.push(image("spikes", 576, 384).then((loaded) => { spikes = loaded; }).catch(() => {}));
      if (flags.lightning === true) tasks.push(image("lightning", 480, 200).then((loaded) => { lightning = loaded; }).catch(() => {}));
      if (flags.ripples === true) tasks.push(image("ripples", 384, 64).then((loaded) => { ripples = loaded; }).catch(() => {}));
      if (Array.isArray(flags.figures) && flags.figures.length === 4 && flags.figures.some((value: unknown) => value === true)) {
        const available = flags.figures.map((value: unknown) => value === true);
        tasks.push(image("figures", 384, 96).then((loaded) => { figures = loaded; figureFlags = available; }).catch(() => {}));
      }
      if (flags.creatures === true) tasks.push(image("creatures", 1152, 96).then((loaded) => {
        creatures = loaded;
        const tint = (color: string) => {
          const canvas = document.createElement("canvas"); canvas.width = 1152; canvas.height = 96;
          const painter = canvas.getContext("2d");
          if (!painter) return null;
          painter.drawImage(loaded, 0, 0); painter.globalCompositeOperation = "source-in";
          painter.fillStyle = color; painter.fillRect(0, 0, 1152, 96);
          return canvas;
        };
        whiteCreatures = tint("#ffffff"); redCreatures = tint("#ff4040");
      }).catch(() => {}));
      for (const name of Object.keys(dimensions) as ReferenceObject[]) {
        const [width, height] = dimensions[name];
        if (flags.objects?.[name] === true) tasks.push(image(name, width, height).then((loaded) => { objects.set(name, loaded); }).catch(() => {}));
      }
      for (const name of ["forge", "chapel", "market", "camp", "sewer"] as ReferenceScene[]) if (flags.scenes?.[name] === true) scenes.add(name);
      await Promise.all(tasks);
      window.dispatchEvent(new Event("reference-art-ready"));
    } catch { /* optional art */ }
  })();
  return loading;
}

export function hasReferenceArcher() { return !!archer; }
export function hasReferenceObject(name: ReferenceObject) { return objects.has(name); }
export function hasReferenceScene(name: ReferenceScene) { return scenes.has(name); }
export function referenceSceneUrl(name: ReferenceScene) { return hasReferenceScene(name) ? `/referencias/scene-${name}.png` : ""; }
export function referenceMenuUrl() { return menu ? "/referencias/menu.png" : ""; }
export function referenceObjectUrl(name: ReferenceObject) { return hasReferenceObject(name) ? `/referencias/${name}.png` : ""; }

/** Bridge art is clipped to real walkable bridge tiles by Terrain. */
export function drawReferenceBridge(ctx: CanvasRenderingContext2D, name: ReferenceBridge, x: number, y: number, width: number, height: number): boolean {
  const img = objects.get(name);
  if (!img) return false;
  ctx.drawImage(img, x, y, width, height);
  return true;
}

/** A trap's six supplied frames, one row per tier. */
export function drawReferenceSpikes(ctx: CanvasRenderingContext2D, tier: number, frame: number, x: number, y: number, size = 76): boolean {
  if (!spikes) return false;
  const row = Math.max(0, Math.min(3, Math.floor(tier) - 1));
  const col = Math.max(0, Math.min(5, Math.floor(frame)));
  ctx.drawImage(spikes, col * 96, row * 96, 96, 96, Math.round(x - size / 2), Math.round(y - size * 0.82), size, size);
  return true;
}
export function referenceSpikeUrl(tier: number): string {
  if (!spikes || typeof document === "undefined") return "";
  const row = Math.max(0, Math.min(3, Math.floor(tier) - 1));
  const cached = spikeThumbnails.get(row);
  if (cached) return cached;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // Use the fully raised third frame in the workshop, not the near-hidden idle.
  ctx.drawImage(spikes, 2 * 96, row * 96, 96, 96, 0, 0, 96, 96);
  const url = canvas.toDataURL(); spikeThumbnails.set(row, url); return url;
}
export function drawReferenceLightning(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number): boolean {
  if (!lightning) return false;
  const col = Math.max(0, Math.min(5, Math.floor(frame)));
  ctx.drawImage(lightning, col * 80, 0, 80, 200, Math.round(x - 32), Math.round(y - 148), 64, 160);
  return true;
}
export function drawReferenceRipple(ctx: CanvasRenderingContext2D, frame: number, x: number, y: number): boolean {
  if (!ripples) return false;
  const col = ((Math.floor(frame) % 6) + 6) % 6;
  ctx.drawImage(ripples, col * 64, 0, 64, 64, Math.round(x - 16), Math.round(y - 16), 32, 32);
  return true;
}

function iconFor(name: string): ReferenceIcon | null {
  const id = name.replace(/^(tool_|it_)/, "") as ReferenceIcon;
  return id === "bow" || (iconNames as readonly string[]).includes(id) ? id : null;
}

/** Matching GUI icons from the supplied sheet; unsupported items fall back. */
export function drawReferenceIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number): boolean {
  const id = iconFor(name);
  if (!id) return false;
  if (id === "bow") {
    if (!bow) return false;
    ctx.drawImage(bow, x, y, size, size);
    return true;
  }
  if (!icons) return false;
  ctx.drawImage(icons, iconNames.indexOf(id) * 64, 0, 64, 64, x, y, size, size);
  return true;
}
export function referenceIconUrl(name: string): string {
  const id = iconFor(name);
  if (!id || (id === "bow" ? !bow : !icons) || typeof document === "undefined") return "";
  const cached = iconThumbnails.get(id);
  if (cached) return cached;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx || !drawReferenceIcon(ctx, id, 0, 0, 64)) return "";
  const url = canvas.toDataURL(); iconThumbnails.set(id, url);
  return url;
}

export function referenceArcherFrame(view: View, flip: boolean, action: ArcherAction, time: number, attackProgress: number) {
  const row = view === "down" ? 0 : view === "up" ? 3 : flip ? 1 : 2;
  const index = action === "idle" ? 0 : action === "walk" ? 1 : action === "run" ? 2 : 3;
  const count = action === "idle" ? (row === 3 ? 4 : 12) : action === "walk" ? 6 : 8;
  const n = action === "attack" ? Math.min(count - 1, Math.max(0, Math.floor(attackProgress * count))) : ((Math.floor(time * (action === "idle" ? 5 : 8)) % count) + count) % count;
  const attack = action === "attack";
  return { x: n * (attack ? 96 : 64), y: attack ? 768 + row * 96 : (index * 4 + row) * 64, size: attack ? 96 : 64 };
}

export function drawReferenceArcher(ctx: CanvasRenderingContext2D, view: View, flip: boolean, action: ArcherAction, time: number, attackProgress: number): boolean {
  if (!archer) return false;
  const frame = referenceArcherFrame(view, flip, action, time, attackProgress);
  if (action === "attack") {
    // 96 source pixels include the whole bow flash. Same foot position as idle.
    ctx.drawImage(archer, frame.x, frame.y, 96, 96, -77, -102, 154, 154);
  } else {
    ctx.drawImage(archer, frame.x, frame.y, 64, 64, -64, -90, 128, 128);
  }
  return true;
}

/** Reference looks for rescued specialists, not ordinary villagers. */
export function drawReferenceResident(ctx: CanvasRenderingContext2D, look: ResidentLook, view: View, flip: boolean, walking: boolean, time: number): boolean {
  if (look === "archer") return drawReferenceArcher(ctx, view, flip, walking ? "walk" : "idle", time, 0);
  if (look === "archer-hood") {
    if (!archerHood) return false;
    const frame = referenceArcherFrame(view, flip, walking ? "walk" : "idle", time, 0);
    ctx.drawImage(archerHood, frame.x, frame.y, 64, 64, -64, -90, 128, 128);
    return true;
  }
  const atlas = look === "mage-blue" ? mageBlue : mageRed;
  if (!atlas) return false;
  const row = view === "down" ? 0 : view === "up" ? 3 : flip ? 1 : 2;
  const count = walking ? 6 : row === 3 ? 4 : 12;
  const frame = ((Math.floor(time * (walking ? 8 : 5)) % count) + count) % count;
  ctx.drawImage(atlas, frame * 96, (walking ? 4 + row : row) * 96, 96, 96, -64, -95, 128, 128);
  return true;
}

/** The supplied character pictures contain a single frontal pose. Use them
 * for stationary visitors only; animated residents keep directional frames. */
export function drawReferenceFigure(ctx: CanvasRenderingContext2D, index: number, x: number, y: number): boolean {
  if (!figures || !figureFlags[index]) return false;
  ctx.drawImage(figures, index * 96, 0, 96, 96, Math.round(x - 48), Math.round(y - 92), 96, 96);
  return true;
}

export function hasReferenceCreature(skin: string): boolean {
  return !!creatures && Object.hasOwn(creatureCells, skin);
}
/** A static reference pose may be bobbed/mirrored by the engine, but it is not
 * represented as a sprite sheet with invented directional frames. */
export function drawReferenceCreature(ctx: CanvasRenderingContext2D, skin: string, flip: boolean, tint?: "white" | "red"): boolean {
  const index = Object.hasOwn(creatureCells, skin) ? creatureCells[skin] : undefined;
  const atlas = tint === "white" ? whiteCreatures : tint === "red" ? redCreatures : creatures;
  if (index === undefined || !atlas) return false;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(atlas, index * 96, 0, 96, 96, -48, -92, 96, 96);
  ctx.restore(); return true;
}
export function referenceCreatureUrl(skin: string): string {
  if (!hasReferenceCreature(skin) || typeof document === "undefined") return "";
  const cached = creatureThumbnails.get(skin); if (cached) return cached;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
  const painter = canvas.getContext("2d"); if (!painter) return "";
  painter.translate(48, 92); drawReferenceCreature(painter, skin, false);
  const url = canvas.toDataURL(); creatureThumbnails.set(skin, url); return url;
}

/** Selected mineral/rock examples from the reference sheets, bottom-centered. */
export function drawReferenceDeposit(ctx: CanvasRenderingContext2D, group: "mineral" | "rock", variant: number, x: number, y: number, size = 80): boolean {
  const atlas = group === "mineral" ? minerals : rocks;
  if (!atlas) return false;
  const count = group === "mineral" ? 10 : 8;
  const index = ((Math.floor(variant) % count) + count) % count;
  ctx.drawImage(atlas, index * 96, 0, 96, 96, Math.round(x - size / 2), Math.round(y - size), size, size);
  return true;
}

/** Six locally cropped bush variants, bottom-centered on the resource node. */
export function drawReferencePlant(ctx: CanvasRenderingContext2D, variant: number, x: number, y: number, size = 56): boolean {
  if (!plants) return false;
  const index = Math.max(0, Math.min(5, Math.floor(variant)));
  ctx.drawImage(plants, index * 64, 0, 64, 64, Math.round(x - size / 2), Math.round(y - size), size, size);
  return true;
}

/** Objects are bottom-centered, exactly like existing world sprites. */
export function drawReferenceObject(ctx: CanvasRenderingContext2D, name: ReferenceObject, x: number, y: number, scale = 0.75): boolean {
  const img = objects.get(name);
  if (!img) return false;
  const width = Math.round(img.naturalWidth * scale), height = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, Math.round(x - width / 2), Math.round(y - height), width, height);
  return true;
}
