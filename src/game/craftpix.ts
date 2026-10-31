/** Optional, locally imported CraftPix atlases. No assets are bundled in Git. */
import type { View } from "./sprites";

type Action = "idle" | "walk" | "run" | "attack";
type MonsterAction = "idle" | "walk" | "attack";
type Plant = "tree" | "fruit" | "palm" | "bush" | "crate";

export interface CraftPixStatus { hero: boolean; orcs: boolean; plants: boolean; }
const status: CraftPixStatus = { hero: false, orcs: false, plants: false };
const heroes: HTMLImageElement[] = [];
const orcs: HTMLImageElement[] = [];
let plants: HTMLImageElement | null = null;
let loading: Promise<CraftPixStatus> | null = null;

function image(name: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const result = new Image();
    result.onload = () => result.naturalWidth === width && result.naturalHeight === height ? resolve(result) : reject(new Error(`Atlas inválido: ${name}`));
    result.onerror = () => reject(new Error(`Atlas indisponível: ${name}`));
    result.src = `/craftpix/${name}.png`;
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
      const flags = manifest as { hero?: unknown; orcs?: unknown; plants?: unknown };
      const tasks: Promise<void>[] = [];
      if (flags.hero === true) tasks.push(Promise.all([1, 2, 3].map((n) => image(`hero-${n}`, 384, 1088))).then((loaded) => {
        heroes.splice(0, heroes.length, ...loaded); status.hero = true;
      }).catch(() => {}));
      if (flags.orcs === true) tasks.push(Promise.all([1, 2, 3].map((n) => image(`orc-${n}`, 512, 768))).then((loaded) => {
        orcs.splice(0, orcs.length, ...loaded); status.orcs = true;
      }).catch(() => {}));
      if (flags.plants === true) tasks.push(image("world", 256, 70).then((loaded) => {
        plants = loaded; status.plants = true;
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
export function drawCraftHero(ctx: CanvasRenderingContext2D, view: View, flip: boolean, level: number, action: Action, cycle: number, attackProgress: number, scale: number, sword = false): boolean {
  const atlas = heroes[Math.min(3, Math.max(1, Math.floor(level))) - 1];
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
