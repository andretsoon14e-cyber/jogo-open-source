// Helpers for preparing locally supplied reference screenshots. No images are
// embedded here: the screenshots and generated PNGs stay outside Git.
import sharp from "sharp";

/** Remove the uniform preview backdrop while retaining soft edge pixels. */
export function mattePreview(rgb, width, height, { shadowBelow = Infinity } = {}) {
  const out = Buffer.alloc(width * height * 4);
  const background = [189, 200, 192];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const input = (y * width + x) * 3, output = (y * width + x) * 4;
    const color = [rgb[input], rgb[input + 1], rgb[input + 2]];
    const distance = Math.max(...color.map((v, i) => Math.abs(v - background[i])));
    let alpha = Math.max(0, Math.min(1, (distance - 12) / 30));
    // The character previews include a gray oval. The engine draws its own
    // anchored shadow, so remove the photographed one without touching boots.
    if (y >= shadowBelow && Math.min(...color) > 110 && Math.max(...color) < 170 && Math.max(...color) - Math.min(...color) < 22) alpha = 0;
    if (alpha <= 0) continue;
    for (let i = 0; i < 3; i++) out[output + i] = Math.max(0, Math.min(255, Math.round((color[i] - (1 - alpha) * background[i]) / alpha)));
    out[output + 3] = Math.round(alpha * 255);
  }
  return out;
}

/** Keep the largest connected silhouette and its antialiased edges. */
export function keepMainSilhouette(rgba, width, height) {
  const total = width * height;
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  let best = [];
  for (let start = 0; start < total; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 80) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const current = queue[head++], x = current % width, y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!seen[next] && rgba[next * 4 + 3] >= 80) { seen[next] = 1; queue[tail++] = next; }
      }
    }
    if (tail > best.length) best = Array.from(queue.subarray(0, tail));
  }
  const keep = new Uint8Array(total);
  for (const p of best) {
    const x = p % width, y = Math.floor(p / width);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) keep[ny * width + nx] = 1;
    }
  }
  for (let p = 0; p < total; p++) if (!keep[p]) rgba[p * 4 + 3] = 0;
  return rgba;
}

/** Pack the four directions and supplied animations from the two previews. */
export async function makeArcher(previews) {
  const source = {};
  for (const id of [30, 31]) source[id] = await sharp(previews[id]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const definitions = [
    { id: 30, action: "idle", count: 12, center: (i) => 100 + 128 * i, top: 712 },
    { id: 30, action: "walk", count: 6, center: (i) => 100 + Math.round(138 * i), top: 155 },
    { id: 31, action: "run", count: 8, center: (i) => 1028 + 98 * i, top: 155 },
    { id: 31, action: "attack", count: 8, center: (i) => 100 + Math.round(138 * i), top: 712 },
  ];
  const pieces = [];
  for (const [actionIndex, def] of definitions.entries()) {
    for (let row = 0; row < 4; row++) {
      const frames = def.action === "idle" && row === 3 ? 4 : def.count;
      for (let frame = 0; frame < frames; frame++) {
        const attack = def.action === "attack", size = attack ? 96 : 80;
        const left = def.center(frame) - size / 2;
        const top = def.top + row * 118 - (attack ? 8 : 0);
        const { data, info } = source[def.id];
        const rgb = Buffer.alloc(size * size * 3);
        for (let y = 0; y < size; y++) {
          const from = ((top + y) * info.width + left) * 3;
          data.copy(rgb, y * size * 3, from, from + size * 3);
        }
        const rgba = mattePreview(rgb, size, size, { shadowBelow: attack ? 51 : 43 });
        let output = sharp(rgba, { raw: { width: size, height: size, channels: 4 } });
        if (!attack) output = output.resize(64, 64, { kernel: "nearest" });
        pieces.push({ input: await output.png().toBuffer(), left: frame * (attack ? 96 : 64), top: attack ? 768 + row * 96 : (actionIndex * 4 + row) * 64 });
      }
    }
  }
  return sharp({ create: { width: 768, height: 1152, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}

/** Flood only the exterior backdrop: pale walls must stay opaque even when
 * their color resembles the gray-green preview background. */
export function matteObject(rgb, width, height, background = [189, 200, 192]) {
  const total = width * height, queue = new Int32Array(total), exterior = new Uint8Array(total);
  const distance = (p) => Math.max(Math.abs(rgb[p * 3] - background[0]), Math.abs(rgb[p * 3 + 1] - background[1]), Math.abs(rgb[p * 3 + 2] - background[2]));
  let head = 0, tail = 0;
  const add = (p) => { if (!exterior[p] && distance(p) <= 28) { exterior[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width, y = Math.floor(p / width);
    if (x > 0) add(p - 1); if (x + 1 < width) add(p + 1);
    if (y > 0) add(p - width); if (y + 1 < height) add(p + width);
  }
  const out = Buffer.alloc(total * 4);
  for (let p = 0; p < total; p++) {
    if (exterior[p]) continue;
    const x = p % width, y = Math.floor(p / width);
    const edge = (x > 0 && exterior[p - 1]) || (x + 1 < width && exterior[p + 1]) ||
      (y > 0 && exterior[p - width]) || (y + 1 < height && exterior[p + width]);
    const alpha = edge ? Math.max(0, Math.min(1, (distance(p) - 20) / 35)) : 1;
    if (!alpha) continue;
    for (let i = 0; i < 3; i++) out[p * 4 + i] = Math.max(0, Math.min(255, Math.round((rgb[p * 3 + i] - (1 - alpha) * background[i]) / alpha)));
    out[p * 4 + 3] = Math.round(alpha * 255);
  }
  return out;
}

export async function makeReferenceObject(input, { left, top, width, height, targetWidth, targetHeight, mainOnly, background, shadowBelow, clearInside }) {
  const { data } = await sharp(input).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = matteObject(data, width, height, background);
  // The grate has enclosed openings filled with the preview background. Unlike
  // pale masonry, its dark bars are safe to key in all connected regions.
  if (clearInside && background) for (let p = 0; p < width * height; p++) {
    const distance = Math.max(...background.map((value, channel) => Math.abs(data[p * 3 + channel] - value)));
    if (distance <= 28) rgba[p * 4 + 3] = 0;
  }
  // Some plant sheets have an opaque gray preview oval. Remove its neutral
  // pixels only in the lower part of the crop; retain colored leaves/flowers.
  if (shadowBelow !== undefined) for (let y = Math.floor(height * shadowBelow); y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if (r >= 100 && g < 190 && Math.max(r, g, b) - Math.min(r, g, b) < 22 && g >= r && b >= r) rgba[p * 4 + 3] = 0;
  }
  if (mainOnly) keepMainSilhouette(rgba, width, height);
  return sharp(rgba, { raw: { width, height, channels: 4 } }).resize(targetWidth, targetHeight, { kernel: "nearest" }).png({ compressionLevel: 9 }).toBuffer();
}
