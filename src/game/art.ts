type ToolKey = "axe" | "pick" | "sword";

export type HairStyle = "short" | "messy" | "long" | "pony" | "bun" | "bald" | "cap";
export type Extra = "none" | "apron" | "cloak" | "vest" | "scarf";

export interface Look {
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  trim: string;
  pants: string;
  boots: string;
  beard?: string;
  extra?: Extra;
}

export const LOOKS: Record<string, Look> = {
  player: { skin: "#e7b98a", hair: "#3a2414", style: "messy", shirt: "#3c74b0", trim: "#e2c27a", pants: "#4a3828", boots: "#2a1e14", extra: "scarf" },
  rian: { skin: "#d09a6c", hair: "#1a120e", style: "short", shirt: "#e09a32", trim: "#6b3a18", pants: "#3c4a36", boots: "#241c14", beard: "#2a1c12", extra: "vest" },
  maya: { skin: "#e0b184", hair: "#1c1410", style: "pony", shirt: "#2f8f84", trim: "#1c4e48", pants: "#3a3228", boots: "#221910", extra: "cloak" },
  tito: { skin: "#efc7a2", hair: "#6a4524", style: "cap", shirt: "#e0c15a", trim: "#8a6428", pants: "#5a5148", boots: "#3a3024", extra: "vest" },
  bren: { skin: "#c88860", hair: "#4a1e14", style: "short", shirt: "#8d3030", trim: "#2a2a2a", pants: "#2c2c2c", boots: "#161616", beard: "#3a1a12", extra: "apron" },
  remote: { skin: "#e2b48a", hair: "#243044", style: "short", shirt: "#4c86c9", trim: "#d0d8e4", pants: "#343a44", boots: "#22262c" },
  v0: { skin: "#c9956a", hair: "#4a3020", style: "bun", shirt: "#c45a4a", trim: "#f0d2a8", pants: "#5a4030", boots: "#3a281c" },
  v1: { skin: "#e8c4a0", hair: "#2a3344", style: "long", shirt: "#6a8cae", trim: "#e8e0d0", pants: "#3e4a55", boots: "#2a3038" },
  v2: { skin: "#d7a574", hair: "#5a3a18", style: "messy", shirt: "#7ea04a", trim: "#efe6c8", pants: "#4a4030", boots: "#322818" },
  v3: { skin: "#efc8ae", hair: "#6a3058", style: "pony", shirt: "#c46a92", trim: "#f3d0e0", pants: "#4a3848", boots: "#322028" },
  v4: { skin: "#b8875c", hair: "#d8d0c8", style: "bald", shirt: "#7a5a9a", trim: "#e6dcc8", pants: "#3a3844", boots: "#222028", beard: "#c8c0b4" },
};

export function tileHash(x: number, y: number, s: number) {
  let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f)) | 0;
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f)) | 0;
  const b = Math.max(0, Math.min(255, (n & 255) * f)) | 0;
  return `rgb(${r},${g},${b})`;
}

export function metalOf(level: number) {
  if (level >= 5) return { blade: "#8eeff6", edge: "#f4ffff", wrap: "#1c4a52", glow: "rgba(125,224,232,0.85)" };
  if (level >= 4) return { blade: "#d5dce8", edge: "#fff", wrap: "#6a5420", glow: "rgba(255,210,120,0.55)" };
  if (level >= 3) return { blade: "#c5ced8", edge: "#f4f7fb", wrap: "#4a4038", glow: "" };
  if (level >= 2) return { blade: "#b08a55", edge: "#f0d0a0", wrap: "#5a4030", glow: "" };
  return { blade: "#8a8a8a", edge: "#d0d0d0", wrap: "#6b4a28", glow: "" };
}

/** Ground tufts, flowers and pebbles. Deterministic, no allocations in hot path beyond the loop. */
export function drawGroundDecor(
  c: CanvasRenderingContext2D,
  tiles: Uint8Array,
  W: number,
  x0: number, y0: number, x1: number, y1: number,
  ox: number, oy: number,
  TILE: number,
) {
  const T_SAND = 1, T_GRASS = 2, T_DARK = 3, T_PATH = 4, T_ROCK = 5, T_CAVE = 6;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tiles[ty * W + tx];
      if (t === 0) continue;
      const px = tx * TILE + ox;
      const py = ty * TILE + oy;
      const h = tileHash(tx, ty, 3);
      if (t === T_GRASS || t === T_DARK || t === T_PATH) {
        const n = t === T_PATH ? 1 : t === T_DARK ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const hx = tileHash(tx, ty, 11 + i);
          const hy = tileHash(tx, ty, 21 + i);
          const tall = 4 + tileHash(tx, ty, 31 + i) * 7;
          c.fillStyle = t === T_DARK
            ? (hx > 0.5 ? "#1b3820" : "#2a5230")
            : t === T_PATH
              ? "#7d8a48"
              : hx > 0.66 ? "#62b04e" : hx > 0.33 ? "#3f8638" : "#2f6c2c";
          const bx = px + 2 + hx * 24;
          const by = py + 4 + hy * 18;
          c.fillRect(bx, by, 1.6, tall);
          c.fillRect(bx + (hy > 0.5 ? 1.4 : -1.2), by - 1, 1.6, 2.4);
        }
        if (t === T_GRASS && h > 0.9) {
          const fx = px + 6 + h * 16;
          const fy = py + 8 + (1 - h) * 10;
          c.fillStyle = "#3f8638";
          c.fillRect(fx + 1, fy + 2, 1.4, 5);
          c.fillStyle = h > 0.97 ? "#f2e27a" : h > 0.94 ? "#e07aa8" : "#f7f4ee";
          c.beginPath();
          c.arc(fx + 1.5, fy + 1.5, 2.2, 0, Math.PI * 2);
          c.fill();
        }
        if (t === T_DARK && h > 0.82) {
          c.fillStyle = "#4a3020";
          c.fillRect(px + h * 20, py + 16, 5, 2);
        }
      } else if (t === T_SAND) {
        if (h > 0.62) {
          c.fillStyle = h > 0.85 ? "#cbb48a" : "#f0e2b4";
          c.fillRect(px + h * 22, py + (1 - h) * 18, h > 0.9 ? 4 : 2.5, 2);
        }
        if (h > 0.93) {
          c.strokeStyle = "rgba(255,255,255,0.35)";
          c.lineWidth = 1;
          c.beginPath();
          c.arc(px + 18, py + 12, 3, 0.2, 2.4);
          c.stroke();
        }
      } else if (t === T_ROCK || t === T_CAVE) {
        if (h > 0.55) {
          c.fillStyle = t === T_CAVE ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.16)";
          c.fillRect(px + 4 + h * 8, py + 12, 10, 1.5);
          c.fillRect(px + 14, py + 6, 1.5, 8);
        }
      }
    }
  }
}

export function drawFoliage(
  c: CanvasRenderingContext2D,
  x: number, y: number,
  kind: "tree" | "pine",
  sway: number,
  dark: boolean,
  seed: number,
) {
  const s = 0.86 + (seed % 5) * 0.05;
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.beginPath();
  c.ellipse(x + 2, y + 6, 18 * s, 7, 0, 0, Math.PI * 2);
  c.fill();

  // roots
  c.fillStyle = dark ? "#4a321c" : "#6a4828";
  c.beginPath();
  c.moveTo(x - 3, y + 2); c.lineTo(x - 12 * s, y + 6); c.lineTo(x - 2, y + 5); c.fill();
  c.beginPath();
  c.moveTo(x + 3, y + 2); c.lineTo(x + 11 * s, y + 7); c.lineTo(x + 2, y + 5); c.fill();

  // trunk
  const trunk = dark ? "#5a3a22" : "#7a5230";
  const trunkHi = dark ? "#7a5434" : "#a87448";
  c.fillStyle = trunk;
  c.beginPath();
  c.moveTo(x - 5 * s, y + 4);
  c.lineTo(x - 3.5 * s + sway * 0.15, y - 26);
  c.lineTo(x + 3.5 * s + sway * 0.15, y - 26);
  c.lineTo(x + 5 * s, y + 4);
  c.closePath();
  c.fill();
  c.fillStyle = trunkHi;
  c.fillRect(x - 1 + sway * 0.1, y - 24, 2, 26);
  c.strokeStyle = "rgba(40,20,8,0.35)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - 2, y - 4); c.lineTo(x - 2.5, y - 18);
  c.moveTo(x + 2, y); c.lineTo(x + 1.5, y - 16);
  c.stroke();

  if (kind === "pine") {
    const cols = dark ? ["#16321c", "#1e4426", "#275832"] : ["#1e4e28", "#2c6a34", "#3c8840"];
    for (let i = 0; i < 4; i++) {
      const yy = y - 22 - i * 11 + sway * 0.2;
      const w = (20 - i * 3.2) * s;
      c.fillStyle = cols[i % 3];
      c.beginPath();
      c.moveTo(x + sway * (0.4 + i * 0.08), yy - 14);
      c.lineTo(x - w + sway * 0.2, yy + 4);
      c.lineTo(x + w + sway * 0.2, yy + 4);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.08)";
      c.beginPath();
      c.moveTo(x + sway * 0.4, yy - 12);
      c.lineTo(x - w * 0.35, yy + 2);
      c.lineTo(x + 2, yy + 2);
      c.closePath();
      c.fill();
    }
    if (dark) {
      c.strokeStyle = "rgba(90,110,70,0.55)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x - 6, y - 30); c.lineTo(x - 8, y - 16);
      c.moveTo(x + 7, y - 36); c.lineTo(x + 9, y - 20);
      c.stroke();
    }
    return;
  }

  const leaf = dark ? "#1d4a28" : "#2f7a32";
  const leafMid = dark ? "#276036" : "#3e9440";
  const leafHi = dark ? "#3a7a44" : "#6cbc58";
  const cx = x + sway;
  const blobs: [number, number, number, string][] = [
    [-10 * s, -30, 14 * s, leaf],
    [11 * s, -32, 13 * s, leaf],
    [0, -42, 16 * s, leafMid],
    [-6 * s, -24, 12 * s, leafMid],
    [7 * s, -22, 11 * s, leaf],
    [1, -34, 8 * s, leafHi],
  ];
  for (const [dx, dy, r, col] of blobs) {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(cx + dx, y + dy, r, r * 0.82, 0, 0, Math.PI * 2);
    c.fill();
  }
  // leaf specks
  c.fillStyle = dark ? "#8aaa60" : "#d2f0a0";
  for (let i = 0; i < 5; i++) {
    const a = tileHash(seed, i, 4);
    c.globalAlpha = 0.55;
    c.fillRect(cx - 10 + a * 22, y - 46 + tileHash(seed, i, 8) * 22, 2, 2);
  }
  c.globalAlpha = 1;
}

export function drawPerson(
  c: CanvasRenderingContext2D,
  x: number, y: number,
  look: Look,
  dir: number,
  walking: boolean,
  cycle: number,
) {
  c.save();
  c.translate(x, y);
  const face = Math.cos(dir) < -0.2 ? -1 : 1;
  c.scale(face, 1);
  const bob = walking ? Math.sin(cycle) * 1.4 : 0;
  const step = walking ? Math.sin(cycle) : 0;
  c.translate(0, bob * 0.35);

  // shadow
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(0, 13, 11, 4.2, 0, 0, Math.PI * 2);
  c.fill();

  // back arm
  c.fillStyle = shade(look.shirt, 0.75);
  c.fillRect(-12, -20, 5, 11);
  c.fillStyle = look.skin;
  c.fillRect(-12, -10, 5, 3.5);

  // legs
  const leg = (side: number, ph: number) => {
    const lift = Math.max(0, ph) * 3.2;
    c.fillStyle = look.pants;
    c.fillRect(side, -2 - lift * 0.2, 5.5, 12 - lift * 0.15);
    c.fillStyle = shade(look.pants, 0.8);
    c.fillRect(side + 3.6, -2, 1.4, 11);
    c.fillStyle = look.boots;
    c.fillRect(side - 1, 8 - lift * 0.35, 7, 4.2);
    c.fillStyle = shade(look.boots, 1.25);
    c.fillRect(side - 1, 8 - lift * 0.35, 7, 1.3);
  };
  leg(-7, step);
  leg(1.5, -step);

  // torso
  c.fillStyle = look.shirt;
  c.beginPath();
  c.moveTo(-8, -24);
  c.lineTo(8, -24);
  c.lineTo(9, -8);
  c.lineTo(-9, -8);
  c.closePath();
  c.fill();
  c.fillStyle = shade(look.shirt, 0.78);
  c.fillRect(-9, -24, 3.5, 16);
  c.fillStyle = shade(look.shirt, 1.18);
  c.fillRect(2, -22, 2, 10);

  // collar
  c.fillStyle = look.trim;
  c.beginPath();
  c.moveTo(-4, -24); c.lineTo(0, -18); c.lineTo(4, -24); c.closePath();
  c.fill();

  // belt
  c.fillStyle = "#5c4030";
  c.fillRect(-9, -11, 18, 3.2);
  c.fillStyle = look.trim;
  c.fillRect(-2.2, -12, 4.4, 4.6);
  c.fillStyle = "#fff3c4";
  c.fillRect(-0.7, -11.2, 1.4, 2.4);

  if (look.extra === "vest") {
    c.fillStyle = shade(look.trim, 0.85);
    c.fillRect(-7, -22, 5, 12);
    c.fillRect(2, -22, 5, 12);
  } else if (look.extra === "apron") {
    c.fillStyle = "#6a5038";
    c.fillRect(-6, -16, 12, 12);
    c.strokeStyle = "#3a2a1c";
    c.lineWidth = 1;
    c.strokeRect(-6, -16, 12, 12);
    c.beginPath();
    c.moveTo(-5, -22); c.lineTo(-4, -16);
    c.moveTo(5, -22); c.lineTo(4, -16);
    c.stroke();
  } else if (look.extra === "cloak") {
    c.fillStyle = shade(look.trim, 0.7);
    c.beginPath();
    c.moveTo(-10, -22); c.lineTo(-13, -4); c.lineTo(-7, -6); c.lineTo(-8, -22); c.fill();
    c.beginPath();
    c.moveTo(8, -22); c.lineTo(12, -2); c.lineTo(7, -6); c.lineTo(8, -22); c.fill();
  } else if (look.extra === "scarf") {
    c.fillStyle = "#c4503a";
    c.fillRect(-3, -23, 7, 3);
    c.fillRect(2, -21, 2.4, 7);
  }

  // front arm
  c.fillStyle = look.shirt;
  c.fillRect(6, -21, 5.2, 12);
  c.fillStyle = look.trim;
  c.fillRect(6, -12, 5.2, 2);
  c.fillStyle = look.skin;
  c.beginPath();
  c.arc(8.6, -8.5, 2.6, 0, Math.PI * 2);
  c.fill();

  // neck + head
  c.fillStyle = look.skin;
  c.fillRect(-2.4, -28, 4.8, 5);
  c.beginPath();
  c.arc(0, -36, 9.2, 0, Math.PI * 2);
  c.fill();
  // ear
  c.beginPath();
  c.ellipse(8.2, -35, 2.1, 2.8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = shade(look.skin, 0.8);
  c.beginPath();
  c.ellipse(8.3, -35, 1, 1.6, 0, 0, Math.PI * 2);
  c.fill();

  drawHair(c, look, step);

  // face
  const eyeY = -36.5 + Math.sin(dir) * 0.6;
  c.fillStyle = "#fff";
  c.beginPath();
  c.ellipse(2.2, eyeY, 2.1, 2.4, 0, 0, Math.PI * 2);
  c.ellipse(6.1, eyeY, 1.7, 2.1, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1a120c";
  c.beginPath();
  c.arc(2.8, eyeY + 0.3, 1.15, 0, Math.PI * 2);
  c.arc(6.4, eyeY + 0.3, 1.05, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff";
  c.fillRect(2.2, eyeY - 0.8, 0.8, 0.8);
  // brows
  c.strokeStyle = shade(look.hair, 0.7);
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(1, eyeY - 3.1); c.lineTo(4.2, eyeY - 3.4);
  c.moveTo(5, eyeY - 3.3); c.lineTo(7.6, eyeY - 2.9);
  c.stroke();
  // nose + mouth
  c.strokeStyle = shade(look.skin, 0.72);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(5.2, eyeY + 1.6); c.lineTo(4.4, eyeY + 3.4);
  c.stroke();
  c.strokeStyle = "#a85a58";
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(3.2, -31.2); c.quadraticCurveTo(4.8, -30.2, 6.4, -31.1);
  c.stroke();

  if (look.beard) {
    c.fillStyle = look.beard;
    c.beginPath();
    c.ellipse(3.5, -30, 4.2, 3.2, 0.2, 0, Math.PI);
    c.fill();
    c.fillRect(1.2, -33.5, 1.3, 3);
    c.fillRect(5.6, -33.2, 1.2, 2.6);
  }

  c.restore();
}

function drawHair(c: CanvasRenderingContext2D, look: Look, step: number) {
  const hy = -36;
  c.fillStyle = look.hair;
  if (look.style === "bald") {
    c.globalAlpha = 0.35;
    c.beginPath();
    c.ellipse(0, hy - 2, 7, 3, 0, Math.PI, 0);
    c.fill();
    c.globalAlpha = 1;
    return;
  }
  if (look.style === "cap") {
    c.fillStyle = look.trim;
    c.beginPath();
    c.ellipse(0, hy - 2, 9.5, 7, 0, Math.PI, 0);
    c.fill();
    c.fillRect(-9.5, hy - 3, 19, 3.5);
    c.beginPath();
    c.ellipse(7, hy + 1, 6, 2.2, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shade(look.trim, 0.75);
    c.fillRect(-8, hy - 8, 16, 2);
    return;
  }
  // back mass
  c.beginPath();
  c.arc(0, hy - 1, 9.4, Math.PI * 0.85, Math.PI * 2.15);
  c.fill();
  if (look.style === "messy") {
    c.beginPath();
    c.moveTo(-7, hy - 4); c.lineTo(-9, hy - 14); c.lineTo(-3, hy - 8); c.fill();
    c.beginPath();
    c.moveTo(-1, hy - 8); c.lineTo(1, hy - 17); c.lineTo(4, hy - 8); c.fill();
    c.beginPath();
    c.moveTo(4, hy - 5); c.lineTo(9, hy - 13); c.lineTo(8, hy - 4); c.fill();
  } else if (look.style === "long") {
    c.fillRect(-8, hy - 2, 5, 16);
    c.fillRect(4, hy, 4, 14);
    c.beginPath();
    c.ellipse(-6, hy + 14, 3.5, 4, 0, 0, Math.PI * 2);
    c.ellipse(6, hy + 13, 3, 3.5, 0, 0, Math.PI * 2);
    c.fill();
  } else if (look.style === "pony") {
    c.beginPath();
    c.ellipse(-7, hy + 2, 3.2, 4, -0.4, 0, Math.PI * 2);
    c.fill();
    const tail = Math.sin(step) * 2;
    c.beginPath();
    c.moveTo(-8, hy + 4);
    c.quadraticCurveTo(-14, hy + 10 + tail, -10, hy + 18 + tail);
    c.quadraticCurveTo(-6, hy + 12, -5, hy + 5);
    c.fill();
  } else if (look.style === "bun") {
    c.beginPath();
    c.arc(-1, hy - 10, 4.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shade(look.hair, 1.2);
    c.fillRect(-2.2, hy - 8, 2, 3);
  } else {
    // short
    c.beginPath();
    c.ellipse(0, hy - 3, 9, 6.5, 0, Math.PI, 0);
    c.fill();
  }
  // bangs
  c.fillStyle = look.hair;
  c.beginPath();
  c.ellipse(2, hy - 5, 7, 3.2, 0.1, Math.PI, 0);
  c.fill();
}

/** Weapon pointing along +X, origin at the grip. */
export function drawWeapon(c: CanvasRenderingContext2D, tool: ToolKey, level: number) {
  const m = metalOf(Math.max(1, Math.min(5, level)));
  const wood = "#6b4423";
  const woodHi = "#a87444";
  if (m.glow && level >= 4) {
    c.strokeStyle = m.glow;
    c.lineWidth = 4;
    c.globalAlpha = 0.45;
    c.beginPath();
    c.moveTo(8, 0);
    c.lineTo(tool === "sword" ? 38 : 30, 0);
    c.stroke();
    c.globalAlpha = 1;
  }
  if (tool === "axe") {
    c.fillStyle = wood;
    c.fillRect(0, -2.2, 22, 4.4);
    c.fillStyle = woodHi;
    c.fillRect(0, -2.2, 22, 1.3);
    c.fillStyle = m.wrap;
    c.fillRect(4, -2.4, 3, 4.8);
    c.fillRect(12, -2.4, 2.4, 4.8);
    c.fillStyle = m.blade;
    c.beginPath();
    c.moveTo(16, -2);
    c.lineTo(20, -13);
    c.quadraticCurveTo(34, -12, 33, -2);
    c.quadraticCurveTo(34, 9, 20, 9);
    c.lineTo(16, 2);
    c.closePath();
    c.fill();
    c.fillStyle = m.edge;
    c.beginPath();
    c.moveTo(24, -10);
    c.quadraticCurveTo(32, -8, 31, 0);
    c.quadraticCurveTo(30, 6, 23, 6);
    c.quadraticCurveTo(29, 0, 24, -8);
    c.fill();
    c.fillStyle = shade(m.blade, 0.7);
    c.fillRect(18, -3, 6, 5);
  } else if (tool === "pick") {
    c.fillStyle = wood;
    c.fillRect(0, -2.1, 20, 4.2);
    c.fillStyle = woodHi;
    c.fillRect(0, -2.1, 20, 1.2);
    c.fillStyle = m.wrap;
    c.fillRect(6, -2.4, 3, 4.8);
    c.fillStyle = m.blade;
    c.beginPath();
    c.moveTo(16, -1);
    c.lineTo(30, -12);
    c.lineTo(33, -9);
    c.lineTo(22, 1);
    c.lineTo(32, 10);
    c.lineTo(29, 13);
    c.lineTo(16, 2);
    c.closePath();
    c.fill();
    c.fillStyle = m.edge;
    c.beginPath();
    c.moveTo(26, -8); c.lineTo(31, -10); c.lineTo(24, -2); c.fill();
    c.beginPath();
    c.moveTo(26, 7); c.lineTo(31, 11); c.lineTo(23, 3); c.fill();
  } else {
    c.fillStyle = wood;
    c.fillRect(-1, -2.3, 9, 4.6);
    c.fillStyle = m.wrap;
    for (let i = 0; i < 3; i++) c.fillRect(1 + i * 2.4, -2.5, 1.2, 5);
    c.fillStyle = level >= 4 ? "#e2c27a" : "#c8ccd2";
    c.fillRect(8, -6.5, 3.2, 13);
    c.fillStyle = shade(level >= 4 ? "#e2c27a" : "#c8ccd2", 0.7);
    c.fillRect(8, -6.5, 3.2, 2);
    // pommel
    c.beginPath();
    c.arc(-1, 0, 2.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = m.blade;
    c.beginPath();
    c.moveTo(11, -3.3);
    c.lineTo(34, -1.5);
    c.lineTo(40, 0);
    c.lineTo(34, 1.5);
    c.lineTo(11, 3.3);
    c.closePath();
    c.fill();
    c.fillStyle = m.edge;
    c.beginPath();
    c.moveTo(14, -0.7);
    c.lineTo(36, 0);
    c.lineTo(14, 0.7);
    c.closePath();
    c.fill();
    if (level >= 5) {
      c.fillStyle = "#e8ffff";
      c.fillRect(18, -0.6, 8, 1.2);
    }
  }
}

export function drawSign(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(x, y + 4, 10, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6b4423";
  c.fillRect(x - 2, y - 28, 4, 32);
  c.fillStyle = "#c4a574";
  c.fillRect(x - 22, y - 36, 44, 16);
  c.strokeStyle = "#6b4423";
  c.lineWidth = 1.5;
  c.strokeRect(x - 22, y - 36, 44, 16);
  c.font = "bold 9px system-ui, sans-serif";
  c.textAlign = "center";
  c.fillStyle = color;
  c.fillText(text, x, y - 25);
}

export function drawFlag(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(x, y + 4, 8, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6e4a26";
  c.fillRect(x - 2, y - 72, 4, 76);
  c.fillStyle = "#e2c27a";
  c.fillRect(x - 3, y - 74, 6, 4);
  const wave = Math.sin(t * 3) * 3;
  c.fillStyle = "#2f9a4e";
  c.beginPath();
  c.moveTo(x + 2, y - 70);
  c.lineTo(x + 30, y - 60 + wave);
  c.lineTo(x + 2, y - 50);
  c.closePath();
  c.fill();
  c.fillStyle = "#e8ffe8";
  c.font = "bold 8px system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText("BASE", x + 6, y - 57 + wave * 0.3);
}
