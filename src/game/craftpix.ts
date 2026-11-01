/** Optional, locally imported CraftPix atlases. No assets are bundled in Git. */
import type { View } from "./sprites";

type Action = "idle" | "walk" | "run" | "attack";
type MonsterAction = "idle" | "walk" | "attack";
type Plant = "tree" | "fruit" | "palm" | "bush" | "crate";

export interface CraftPixStatus { hero: boolean; orcs: boolean; plants: boolean; }
const status: CraftPixStatus = { hero: false, orcs: false, plants: false };
const heroes: HTMLImageElement[] = [];
let rianHero: HTMLCanvasElement | null = null;
const villagerHeroes: HTMLCanvasElement[] = [];
const orcs: HTMLImageElement[] = [];
let plants: HTMLImageElement | null = null;
let buildings: HTMLImageElement | null = null;
let villageReady = false, towerReady = false;
let loading: Promise<CraftPixStatus> | null = null;

function image(name: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const result = new Image();
    result.onload = () => result.naturalWidth === width && result.naturalHeight === height ? resolve(result) : reject(new Error(`Atlas inválido: ${name}`));
    result.onerror = () => reject(new Error(`Atlas indisponível: ${name}`));
    result.src = `/craftpix/${name}.png`;
  });
}

/** Recolor the supplied hero's hair once for Rian; the animation and outline
 * remain the same. Fixed exact-color replacements avoid touching skin tones. */
function makeRianHero(source: HTMLImageElement): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const replacements: Record<number, [number, number, number]> = {
      0x4d3945: [35, 57, 72], 0x684f5a: [51, 84, 100], 0x3b2c33: [24, 37, 49],
      0x876c7d: [83, 114, 126], 0x2b2023: [18, 29, 39],
    };
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      const replacement = replacements[(pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2]];
      if (replacement) { pixels.data[i] = replacement[0]; pixels.data[i + 1] = replacement[1]; pixels.data[i + 2] = replacement[2]; }
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  } catch { return null; }
}

/** Reuse the unarmed, plainly dressed level-one body/head already supplied in
 * the pack. Only palette shades change; no weapons, silhouettes or new art are
 * introduced. Atlases are prepared once, never recolored on each frame. */
function makeVillagerHeroes(source: HTMLImageElement): HTMLCanvasElement[] {
  const hair = [0x2b2023, 0x3b2c33, 0x4d3945, 0x684f5a, 0x876c7d];
  const cloth = [0x2d312b, 0x3f433d, 0x5e615a, 0x6f736a, 0x868b7c, 0xa0a387];
  const variants = [
    { hair: [0x29201e, 0x4c332b, 0x674539, 0x8a604a, 0xb18365], cloth: [0x303a31, 0x465b42, 0x65835a, 0x78996a, 0x9db588, 0xbac9a4] },
    { hair: [0x241d1b, 0x3c3028, 0x5b4634, 0x806648, 0xa98a65], cloth: [0x40302e, 0x63433c, 0x875b4b, 0xa2725b, 0xbf9475, 0xd2b596] },
    { hair: [0x252027, 0x42323d, 0x654b5a, 0x8c6f7b, 0xb29498], cloth: [0x2b353b, 0x3c505b, 0x587282, 0x698a97, 0x89a8ae, 0xacbfbd] },
    { hair: [0x211d1a, 0x362c22, 0x524331, 0x76644a, 0x9c8662], cloth: [0x3a3530, 0x554c3b, 0x796d50, 0x92835f, 0xb2a37e, 0xcab999] },
    { hair: [0x251d1b, 0x4a3027, 0x6c4331, 0x945f40, 0xbc8963], cloth: [0x362f39, 0x55445b, 0x765f7c, 0x907592, 0xac95ae, 0xc6b3c1] },
  ];
  return variants.flatMap((palette) => {
    try {
      const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth; canvas.height = 512;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];
      ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colors = new Map<number, number>([...hair.map((color, i): [number, number] => [color, palette.hair[i]]), ...cloth.map((color, i): [number, number] => [color, palette.cloth[i]])]);
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (!pixels.data[i + 3]) continue;
        const replacement = colors.get((pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2]);
        if (replacement !== undefined) { pixels.data[i] = replacement >> 16; pixels.data[i + 1] = (replacement >> 8) & 255; pixels.data[i + 2] = replacement & 255; }
      }
      ctx.putImageData(pixels, 0, 0);
      return [canvas];
    } catch { return []; }
  });
}

/** Each pack can fail independently; missing/corrupt art always falls back. */
export function loadCraftPix(): Promise<CraftPixStatus> {
  if (typeof window === "undefined" || typeof Image === "undefined" || typeof fetch === "undefined") return Promise.resolve({ ...status });
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch("/craftpix/manifest.json", { cache: "no-cache" });
      if (!response.ok) return { ...status };
      const manifest: unknown = await response.json();
      if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== 1) return { ...status };
      const flags = manifest as { hero?: unknown; orcs?: unknown; plants?: unknown; village?: unknown; tower?: unknown };
      const tasks: Promise<void>[] = [];
      if (flags.hero === true) tasks.push(Promise.all([1, 2, 3].map((n) => image(`hero-${n}`, 384, 1088))).then((loaded) => {
        heroes.splice(0, heroes.length, ...loaded); rianHero = makeRianHero(loaded[1]);
        villagerHeroes.splice(0, villagerHeroes.length, ...makeVillagerHeroes(loaded[0])); status.hero = true;
      }).catch(() => {}));
      if (flags.orcs === true) tasks.push(Promise.all([1, 2, 3].map((n) => image(`orc-${n}`, 512, 768))).then((loaded) => {
        orcs.splice(0, orcs.length, ...loaded); status.orcs = true;
      }).catch(() => {}));
      if (flags.plants === true) tasks.push(image("world", 256, 70).then((loaded) => {
        plants = loaded; status.plants = true;
      }).catch(() => {}));
      if (flags.village === true || flags.tower === true) tasks.push(image("buildings", 640, 290).then((loaded) => {
        buildings = loaded; villageReady = flags.village === true; towerReady = flags.tower === true;
      }).catch(() => {}));
      await Promise.all(tasks);
      window.dispatchEvent(new Event("craftpix-ready"));
    } catch { /* optional assets: keep procedural sprites */ }
    return { ...status };
  })();
  return loading;
}

export function craftPixStatus(): CraftPixStatus { return { ...status }; }
export function hasCraftHero(): boolean { return status.hero; }
export function hasCraftOrcs(): boolean { return status.orcs; }
export function hasCraftVillage(): boolean { return villageReady; }
export function hasCraftTower(): boolean { return towerReady; }

/** Fallback buildings from the optional village and tower packs. The original
 * examples remain separate from the player's reference-house variants. */
export function drawCraftVillageHouse(ctx: CanvasRenderingContext2D, index: number, x: number, y: number): boolean {
  if (!buildings || !villageReady) return false;
  const cell = ((index % 4) + 4) % 4;
  ctx.drawImage(buildings, cell * 160, 0, 160, 160, x - 160, y - 320, 320, 320);
  return true;
}
export function drawCraftTower(ctx: CanvasRenderingContext2D, x: number, y: number): boolean {
  if (!buildings || !towerReady) return false;
  ctx.drawImage(buildings, 0, 160, 70, 130, x - 70, y - 260, 140, 260);
  return true;
}

function mod(n: number, count: number) { return ((n % count) + count) % count; }
function progressFrame(progress: number, count: number) {
  return Math.min(count - 1, Math.max(0, Math.floor(progress * count)));
}

/** Hero rows are front/left/right/back. The back idle contains four frames. */
export function heroFrame(view: View, flip: boolean, action: Action, cycle: number, idleTime: number, attackProgress = 0) {
  const row = view === "down" ? 0 : view === "up" ? 3 : flip ? 1 : 2;
  const actionIndex = action === "idle" ? 0 : action === "walk" ? 1 : action === "run" ? 2 : 3;
  const count = action === "idle" ? (row === 3 ? 4 : 12) : action === "walk" ? 6 : 8;
  const frame = action === "attack" ? progressFrame(attackProgress, count) : mod(Math.floor(action === "idle" ? idleTime * 6 : cycle * 0.7), count);
  return { x: frame * 32, y: (actionIndex * 4 + row) * 32 };
}

/** Orc rows are front/back/right/left, not the same order as the hero. */
export function orcFrame(view: View, flip: boolean, action: MonsterAction, time: number, attackProgress = 0) {
  const row = view === "down" ? 0 : view === "up" ? 1 : flip ? 3 : 2;
  const actionIndex = action === "idle" ? 0 : action === "walk" ? 1 : 2;
  const count = action === "idle" ? 4 : action === "walk" ? 6 : 8;
  const frame = action === "attack" ? progressFrame(attackProgress, count) : mod(Math.floor(time * (action === "idle" ? 5 : 8)), count);
  return { x: frame * 64, y: (actionIndex * 4 + row) * 64 };
}

/** Coordinates are relative to the feet; original pixels are never smoothed. */
export function drawCraftHero(ctx: CanvasRenderingContext2D, view: View, flip: boolean, level: number, action: Action, cycle: number, attackProgress: number, scale: number, sword = false, variant: "player" | "rian" = "player"): boolean {
  const atlas = variant === "rian" ? (rianHero ?? heroes[1]) : heroes[Math.min(3, Math.max(1, Math.floor(level))) - 1];
  if (!atlas) return false;
  const frame = heroFrame(view, flip, action, cycle, performance.now() / 1000, attackProgress);
  if (sword && action === "attack") {
    const row = Math.floor(frame.y / 32) % 4, column = frame.x / 32;
    // The 48px crop preserves the full original sword and slash effect. The
    // same source pixel (32,44) remains anchored at the character's feet.
    ctx.drawImage(atlas, column * 48, 896 + row * 48, 48, 48, -24 * scale, -36 * scale, 48 * scale, 48 * scale);
  } else {
    ctx.drawImage(atlas, frame.x, frame.y + (sword ? 512 : 0), 32, 32, -16 * scale, -28 * scale, 32 * scale, 32 * scale);
  }
  return true;
}

/** Villager feet use the same anchor as the hero and a distance-based walk cycle. */
export function drawCraftVillager(ctx: CanvasRenderingContext2D, view: View, flip: boolean, index: number, walking: boolean, cycle: number, idleTime: number, scale = 3): boolean {
  const atlas = villagerHeroes[mod(index, villagerHeroes.length || 1)];
  if (!atlas) return false;
  const frame = heroFrame(view, flip, walking ? "walk" : "idle", cycle, idleTime);
  ctx.drawImage(atlas, frame.x, frame.y, 32, 32, -16 * scale, -28 * scale, 32 * scale, 32 * scale);
  return true;
}

const orcTintCache = new Map<string, HTMLCanvasElement>();
function tintOrc(atlas: HTMLImageElement, variant: number, x: number, y: number, tint: string): HTMLCanvasElement | null {
  const key = `${variant}:${x}:${y}:${tint}`;
  const cached = orcTintCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
  const painter = canvas.getContext("2d");
  if (!painter) return null;
  painter.imageSmoothingEnabled = false;
  painter.drawImage(atlas, x, y, 64, 64, 0, 0, 64, 64);
  painter.globalCompositeOperation = "source-in";
  painter.fillStyle = tint; painter.fillRect(0, 0, 64, 64);
  // Bound the memory spent on flashing frames in long sessions.
  if (orcTintCache.size >= 64) {
    const oldest = orcTintCache.keys().next().value;
    if (oldest !== undefined) orcTintCache.delete(oldest);
  }
  orcTintCache.set(key, canvas);
  return canvas;
}

export function drawCraftOrc(ctx: CanvasRenderingContext2D, variant: number, view: View, flip: boolean, action: MonsterAction, time: number, attackProgress: number, tint?: string): boolean {
  const tier = Math.min(3, Math.max(1, Math.floor(variant)));
  const atlas = orcs[tier - 1];
  if (!atlas) return false;
  const frame = orcFrame(view, flip, action, time, attackProgress);
  const scale = 3;
  if (tint) {
    const mask = tintOrc(atlas, tier, frame.x, frame.y, tint);
    if (mask) ctx.drawImage(mask, -32 * scale, -42 * scale, 64 * scale, 64 * scale);
  } else ctx.drawImage(atlas, frame.x, frame.y, 64, 64, -32 * scale, -42 * scale, 64 * scale, 64 * scale);
  return true;
}

const plantBounds: Record<Plant, { x: number; w: number; h: number }> = {
  tree: { x: 0, w: 64, h: 66 }, fruit: { x: 64, w: 64, h: 59 }, palm: { x: 128, w: 64, h: 70 },
  bush: { x: 192, w: 32, h: 22 }, crate: { x: 224, w: 32, h: 32 },
};
const plantBase = new Map<string, HTMLCanvasElement>();
const plantBends = new Map<string, { canvas: HTMLCanvasElement; padding: number }>();

/** Cached, anchored bends for trees; one untransformed draw per frame. */
export function drawCraftPlant(ctx: CanvasRenderingContext2D, name: Plant, x: number, y: number, bend = 0, flip = false, alpha = 1): boolean {
  if (!plants) return false;
  const { x: sourceX, w, h } = plantBounds[name];
  const baseKey = `${name}:${flip ? 1 : 0}`;
  let base = plantBase.get(baseKey);
  if (!base) {
    base = document.createElement("canvas"); base.width = w * 2; base.height = h * 2;
    const painter = base.getContext("2d");
    if (!painter) return false;
    painter.imageSmoothingEnabled = false;
    if (flip) { painter.translate(base.width, 0); painter.scale(-1, 1); }
    painter.drawImage(plants, sourceX, 0, w, h, 0, 0, base.width, base.height);
    plantBase.set(baseKey, base);
  }
  const frame = Math.max(-6, Math.min(6, Math.round(bend / 0.012)));
  const key = `${baseKey}:${frame}`;
  let variant = plantBends.get(key);
  if (!variant) {
    const shear = frame * 0.012;
    const padding = Math.ceil(Math.abs(shear) * base.height) + 1;
    const canvas = document.createElement("canvas"); canvas.width = base.width + padding * 2; canvas.height = base.height;
    const painter = canvas.getContext("2d");
    if (!painter) return false;
    painter.imageSmoothingEnabled = false;
    painter.setTransform(1, 0, shear, 1, padding - shear * base.height, 0);
    painter.drawImage(base, 0, 0);
    variant = { canvas, padding }; plantBends.set(key, variant);
  }
  const previous = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(variant.canvas, Math.round(x - w) - variant.padding, Math.round(y - h * 2));
  ctx.globalAlpha = previous;
  return true;
}

/** Browser-only thumbnail for the new bestiary entry. */
export function craftOrcThumbnail(): string {
  if (!orcs[1]) return "";
  const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  // The original 64px cell has wide transparent margins around the orc.
  ctx.drawImage(orcs[1], 8, 8, 40, 40, 0, 0, 120, 120);
  return canvas.toDataURL();
}
