// Locally isolate the small, *static front-view previews* supplied for this
// project. These are not animations or four-direction sprite sheets.
import sharp from "sharp";
import { keepMainSilhouette } from "./reference-art-core.mjs";

const figures = [
  { id: 88, rect: [820, 420, 450, 590], background: "grass" }, // bard
  { id: 89, rect: [300, 395, 190, 235], background: "grass" }, // monk
  { id: 90, rect: [890, 460, 820, 880], background: "grass" }, // travelling mage
  { id: 91, rect: [830, 1210, 390, 550], background: "grass" }, // scholar
];
const creatures = [
  { id: 92, rect: [400, 240, 240, 250], background: "grass" }, // goblin
  { id: 92, rect: [1060, 195, 285, 285], background: "grass" }, // orc
  { id: 92, rect: [105, 650, 200, 245], background: "grey", erase: (x, y) => x > 130 && y > 185 }, // ghost
  { id: 92, rect: [1090, 645, 270, 275], background: "mixed", erase: (_x, y) => y < 3 }, // lizard
  { id: 92, rect: [390, 1030, 250, 250], background: "rose" }, // zombie
  { id: 92, rect: [1450, 1030, 240, 255], background: "brown", erase: (_x, y) => y > 252 }, // demon
  { id: 92, rect: [1440, 1368, 250, 212], background: "grey", erase: (x, y) => (y < 3 && (x < 65 || x > 165)) || (y > 208 && (x < 28 || x > 190)) }, // vampire
  { id: 92, rect: [145, 1700, 210, 250], background: "grey", protect: [40, 55, 75, 43] }, // lich
  { id: 92, rect: [1450, 1703, 245, 235], background: "grey", protect: [40, 52, 75, 43] }, // skeleton
  { id: 92, rect: [390, 1300, 255, 240], background: "olive" }, // bat
  { id: 92, rect: [700, 650, 240, 245], background: "grey" }, // hooded ghost
  { id: 92, rect: [390, 1700, 240, 250], background: "grey", protect: [55, 55, 70, 43] }, // lich mage
];

function isBackground(r, g, b, kind) {
  if (kind === "grass") return r >= 65 && g >= 70 && b >= 22 && r <= 235 && g <= 230 && b <= 135 && g > r * 0.88 && g > b * 1.2 && r > b * 1.13;
  if (kind === "grey") return r >= 50 && g >= 50 && b >= 40 && r <= 155 && g <= 160 && b <= 155 && Math.max(r, g, b) - Math.min(r, g, b) < 35;
  if (kind === "rose") return r >= 125 && g >= 65 && b >= 45 && r > g * 1.12 && r > b * 1.25;
  if (kind === "brown") return r >= 55 && g >= 40 && b >= 30 && r <= 190 && g <= 150 && b <= 130 && r > g * 1.03;
  if (kind === "mixed") return (r >= 55 && g >= 55 && b >= 45 && Math.max(r, g, b) - Math.min(r, g, b) < 58) || (r >= 40 && g >= 90 && b >= 80 && g > r * 1.2 && b > r * 1.2) || (r > 180 && g > 180 && b > 160);
  return r > 55 && g > 55 && b < 125 && r > b * 1.1 && g > b * 1.1;
}

/** Flood from outside, retain the largest body, and optionally protect a
 * known interior (e.g. gray eye sockets against a gray cemetery backdrop).
 * A spec can erase fragments of neighboring scenery or screenshot captions. */
export function matteScene(rgb, width, height, { background, protect, erase } = {}) {
  const size = width * height, exterior = new Uint8Array(size), queue = new Int32Array(size);
  let head = 0, tail = 0;
  const guarded = (x, y) => protect && x >= protect[0] && x < protect[0] + protect[2] && y >= protect[1] && y < protect[1] + protect[3];
  const add = (p) => {
    const x = p % width, y = Math.floor(p / width), i = p * 3;
    if (!exterior[p] && !guarded(x, y) && isBackground(rgb[i], rgb[i + 1], rgb[i + 2], background)) { exterior[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width, y = Math.floor(p / width);
    if (x) add(p - 1); if (x + 1 < width) add(p + 1);
    if (y) add(p - width); if (y + 1 < height) add(p + width);
  }
  const rgba = Buffer.alloc(size * 4);
  for (let p = 0; p < size; p++) {
    const x = p % width, y = Math.floor(p / width), from = p * 3, to = p * 4;
    rgba[to] = rgb[from]; rgba[to + 1] = rgb[from + 1]; rgba[to + 2] = rgb[from + 2];
    rgba[to + 3] = exterior[p] || erase?.(x, y) ? 0 : 255;
  }
  return keepMainSilhouette(rgba, width, height);
}

async function makeCell(input, spec) {
  const [left, top, width, height] = spec.rect;
  const rgb = await sharp(input).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  const rgba = matteScene(rgb, width, height, spec);
  return sharp(rgba, { raw: { width, height, channels: 4 } }).trim({ threshold: 1 })
    .resize(96, 96, { fit: "contain", position: "bottom", kernel: "nearest", background: "#00000000" }).png().toBuffer();
}

/** A 96px cell per figure, in a deterministic order. Missing previews leave a
 * transparent cell and a false flag, so existing installations still work. */
export async function makeFigureAtlas(inputs) {
  const flags = figures.map((entry) => Boolean(inputs[entry.id]));
  if (!flags.some(Boolean)) return { flags, atlas: null };
  const pieces = [];
  for (const [index, spec] of figures.entries()) if (inputs[spec.id]) pieces.push({ input: await makeCell(inputs[spec.id], spec), left: index * 96, top: 0 });
  const atlas = await sharp({ create: { width: figures.length * 96, height: 96, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer();
  return { flags, atlas };
}

export async function makeCreatureAtlas(input) {
  const pieces = [];
  for (const [index, spec] of creatures.entries()) pieces.push({ input: await makeCell(input, spec), left: index * 96, top: 0 });
  return sharp({ create: { width: creatures.length * 96, height: 96, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}
