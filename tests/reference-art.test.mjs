import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { mattePreview, matteObject, keepMainSilhouette, makeReferenceObject } from "../scripts/reference-art-core.mjs";

const background = [189, 200, 192];
const rgb = (width, height, color = background) => Buffer.from(Array.from({ length: width * height }, () => color).flat());
const put = (buffer, width, x, y, color) => buffer.set(color, (y * width + x) * 3);
const alpha = (buffer, width, x, y) => buffer[(y * width + x) * 4 + 3];

test("preview matte removes background and photographed shadow without erasing dark boots", () => {
  const image = rgb(3, 3);
  put(image, 3, 1, 0, [35, 50, 30]);
  put(image, 3, 1, 2, [140, 140, 140]);
  put(image, 3, 2, 2, [50, 40, 30]);
  const out = mattePreview(image, 3, 3, { shadowBelow: 2 });
  assert.equal(alpha(out, 3, 0, 0), 0);
  assert.equal(alpha(out, 3, 1, 0), 255);
  assert.equal(alpha(out, 3, 1, 2), 0);
  assert.equal(alpha(out, 3, 2, 2), 255);
});

test("object matte only floods the exterior and preserves pale enclosed walls", () => {
  const image = rgb(9, 9);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    if (x === 2 || x === 6 || y === 2 || y === 6) put(image, 9, x, y, [50, 60, 40]);
  }
  const out = matteObject(image, 9, 9);
  assert.equal(alpha(out, 9, 0, 0), 0);
  assert.equal(alpha(out, 9, 2, 3), 255);
  assert.equal(alpha(out, 9, 4, 4), 255, "uma parede interna da cor de fundo continua opaca");
});

test("largest silhouette drops unrelated fragments and preserves its edge", () => {
  const w = 12, h = 12, pixels = Buffer.alloc(w * h * 4);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) pixels[(y * w + x) * 4 + 3] = 255;
  pixels[(10 * w + 10) * 4 + 3] = 255;
  pixels[(6 * w + 4) * 4 + 3] = 50;
  keepMainSilhouette(pixels, w, h);
  assert.equal(alpha(pixels, w, 3, 3), 255);
  assert.equal(alpha(pixels, w, 4, 6), 50);
  assert.equal(alpha(pixels, w, 10, 10), 0);
});

test("object crop is transparent, bounded and resized to its configured dimensions", async () => {
  const image = rgb(20, 20);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) put(image, 20, x, y, [40, 80, 20]);
  const source = await sharp(image, { raw: { width: 20, height: 20, channels: 3 } }).png().toBuffer();
  const output = await makeReferenceObject(source, { left: 0, top: 0, width: 20, height: 20, targetWidth: 10, targetHeight: 12, mainOnly: true });
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [10, 12]);
  assert.equal(alpha(data, 10, 0, 0), 0);
  assert.equal(alpha(data, 10, 5, 6), 255);
});

test("importer rejects wrong files without touching previous output", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ilha-referencias-test-"));
  try {
    const input = path.join(dir, "input"), output = path.join(dir, "output");
    mkdirSync(input); mkdirSync(output);
    writeFileSync(path.join(input, "image-8.png"), "arquivo errado");
    writeFileSync(path.join(output, "manifest.json"), "sentinela");
    const result = spawnSync(process.execPath, ["scripts/import-references.mjs", input, "--output", output], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não corresponde/);
    assert.equal(readFileSync(path.join(output, "manifest.json"), "utf8"), "sentinela");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("recortes de armas aceitam fundo marrom e plantas removem a sombra cinza embutida", async () => {
  const brown = [145, 126, 105];
  const weapon = rgb(9, 9, brown);
  for (let y = 2; y < 7; y++) put(weapon, 9, 4, y, [55, 39, 26]);
  const bow = matteObject(weapon, 9, 9, brown);
  assert.equal(alpha(bow, 9, 0, 0), 0);
  assert.equal(alpha(bow, 9, 4, 4), 255);

  const plant = rgb(12, 12);
  for (let y = 2; y < 9; y++) for (let x = 3; x < 9; x++) put(plant, 12, x, y, [40, 125, 45]);
  for (let x = 2; x < 10; x++) put(plant, 12, x, 9, [135, 145, 140]);
  const source = await sharp(plant, { raw: { width: 12, height: 12, channels: 3 } }).png().toBuffer();
  const output = await makeReferenceObject(source, { left: 0, top: 0, width: 12, height: 12, targetWidth: 12, targetHeight: 12, mainOnly: true, shadowBelow: 0.55 });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(alpha(data, 12, 5, 6), 255, "folhagem continua visível");
  assert.equal(alpha(data, 12, 5, 9), 0, "oval cinza é removida");
});

test("a grade do castelo mantém as barras e remove o fundo dentro dos vãos", async () => {
  const beige = [252, 225, 184], image = rgb(11, 11, beige);
  for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) {
    if (x === 2 || x === 8 || y === 2 || y === 8 || x === 5) put(image, 11, x, y, [30, 45, 65]);
  }
  const source = await sharp(image, { raw: { width: 11, height: 11, channels: 3 } }).png().toBuffer();
  const output = await makeReferenceObject(source, { left: 0, top: 0, width: 11, height: 11, targetWidth: 11, targetHeight: 11, background: beige, clearInside: true, mainOnly: true });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(alpha(data, 11, 0, 0), 0);
  assert.equal(alpha(data, 11, 3, 4), 0);
  assert.equal(alpha(data, 11, 5, 4), 255);
});
