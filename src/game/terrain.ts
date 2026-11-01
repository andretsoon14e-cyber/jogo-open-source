/* =========================================================
   Terrain renderer — bakes 16x16-tile chunks into canvases
   (pixel-art ground, organic edges, decor). Static world, so
   each chunk is painted once and reused: big FPS win.
   ========================================================= */

import { drawReferenceBridge, drawReferenceRipple, hasReferenceObject, type ReferenceBridge } from "@/game/reference-art";

export const T_WATER = 0, T_SAND = 1, T_GRASS = 2, T_DARK = 3, T_PATH = 4, T_ROCK = 5, T_CAVE = 6, T_BRIDGE = 7, T_SNOW = 8, T_ICE = 9, T_RUIN = 10, T_SNOW_PATH = 11, T_NECRO = 12, T_MINERAL = 13, T_AUTUMN = 14, T_BLOSSOM = 15;

export function tileHash(x: number, y: number, s: number) {
  let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

interface Pal { base: string; alt: string; dark: string; light: string }
const PAL: Record<number, Pal> = {
  [T_WATER]: { base: "#3f86b8", alt: "#3a7fb0", dark: "#2f6c9c", light: "#8ec9ea" },
  [T_SAND]: { base: "#e3d191", alt: "#dcc988", dark: "#c9b376", light: "#f3e6b2" },
  [T_GRASS]: { base: "#86ad4f", alt: "#7fa549", dark: "#5f8a3a", light: "#a3c662" },
  [T_DARK]: { base: "#3f6b3b", alt: "#396436", dark: "#2a4a2a", light: "#4f7f48" },
  [T_PATH]: { base: "#b99a67", alt: "#b2935f", dark: "#8f7248", light: "#cfb27e" },
  [T_ROCK]: { base: "#8d8678", alt: "#857e70", dark: "#6a6458", light: "#a8a192" },
  [T_CAVE]: { base: "#3b3744", alt: "#36323f", dark: "#262330", light: "#4c4858" },
  [T_BRIDGE]: { base: "#a87a48", alt: "#9e7040", dark: "#7a5430", light: "#c9a26a" },
  [T_SNOW]: { base: "#d4e4e3", alt: "#cfdfdf", dark: "#a9c2cb", light: "#eff7ee" },
  [T_ICE]: { base: "#67b1cd", alt: "#73c0d9", dark: "#4f8fae", light: "#b5ebef" },
  [T_RUIN]: { base: "#a29c86", alt: "#98947c", dark: "#777963", light: "#bbb5a0" },
  [T_SNOW_PATH]: { base: "#bdac87", alt: "#b5a481", dark: "#95815e", light: "#d3c7a7" },
  [T_NECRO]: { base: "#565e57", alt: "#505750", dark: "#343b3a", light: "#777b68" },
  [T_MINERAL]: { base: "#6c604f", alt: "#625747", dark: "#453f37", light: "#94836a" },
  [T_AUTUMN]: { base: "#a6a250", alt: "#9d994b", dark: "#777d3b", light: "#c6bc6a" },
  [T_BLOSSOM]: { base: "#9abf70", alt: "#93b568", dark: "#70974d", light: "#c1d994" },
};
// which terrain visually overlaps which (higher wins on borders)
const PRIO: Record<number, number> = { [T_WATER]: 0, [T_SAND]: 1, [T_PATH]: 2, [T_GRASS]: 3, [T_DARK]: 4, [T_ROCK]: 5, [T_CAVE]: 6, [T_BRIDGE]: 1.5, [T_SNOW]: 7, [T_ICE]: 6.5, [T_RUIN]: 2.5, [T_SNOW_PATH]: 3, [T_NECRO]: 7.5, [T_MINERAL]: 5.5, [T_AUTUMN]: 3, [T_BLOSSOM]: 3 };

interface BridgeRegion {
  x: number; y: number; width: number; height: number;
  tiles: { x: number; y: number }[]; art: ReferenceBridge;
  canvas?: HTMLCanvasElement;
}

/** Find crossings without changing terrain, RNG, resource indices or saves. */
export function collectBridgeRegions(tiles: Uint8Array, W: number, H: number): BridgeRegion[] {
  const seen = new Uint8Array(W * H), regions: BridgeRegion[] = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || tiles[start] !== T_BRIDGE) continue;
    const queue = [start], cells: { x: number; y: number }[] = [];
    seen[start] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0, waterNS = 0, waterEW = 0;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head], x = at % W, y = Math.floor(at / W);
      cells.push({ x, y });
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const next = ny * W + nx;
        if (tiles[next] === T_WATER) { if (dy) waterNS++; else waterEW++; }
        else if (tiles[next] === T_BRIDGE && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    // Dry foundations and unusual enormous merged crossings retain the normal
    // ground instead of stretching a bridge across unrelated constructions.
    const width = maxX - minX + 1, height = maxY - minY + 1;
    if (!waterNS && !waterEW || width > 14 || height > 14) continue;
    const horizontal = waterNS === waterEW ? width >= height : waterNS > waterEW;
    const stone = tileHash(minX, minY, 211) > 0.52;
    const art: ReferenceBridge = stone ? horizontal ? "bridge_stone_h" : "bridge_stone_v" : horizontal ? "bridge_wood_h" : "bridge_wood_v";
    regions.push({ x: minX, y: minY, width, height, tiles: cells, art });
  }
  return regions;
}

export class Terrain {
  private chunks = new Map<number, { cv: HTMLCanvasElement; last: number }>();
  private overview: HTMLCanvasElement | null = null;
  private bridges: BridgeRegion[];
  readonly CH = 16; // tiles per chunk side
  constructor(private tiles: Uint8Array, private W: number, private H: number, private TILE: number) {
    this.bridges = collectBridgeRegions(tiles, W, H);
    this.buildOverview();
  }

  private buildOverview() {
    // A tiny 1-pixel-per-tile overview avoids showing fake ocean while nearby
    // chunks are baked over several frames. It is only used as a placeholder.
    const { W, H, tiles } = this;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const image = ctx?.createImageData(W, H);
    if (!ctx || !image?.data) { this.overview = null; return; }
    const colors = Object.fromEntries(Object.entries(PAL).map(([id, p]) => {
      const rgb = parseInt(p.base.slice(1), 16);
      return [id, [rgb >> 16, (rgb >> 8) & 255, rgb & 255]];
    })) as Record<number, number[]>;
    for (let i = 0; i < W * H; i++) {
      const color = colors[tiles[i]] ?? colors[T_WATER];
      const at = i * 4;
      image.data[at] = color[0]; image.data[at + 1] = color[1]; image.data[at + 2] = color[2]; image.data[at + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.overview = canvas;
  }

  tile(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return T_WATER;
    return this.tiles[y * this.W + x];
  }

  invalidateAll() {
    this.chunks.clear(); this.bridges = collectBridgeRegions(this.tiles, this.W, this.H); this.buildOverview();
  }

  /** Bake each small crossing once, clipping it to actual traversable tiles.
   * A missing/disabled image leaves the ordinary terrain unchanged. */
  drawBridges(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number, ox: number, oy: number) {
    for (const bridge of this.bridges) {
      const x = bridge.x * this.TILE, y = bridge.y * this.TILE;
      const width = bridge.width * this.TILE, height = bridge.height * this.TILE;
      if (x + width < camX || y + height < camY || x > camX + viewW || y > camY + viewH) continue;
      if (!bridge.canvas) {
        if (!hasReferenceObject(bridge.art)) continue;
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const painter = canvas.getContext("2d");
        if (!painter) continue;
        painter.imageSmoothingEnabled = false;
        painter.beginPath();
        for (const tile of bridge.tiles) painter.rect((tile.x - bridge.x) * this.TILE, (tile.y - bridge.y) * this.TILE, this.TILE, this.TILE);
        painter.clip();
        if (!drawReferenceBridge(painter, bridge.art, 0, 0, width, height)) continue;
        bridge.canvas = canvas;
      }
      ctx.drawImage(bridge.canvas, x + ox, y + oy);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number, ox: number, oy: number, now: number) {
    const cpx = this.CH * this.TILE;
    const cx0 = Math.max(0, Math.floor(camX / cpx));
    const cy0 = Math.max(0, Math.floor(camY / cpx));
    const cx1 = Math.min(Math.ceil(this.W / this.CH) - 1, Math.floor((camX + viewW) / cpx));
    const cy1 = Math.min(Math.ceil(this.H / this.CH) - 1, Math.floor((camY + viewH) / cpx));
    let baked = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * 1000 + cx;
        let e = this.chunks.get(key);
        if (!e) {
          if (baked >= 2) { // spread baking across frames
            ctx.fillStyle = PAL[T_WATER].base;
            ctx.fillRect(cx * cpx + ox, cy * cpx + oy, cpx, cpx);
            if (this.overview) {
              const x = cx * this.CH, y = cy * this.CH;
              const w = Math.min(this.CH, this.W - x), h = Math.min(this.CH, this.H - y);
              if (w > 0 && h > 0) ctx.drawImage(this.overview, x, y, w, h, cx * cpx + ox, cy * cpx + oy, w * this.TILE, h * this.TILE);
            }
            continue;
          }
          e = { cv: this.bake(cx, cy), last: now };
          this.chunks.set(key, e);
          baked++;
        }
        e.last = now;
        ctx.drawImage(e.cv, cx * cpx + ox, cy * cpx + oy);
      }
    }
    if (this.chunks.size > 36) {
      const arr = [...this.chunks.entries()].sort((a, b) => a[1].last - b[1].last);
      for (let i = 0; i < arr.length - 28; i++) this.chunks.delete(arr[i][0]);
    }
  }

  private bake(cx: number, cy: number): HTMLCanvasElement {
    const T = this.TILE, CH = this.CH;
    const cv = document.createElement("canvas");
    cv.width = CH * T; cv.height = CH * T;
    const c = cv.getContext("2d");
    if (!c) return cv;
    const B = 4; // pixel block size
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const gx = cx * CH + tx, gy = cy * CH + ty;
        const t = this.tile(gx, gy);
        const p = PAL[t];
        const px = tx * T, py = ty * T;
        c.fillStyle = tileHash(gx, gy, 1) > 0.5 ? p.base : p.alt;
        c.fillRect(px, py, T, T);
        // pixel noise
        for (let i = 0; i < 5; i++) {
          const hx = Math.floor(tileHash(gx, gy, 10 + i) * (T / B)) * B;
          const hy = Math.floor(tileHash(gx, gy, 30 + i) * (T / B)) * B;
          const r = tileHash(gx, gy, 50 + i);
          c.fillStyle = r > 0.66 ? p.light : r > 0.33 ? p.dark : p.alt;
          c.globalAlpha = 0.55;
          c.fillRect(px + hx, py + hy, B * (r > 0.8 ? 2 : 1), B);
          c.globalAlpha = 1;
        }
        this.edges(c, gx, gy, t, px, py);
        this.decor(c, gx, gy, t, px, py);
      }
    }
    return cv;
  }

  private edges(c: CanvasRenderingContext2D, gx: number, gy: number, t: number, px: number, py: number) {
    const T = this.TILE, B = 4;
    const n = [this.tile(gx, gy - 1), this.tile(gx + 1, gy), this.tile(gx, gy + 1), this.tile(gx - 1, gy)];
    for (let side = 0; side < 4; side++) {
      const nt = n[side];
      if (nt === t) continue;
      if (t === T_WATER && nt !== T_WATER) {
        // foam + shallow line on the water side
        const seg = T / B;
        for (let i = 0; i < seg; i++) {
          const h = tileHash(gx * 4 + side, gy, 70 + i);
          const depth = h > 0.6 ? 2 : 1;
          c.fillStyle = h > 0.35 ? "#e7f3fa" : "#8ec9ea";
          if (side === 0) c.fillRect(px + i * B, py, B, B * depth);
          if (side === 2) c.fillRect(px + i * B, py + T - B * depth, B, B * depth);
          if (side === 3) c.fillRect(px, py + i * B, B * depth, B);
          if (side === 1) c.fillRect(px + T - B * depth, py + i * B, B * depth, B);
        }
        continue;
      }
      if (nt === T_WATER && t !== T_WATER && t !== T_BRIDGE) {
        // wet dark rim on land
        c.fillStyle = "rgba(40,60,70,0.22)";
        if (side === 0) c.fillRect(px, py, T, B);
        if (side === 2) c.fillRect(px, py + T - B, T, B);
        if (side === 3) c.fillRect(px, py, B, T);
        if (side === 1) c.fillRect(px + T - B, py, B, T);
        continue;
      }
      if (PRIO[nt] > PRIO[t] && nt !== T_WATER) {
        // neighbor bleeds into this tile with a jagged pixel edge
        const np = PAL[nt];
        const seg = T / B;
        for (let i = 0; i < seg; i++) {
          const h = tileHash(gx * 4 + side, gy * 3 + i, 90);
          const depth = h > 0.7 ? 2 : h > 0.25 ? 1 : 0;
          if (!depth) continue;
          c.fillStyle = h > 0.5 ? np.base : np.dark;
          if (side === 0) c.fillRect(px + i * B, py, B, B * depth);
          if (side === 2) c.fillRect(px + i * B, py + T - B * depth, B, B * depth);
          if (side === 3) c.fillRect(px, py + i * B, B * depth, B);
          if (side === 1) c.fillRect(px + T - B * depth, py + i * B, B * depth, B);
        }
      }
    }
  }

  private decor(c: CanvasRenderingContext2D, gx: number, gy: number, t: number, px: number, py: number) {
    const T = this.TILE;
    const h = tileHash(gx, gy, 3);
    if (t === T_GRASS || t === T_DARK || t === T_AUTUMN || t === T_BLOSSOM) {
      const dark = t === T_DARK;
      const n = dark ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x = px + 2 + Math.floor(tileHash(gx, gy, 11 + i) * (T - 8));
        const y = py + 4 + Math.floor(tileHash(gx, gy, 21 + i) * (T - 12));
        const r = tileHash(gx, gy, 31 + i);
        c.fillStyle = dark ? (r > 0.5 ? "#2a4a2a" : "#4f7f48") : r > 0.66 ? "#a3c662" : r > 0.33 ? "#5f8a3a" : "#6fa044";
        // tuft: three blades
        c.fillRect(x, y + 2, 2, 5);
        c.fillRect(x - 2, y + 4, 2, 3);
        c.fillRect(x + 2, y + 3, 2, 4);
        c.fillRect(x, y, 2, 2);
      }
      if (!dark && h > 0.88) {
        // flower cluster like the reference (3 yellow blossoms)
        const fx = px + 6 + Math.floor(tileHash(gx, gy, 41) * 14);
        const fy = py + 6 + Math.floor(tileHash(gx, gy, 42) * 12);
        const col = t === T_BLOSSOM ? "#f2b6cf" : t === T_AUTUMN ? "#edbb66" : h > 0.965 ? "#f7f4ee" : h > 0.93 ? "#e58ab8" : "#f2d24a";
        for (let k = 0; k < 3; k++) {
          const ox = [0, 6, 3][k], oy = [0, 2, 7][k];
          c.fillStyle = "#4f8a30";
          c.fillRect(fx + ox + 1, fy + oy + 3, 2, 4);
          c.fillStyle = col;
          c.fillRect(fx + ox, fy + oy, 4, 4);
          c.fillStyle = "#b8862a";
          c.fillRect(fx + ox + 1, fy + oy + 1, 2, 2);
        }
      }
      if (dark && h > 0.86) {
        // mushroom
        const mx = px + 8 + Math.floor(tileHash(gx, gy, 43) * 14);
        const my = py + 10 + Math.floor(tileHash(gx, gy, 44) * 10);
        c.fillStyle = "#e8dcc8"; c.fillRect(mx + 2, my + 4, 3, 4);
        c.fillStyle = h > 0.93 ? "#d04040" : "#c98a3a"; c.fillRect(mx, my, 7, 4);
        c.fillStyle = "#fff0e0"; c.fillRect(mx + 1, my + 1, 2, 1); c.fillRect(mx + 4, my + 2, 1, 1);
      }
    } else if (t === T_SNOW || t === T_SNOW_PATH) {
      if (h > 0.67) {
        const x = px + 4 + Math.floor(tileHash(gx, gy, 41) * 18);
        const y = py + 7 + Math.floor(tileHash(gx, gy, 42) * 15);
        c.fillStyle = "#b3cbd1"; c.fillRect(x, y, 8, 3);
        c.fillStyle = "#f3f9ef"; c.fillRect(x - 2, y - 2, 9, 3);
      }
      if (h > 0.95) {
        c.fillStyle = "#7da3ac"; c.fillRect(px + 8, py + 21, 3, 3); c.fillRect(px + 14, py + 17, 3, 3);
        c.fillStyle = "#edf4e9"; c.fillRect(px + 7, py + 20, 3, 1);
      }
    } else if (t === T_ICE) {
      c.strokeStyle = "#a5e5ed"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(px, py + 4); c.lineTo(px + 10, py + 15); c.lineTo(px + 19, py + 12); c.lineTo(px + 32, py + 26); c.stroke();
      c.beginPath(); c.moveTo(px + 19, py + 12); c.lineTo(px + 23, py); c.stroke();
      if (h > 0.75) {
        c.strokeStyle = "#467a9d"; c.beginPath(); c.moveTo(px + 4, py + 28); c.lineTo(px + 14, py + 21); c.lineTo(px + 24, py + 29); c.stroke();
      }
      c.fillStyle = "#e0fbf7"; c.fillRect(px + 6, py + 7, 5, 2);
    } else if (t === T_RUIN || t === T_NECRO) {
      c.strokeStyle = t === T_NECRO ? "#2e3537" : "#7b816a"; c.lineWidth = 2;
      c.strokeRect(px + 1, py + 1, 14, 13); c.strokeRect(px + 17, py + 1, 13, 13);
      c.strokeRect(px + 1, py + 17, 29, 13);
      if (h > 0.55) {c.fillStyle = t === T_NECRO ? "#7a252d" : "#71934d"; c.fillRect(px, py + 14, 5, 3);c.fillRect(px + 23, py, 4, 5);}
      if (t === T_NECRO && h > 0.86) { c.fillStyle="#76bd55";c.fillRect(px+12,py+20,3,3);c.fillStyle="#b7e76f";c.fillRect(px+13,py+19,1,2); }
    } else if (t === T_PATH) {
      for (let i = 0; i < 3; i++) {
        const r = tileHash(gx, gy, 61 + i);
        if (r < 0.45) continue;
        const x = px + 2 + Math.floor(tileHash(gx, gy, 71 + i) * (T - 8));
        const y = py + 2 + Math.floor(tileHash(gx, gy, 81 + i) * (T - 6));
        c.fillStyle = r > 0.75 ? "#cfb27e" : "#8f7248";
        c.fillRect(x, y, r > 0.9 ? 6 : 4, 3);
      }
      if (h > 0.9) { c.fillStyle = "#6fa044"; c.fillRect(px + 20, py + 22, 2, 4); c.fillRect(px + 23, py + 23, 2, 3); }
    } else if (t === T_SAND) {
      if (h > 0.6) { c.fillStyle = h > 0.85 ? "#cbb48a" : "#f3e6b2"; c.fillRect(px + Math.floor(h * 22), py + Math.floor((1 - h) * 18), h > 0.9 ? 6 : 3, 3); }
      if (h > 0.94) { c.fillStyle = "#f7f3e8"; c.fillRect(px + 14, py + 12, 5, 3); c.fillStyle = "#d9b7a0"; c.fillRect(px + 15, py + 13, 3, 1); }
    } else if (t === T_ROCK || t === T_CAVE || t === T_MINERAL) {
      if (h > 0.55) {
        c.fillStyle = t === T_CAVE ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.18)";
        c.fillRect(px + 4 + Math.floor(h * 8), py + 12, 10, 2);
        c.fillRect(px + 14, py + 6, 2, 8);
      }
      if ((t === T_CAVE || t === T_MINERAL) && h > 0.9) { c.fillStyle = "#6fd3dc"; c.fillRect(px + 20, py + 20, 3, 3); c.fillStyle = "#b070f0"; c.fillRect(px + 8, py + 24, 2, 2); }
      if (t === T_ROCK && h > 0.86) { c.fillStyle = "#a8a192"; c.fillRect(px + 6, py + 20, 6, 4); c.fillStyle = "#6a6458"; c.fillRect(px + 6, py + 23, 6, 1); }
    } else if (t === T_WATER) {
      if (h > 0.82) { c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(px + 6, py + 14, 10, 2); }
      if (h < 0.12) { c.fillStyle = "rgba(0,20,50,0.18)"; c.fillRect(px + 10, py + 6, 12, 3); }
    } else if (t === T_BRIDGE) {
      c.fillStyle = "#7a5430";
      for (let k = 0; k < 4; k++) c.fillRect(px, py + k * 8 + 6, T, 2);
      c.fillStyle = "#c9a26a"; c.fillRect(px + 2, py + 2, 4, 2); c.fillRect(px + 24, py + 18, 4, 2);
    }
  }
}

/** Lightweight, time-based current and rolling crests, drawn only on water.
 * The static terrain remains cached and bridge tiles are never overpainted. */
export function drawWaterAnim(ctx: CanvasRenderingContext2D, tiles: Uint8Array, W: number, H: number, TILE: number, x0: number, y0: number, x1: number, y1: number, ox: number, oy: number, now: number, referenceArt = false) {
  ctx.fillStyle = "rgba(215,246,255,0.32)";
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tiles[ty * W + tx] !== T_WATER) continue;
    const phase = now * 1.8 + tx * 0.8 + ty * 0.48;
    const flow = ((Math.floor(now * 10 + tx * 7 + ty * 3) % 22) + 22) % 22;
    const x = tx * TILE + ox, y = ty * TILE + oy;
    // A three-step crest rises and falls as it travels down the current. All
    // pieces remain inside the tile, including at the banks.
    const crest = 5 + Math.round((Math.sin(phase) + 1) * 3);
    ctx.fillRect(x + 2 + flow, y + crest, 5, 2);
    ctx.fillRect(x + 5 + flow, y + crest - 1, 5, 2);
    if (Math.sin(phase + 1.2) > -0.25) {
      const next = (flow + 11) % 21;
      ctx.fillRect(x + 2 + next, y + 21, 7, 2);
      ctx.fillRect(x + 5 + next, y + 20, 5, 1);
    }
    // Sparse supplied ripple frames add a second layer without allocating
    // canvases or updating the baked terrain per frame.
    if (referenceArt && tileHash(tx, ty, 91) > 0.91) drawReferenceRipple(ctx, now * 4 + tx + ty, x + TILE / 2, y + TILE / 2);
  }
}
