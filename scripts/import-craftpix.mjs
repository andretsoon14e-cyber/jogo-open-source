#!/usr/bin/env node
/*
 * Turn locally licensed CraftPix ZIPs into compact, optional runtime atlases.
 * Never extract arbitrary paths from an archive or copy the original ZIPs.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let outputDir = path.join(root, "public", "craftpix");
const outputIndex = args.indexOf("--output");
if (outputIndex !== -1) {
  if (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")) fail("Informe uma pasta depois de --output.");
  outputDir = path.resolve(args[outputIndex + 1]);
  args.splice(outputIndex, 2);
}
if (!args.length || args.some((arg) => arg.startsWith("--"))) {
  fail("Uso: npm run import:craftpix -- <pasta ou ZIP> [outro ZIP ...] [--output pasta]");
}

function fail(message) {
  console.error(`Importação CraftPix: ${message}`);
  process.exit(1);
}

const actions = ["Idle", "Walk", "Run", "attack"];
const heroNames = [];
for (let level = 1; level <= 3; level++) {
  for (const action of actions) {
    for (const part of ["body", "head"]) {
      heroNames.push(`PNG/Swordsman_lvl${level}/Parts/Swordsman_lvl${level}_${action}_${part}.png`);
    }
    heroNames.push(`PNG/Swordsman_lvl${level}/Without_shadow/Swordsman_lvl${level}_${action}_without_shadow.png`);
  }
}
const orcNames = [];
for (let variant = 1; variant <= 3; variant++) {
  for (const action of ["idle", "walk", "attack"]) {
    orcNames.push(`PNG/Orc${variant}/Without_shadow/orc${variant}_${action}_without_shadow.png`);
  }
}
const plantNames = ["PNG/Plants.png", "PNG/Supplies.png"];
const villageNames = [1, 2, 3, 4].map((i) => `2 Objects/7 House/${i}.png`);
const towerNames = ["2 Idle/3.png"];
const expected = new Set([...heroNames, ...orcNames, ...plantNames, ...villageNames, ...towerNames]);
const femaleMarker = "PNG/Unarmed/Parts/Unarmed_Idle2_body.png";
const selected = new Map();
let foundFemale = false;

function archivesFrom(paths) {
  const files = [];
  for (const entry of paths) {
    const absolute = path.resolve(entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        if (name.toLowerCase().endsWith(".zip")) files.push(path.join(absolute, name));
      }
    } else if (stat.isFile() && absolute.toLowerCase().endsWith(".zip")) files.push(absolute);
    else throw new Error(`Não é um ZIP nem uma pasta: ${entry}`);
  }
  return [...new Set(files)];
}

function completeGroup(names, label) {
  const found = names.filter((name) => selected.has(name));
  if (!found.length) return false;
  const missing = names.filter((name) => !selected.has(name));
  if (missing.length) throw new Error(`O pacote ${label} está incompleto; falta ${missing[0]}. Nenhum arquivo foi alterado.`);
  return true;
}

async function generateHero(level) {
  // Body/head occupy 32px cells. The original sword is preserved in a second
  // set of rows; its attack and slash need wider 48px cells. Verify every crop.
  const outWidth = 12 * 32, outHeight = 1088;
  const out = Buffer.alloc(outWidth * outHeight * 4);
  const columns = [12, 6, 8, 8];
  const copyCells = (data, info, ai, size, offset, destY) => {
    if (info.width !== columns[ai] * 64 || info.height !== 256 || info.channels !== 4) {
      throw new Error(`Dimensões inesperadas no espadachim nível ${level}, ação ${actions[ai]}.`);
    }
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] && (x % 64 < offset || x % 64 >= offset + size || y % 64 < offset || y % 64 >= offset + size)) {
        throw new Error(`O recorte cortaria pixels do espadachim nível ${level}, ação ${actions[ai]}.`);
      }
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < columns[ai]; col++) for (let py = 0; py < size; py++) {
      const from = ((row * 64 + offset + py) * info.width + col * 64 + offset) * 4;
      const to = ((destY + row * size + py) * outWidth + col * size) * 4;
      data.copy(out, to, from, from + size * 4);
    }
  };
  for (let ai = 0; ai < actions.length; ai++) {
    const action = actions[ai];
    const prefix = `PNG/Swordsman_lvl${level}/Parts/Swordsman_lvl${level}_${action}_`;
    const body = selected.get(prefix + "body.png"), head = selected.get(prefix + "head.png");
    const plain = await sharp(body).composite([{ input: head }]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    copyCells(plain.data, plain.info, ai, 32, 16, ai * 4 * 32);

    const armedPath = `PNG/Swordsman_lvl${level}/Without_shadow/Swordsman_lvl${level}_${action}_without_shadow.png`;
    const armed = await sharp(selected.get(armedPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const attack = action === "attack";
    copyCells(armed.data, armed.info, ai, attack ? 48 : 32, attack ? 8 : 16, attack ? 896 : 512 + ai * 4 * 32);
  }
  return sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

async function generateOrc(variant) {
  const pieces = [];
  for (const [i, action] of ["idle", "walk", "attack"].entries()) {
    const input = selected.get(`PNG/Orc${variant}/Without_shadow/orc${variant}_${action}_without_shadow.png`);
    const meta = await sharp(input).metadata();
    const expectedWidth = [256, 384, 512][i];
    if (meta.width !== expectedWidth || meta.height !== 256) throw new Error(`Dimensões inesperadas no orc ${variant}, ação ${action}.`);
    pieces.push({ input, left: 0, top: i * 256 });
  }
  return sharp({ create: { width: 512, height: 768, channels: 4, background: "#00000000" } })
    .composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}

async function generatePlants() {
  const plants = selected.get("PNG/Plants.png");
  const supplies = selected.get("PNG/Supplies.png");
  const [meta, suppliesMeta] = await Promise.all([sharp(plants).metadata(), sharp(supplies).metadata()]);
  if (meta.width !== 768 || meta.height !== 432 || (suppliesMeta.width ?? 0) < 32 || (suppliesMeta.height ?? 0) < 32) {
    throw new Error("Dimensões inesperadas nas plantas ou suprimentos.");
  }
  // Bounds end between source objects so neighboring trees aren't clipped in.
  const definitions = [
    [plants, 640, 14, 64, 66, 0],   // tree on grass
    [plants, 704, 149, 64, 59, 64], // apple tree on grass
    [plants, 256, 298, 64, 70, 128],// palm on soil
    [plants, 512, 180, 32, 22, 192],// small plant
    [supplies, 0, 0, 32, 32, 224],  // basket of produce
  ];
  const pieces = await Promise.all(definitions.map(async ([src, left, top, width, height, x]) => ({
    input: await sharp(src).extract({ left, top, width, height }).png().toBuffer(), left: x, top: 0,
  })));
  return sharp({ create: { width: 256, height: 70, channels: 4, background: "#00000000" } })
    .composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}

// A small optional atlas from the two additional packs. It is generated
// locally, never committed, and each group may be absent independently.
async function generateBuildings(village, tower) {
  const pieces = [];
  if (village) for (let i = 0; i < villageNames.length; i++) {
    const src = selected.get(villageNames[i]), meta = await sharp(src).metadata();
    if (!meta.width || !meta.height || meta.width > 160 || meta.height > 160) throw new Error(`Dimensões inesperadas na casa ${i + 1}.`);
    pieces.push({ input: src, left: i * 160 + Math.floor((160 - meta.width) / 2), top: 160 - meta.height });
  }
  if (tower) {
    const src = selected.get(towerNames[0]), meta = await sharp(src).metadata();
    if (meta.width !== 280 || meta.height !== 130) throw new Error("Dimensões inesperadas na torre de arqueiros.");
    pieces.push({ input: await sharp(src).extract({ left: 0, top: 0, width: 70, height: 130 }).png().toBuffer(), left: 0, top: 160 });
  }
  return sharp({ create: { width: 640, height: 290, channels: 4, background: "#00000000" } })
    .composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const archives = archivesFrom(args);
  if (!archives.length) throw new Error("Nenhum ZIP encontrado na pasta informada.");
  for (const file of archives) {
    if (statSync(file).size > 100 * 1024 * 1024) throw new Error(`ZIP maior que 100 MB: ${path.basename(file)}`);
    const entries = unzipSync(readFileSync(file), { filter: (entry) => {
      if (entry.name === femaleMarker) foundFemale = true;
      if (!expected.has(entry.name)) return false;
      if (entry.originalSize > 10 * 1024 * 1024) throw new Error(`Arquivo interno grande demais: ${entry.name}`);
      return true;
    } });
    for (const [name, bytes] of Object.entries(entries)) {
      if (selected.has(name)) throw new Error(`Arquivo duplicado em mais de um ZIP: ${name}`);
      selected.set(name, Buffer.from(bytes));
    }
  }

  const hero = completeGroup(heroNames, "espadachim");
  const orcs = completeGroup(orcNames, "orcs");
  const plants = completeGroup(plantNames, "plantas");
  const village = completeGroup(villageNames, "vila");
  const tower = completeGroup(towerNames, "torre");
  if (!hero && !orcs && !plants && !village && !tower) throw new Error("Nenhum dos pacotes compatíveis foi encontrado.");

  // Generate everything first, so a malformed pack cannot leave a partial set.
  const generated = new Map();
  if (hero) for (let i = 1; i <= 3; i++) generated.set(`hero-${i}.png`, await generateHero(i));
  if (orcs) for (let i = 1; i <= 3; i++) generated.set(`orc-${i}.png`, await generateOrc(i));
  if (plants) generated.set("world.png", await generatePlants());
  if (village || tower) generated.set("buildings.png", await generateBuildings(village, tower));
  const manifest = Buffer.from(JSON.stringify({ version: 1, hero, orcs, plants, ...(village ? { village: true } : {}), ...(tower ? { tower: true } : {}) }, null, 2) + "\n");

  mkdirSync(outputDir, { recursive: true });
  const known = ["hero-1.png", "hero-2.png", "hero-3.png", "orc-1.png", "orc-2.png", "orc-3.png", "world.png", "buildings.png"];
  for (const [name, data] of generated) {
    const temporary = path.join(outputDir, `.${name}.tmp`);
    writeFileSync(temporary, data);
    renameSync(temporary, path.join(outputDir, name));
  }
  for (const name of known) if (!generated.has(name)) rmSync(path.join(outputDir, name), { force: true });
  const temporaryManifest = path.join(outputDir, ".manifest.json.tmp");
  writeFileSync(temporaryManifest, manifest);
  renameSync(temporaryManifest, path.join(outputDir, "manifest.json"));
  console.log(`Artes instaladas em ${outputDir}: ${[hero && "espadachim (3 níveis)", orcs && "orcs (3 versões)", plants && "plantas e suprimentos", village && "casas da vila", tower && "torre de arqueiros"].filter(Boolean).join(", ")}.`);
  if (foundFemale) console.log("O pacote de base feminina foi encontrado, mas precisa de roupa/cabelo antes de virar um personagem jogável.");
  console.log("Não publique os arquivos gerados sem confirmar os termos da CraftPix.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
