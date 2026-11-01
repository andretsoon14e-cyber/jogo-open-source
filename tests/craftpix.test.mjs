import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { zipSync } from "fflate";
import sharp from "sharp";
import craftModule from "../src/game/craftpix.ts";

const { heroFrame, orcFrame, loadCraftPix } = craftModule;
const root = resolve(".");
const script = join(root, "scripts/import-craftpix.mjs");

function runImport(input, output) {
  return execFileSync(process.execPath, [script, input, "--output", output], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
async function pixelPng(width, height, pixels) {
  const rgba = Buffer.alloc(width * height * 4);
  for (const [x, y, r, g, b, a = 255] of pixels) rgba.set([r, g, b, a], (y * width + x) * 4);
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
async function fakeHero(corrupt = false) {
  const entries = {};
  for (const [action, cols] of [["Idle", 12], ["Walk", 6], ["Run", 8], ["attack", 8]]) {
    const bodyPixels = [], headPixels = [], armedPixels = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < cols; col++) {
      bodyPixels.push([col * 64 + 24, row * 64 + 30, 255, 0, 0], [col * 64 + 25, row * 64 + 30, 0, 0, 255]);
      headPixels.push([col * 64 + 24, row * 64 + 30, 0, 255, 0]);
      armedPixels.push([col * 64 + 27, row * 64 + 31, 255, 0, 255]);
      if (action === "attack") armedPixels.push([col * 64 + 52, row * 64 + 52, 0, 255, 255]);
    }
    if (corrupt && action === "Run") bodyPixels.push([2, 2, 1, 2, 3]);
    const body = await pixelPng(cols * 64, 256, bodyPixels);
    const head = await pixelPng(cols * 64, 256, headPixels);
    const armed = await pixelPng(cols * 64, 256, armedPixels);
    for (let level = 1; level <= 3; level++) {
      const prefix = `PNG/Swordsman_lvl${level}/Parts/Swordsman_lvl${level}_${action}_`;
      entries[prefix + "body.png"] = body;
      entries[prefix + "head.png"] = head;
      entries[`PNG/Swordsman_lvl${level}/Without_shadow/Swordsman_lvl${level}_${action}_without_shadow.png`] = armed;
    }
  }
  return entries;
}
async function fakeOrcs() {
  const entries = {};
  for (const [action, width] of [["idle", 256], ["walk", 384], ["attack", 512]]) {
    const png = await pixelPng(width, 256, [[20, 30, 210, 100, 50]]);
    for (let variant = 1; variant <= 3; variant++) entries[`PNG/Orc${variant}/Without_shadow/orc${variant}_${action}_without_shadow.png`] = png;
  }
  return entries;
}
async function fakePlants() {
  return {
    "PNG/Plants.png": await pixelPng(768, 432, [
      [645, 20, 255, 0, 0], [704, 144, 255, 0, 255], [705, 150, 0, 255, 0],
      [257, 299, 255, 255, 0], [513, 181, 0, 0, 255],
    ]),
    "PNG/Supplies.png": await pixelPng(32, 32, [[1, 1, 255, 128, 0]]),
  };
}
function hashes(dir) {
  return Object.fromEntries(readdirSync(dir).sort().map((file) => [file, createHash("sha256").update(readFileSync(join(dir, file))).digest("hex")]));
}

test("os quadros originais respeitam as quatro direções, inclusive diagonais e costas paradas", () => {
  assert.equal(heroFrame("side", true, "walk", 0, 0).y, 160);  // left
  assert.equal(heroFrame("side", false, "walk", 0, 0).y, 192); // right
  assert.equal(heroFrame("up", false, "idle", 0, 4).y, 96);
  for (let t = 0; t < 20; t += 0.13) assert.ok(heroFrame("up", false, "idle", 0, t).x < 128, "os quadros vazios de costas foram selecionados");
  assert.equal(heroFrame("down", false, "attack", 0, 0, 1).x, 7 * 32);
  assert.equal(orcFrame("side", true, "walk", 0).y, (4 + 3) * 64);
  assert.equal(orcFrame("side", false, "walk", 0).y, (4 + 2) * 64);
  assert.equal(orcFrame("up", false, "idle", 0).y, 64);
  assert.equal(orcFrame("down", false, "attack", 0, 1).x, 7 * 64);
});

test("sem navegador, a biblioteca opcional mantém o fallback sem tentar carregar imagens", async () => {
  assert.deepEqual(await loadCraftPix(), { hero: false, orcs: false, plants: false });
});

test("o importador é seletivo, reproduzível e preserva camadas e recortes", async () => {
  const temp = mkdtempSync(join(tmpdir(), "craftpix-import-test-"));
  try {
    const inputs = join(temp, "input"), output = join(temp, "output");
    mkdirSync(inputs);
    const archive = {
      ...await fakeHero(), ...await fakeOrcs(), ...await fakePlants(),
      "PNG/Unarmed/Parts/Unarmed_Idle2_body.png": new Uint8Array([1, 2, 3]),
      "../../escape.txt": new TextEncoder().encode("must not be extracted"),
    };
    writeFileSync(join(inputs, "fixtures.zip"), zipSync(archive));
    const log = runImport(inputs, output);
    assert.match(log, /base feminina/i);
    assert.deepEqual(JSON.parse(readFileSync(join(output, "manifest.json"), "utf8")), { version: 1, hero: true, orcs: true, plants: true });
    assert.deepEqual(readdirSync(output).sort(), ["hero-1.png", "hero-2.png", "hero-3.png", "manifest.json", "orc-1.png", "orc-2.png", "orc-3.png", "world.png"]);
    assert.equal(existsSync(join(temp, "escape.txt")), false);
    const hero = await sharp(join(output, "hero-1.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(hero.info.width, 384); assert.equal(hero.info.height, 1088);
    const pixel = (image, x, y) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];
    assert.deepEqual(pixel(hero, 8, 14), [0, 255, 0, 255], "a cabeça deve ficar sobre o corpo");
    assert.deepEqual(pixel(hero, 9, 14), [0, 0, 255, 255]);
    assert.deepEqual(pixel(hero, 11, 512 + 15), [255, 0, 255, 255], "a espada original deve estar na sequência armada");
    assert.deepEqual(pixel(hero, 44, 896 + 44), [0, 255, 255, 255], "o efeito completo do ataque precisa caber no recorte maior");
    const world = await sharp(join(output, "world.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(pixel(world, 5, 6), [255, 0, 0, 255]);
    assert.deepEqual(pixel(world, 65, 1), [0, 255, 0, 255]);
    assert.deepEqual(pixel(world, 129, 1), [255, 255, 0, 255]);
    assert.deepEqual(pixel(world, 193, 1), [0, 0, 255, 255]);
    assert.deepEqual(pixel(world, 225, 1), [255, 128, 0, 255]);
    assert.equal(world.data.indexOf(Buffer.from([255, 0, 255, 255])), -1, "parte da árvore vizinha vazou para o recorte");
    const first = hashes(output);
    runImport(inputs, output);
    assert.deepEqual(hashes(output), first, "a mesma entrada deve gerar os mesmos arquivos");
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("pacotes incompletos ou quadros que seriam cortados não substituem uma instalação válida", async () => {
  const temp = mkdtempSync(join(tmpdir(), "craftpix-invalid-test-"));
  try {
    const output = join(temp, "out"), plantsZip = join(temp, "plants.zip");
    writeFileSync(plantsZip, zipSync(await fakePlants())); runImport(plantsZip, output);
    const before = hashes(output);
    const invalid = join(temp, "partial.zip");
    const fake = await fakeHero();
    const one = Object.entries(fake)[0];
    writeFileSync(invalid, zipSync({ [one[0]]: one[1] }));
    assert.throws(() => runImport(invalid, output), /incompleto/i);
    assert.deepEqual(hashes(output), before);
    const cut = join(temp, "cut.zip");
    writeFileSync(cut, zipSync(await fakeHero(true)));
    assert.throws(() => runImport(cut, output), /cortaria pixels/i);
    assert.deepEqual(hashes(output), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("vila e torre são importadas separadamente, com fallback seguro e sem incluir outros arquivos", async () => {
  const temp = mkdtempSync(join(tmpdir(), "craftpix-buildings-"));
  try {
    const output = join(temp, "out"), pack = join(temp, "buildings.zip"), entries = {};
    for (let i = 1; i <= 4; i++) entries[`2 Objects/7 House/${i}.png`] = await pixelPng(116, 112, [[10, 10, i * 30, 45, 60]]);
    entries["2 Idle/3.png"] = await pixelPng(280, 130, [[20, 20, 220, 110, 55], [90, 20, 1, 2, 3]]);
    entries["outro-arquivo.txt"] = new TextEncoder().encode("não importar");
    writeFileSync(pack, zipSync(entries)); runImport(pack, output);
    assert.deepEqual(JSON.parse(readFileSync(join(output, "manifest.json"), "utf8")), { version: 1, hero: false, orcs: false, plants: false, village: true, tower: true });
    assert.deepEqual(readdirSync(output).sort(), ["buildings.png", "manifest.json"]);
    const atlas = await sharp(join(output, "buildings.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([atlas.info.width, atlas.info.height], [640, 290]);
    const pixel = (x, y) => [...atlas.data.subarray((y * atlas.info.width + x) * 4, (y * atlas.info.width + x) * 4 + 4)];
    assert.deepEqual(pixel(32, 58), [30, 45, 60, 255]);
    assert.deepEqual(pixel(20, 180), [220, 110, 55, 255]);
    assert.deepEqual(pixel(90, 180), [0, 0, 0, 0], "não mistura os quadros da torre");
    const before = hashes(output), partial = join(temp, "partial.zip");
    writeFileSync(partial, zipSync({ "2 Objects/7 House/1.png": entries["2 Objects/7 House/1.png"] }));
    assert.throws(() => runImport(partial, output), /incompleto/i);
    assert.deepEqual(hashes(output), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
