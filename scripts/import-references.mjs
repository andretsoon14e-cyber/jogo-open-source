#!/usr/bin/env node
/* Prepare the previews supplied by the project owner for local use only.
 * Their public redistribution is not assumed; generated PNGs stay ignored. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { makeArcher, makeMage, makeReferenceObject } from "./reference-art-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let output = path.join(root, "public", "referencias");
const at = args.indexOf("--output");
if (at >= 0) {
  if (!args[at + 1] || args[at + 1].startsWith("--")) fail("Informe uma pasta depois de --output.");
  output = path.resolve(args[at + 1]); args.splice(at, 2);
}
if (args.length !== 1 || args[0].startsWith("--")) fail("Uso: npm run import:referencias -- <pasta das imagens enviadas> [--output pasta]");
const folder = path.resolve(args[0]);
function fail(message) { console.error(`Importação das referências: ${message}`); process.exit(1); }

// Exact hashes prevent accidentally cutting the wrong file, since filenames
// like image-8.png are generic and crop coordinates are screenshot-specific.
const hashes = {
  1: "365a5b4c306d932bfa41bfecdf454a29f45397b73b1321a9d63e5adc2897d2b9",
  3: "6a8b9b0236817669d35b565980bdf410198f8388a7b86063f1eb40be030de277",
  6: "e0f30997af2e440e125c51d84dd5c39089863620fbb40219770e9f1fcebe4498",
  8: "b67fe377439f89756a73573692db103f62081e74b6889c431b780bd655a0144d",
  13: "7e9626307a3c13075985ef0e002f8b8ac531571097f2e9454a5beb32719addeb",
  15: "6fab4eeb73378d614111fd6cd583ee3733d79c552219ad1689b81bede6b1ad15",
  16: "dcbdbec7b331f81971fc1fb8ae70a0cc1e828322b2b429b5697c05fdc62ef339",
  21: "681e460453bc98809cff5d528032c5d40ccc50386ad9c611790c75641e9329e5",
  22: "8ccd79e95524660a2d240df09f5cd98ae330406b73ba57a9d0f9840c6efe267b",
  24: "a959d6700a841036706d7954b958a220fed6a14291fc84ce071e5135224ffa8c",
  26: "38daec85c43b6727365c29a5e26ea02d6780d312fb7df0205c6911bd25525c82",
  28: "83e5befa6ea59c425e7841308b0a7237e26b163387840c9c45d8cfa1cb5e363d",
  30: "a6469375a638239e4874bc273e0fe404a3fca2a9673c5ef7b7f92c7c633c5995",
  31: "6335370c86058d68942252ebd2dd9eb7471133aabdb0bb43784f91ab412fc09d",
  36: "bbc91be1fc8650df3b4c40185a65bd89a422d122a2129feef934322b4a74c8a2",
  41: "508c85cb75d84215f2ee48ff7f64bd222912990ad810905b46a8ba978457a9ef",
  42: "bd7494f255a915ba2ca15cd3073b65a008c93264aacd1f33bf3ab0ef54c43e46",
  49: "3deefb2ced5debc2653347936adfd3aa80815bd4b18ea0f1598e92217a201a70",
  50: "9fdca436088aad169408a5d161c1045df8fb64431e20ba0b68039998d9e6d566",
  52: "155e7e177eb19cf80b11b8669d7b3ea0ba8b1a609ab7f0c3154c0ae27c5d1ed5",
  54: "63de1486683ed0ed2d627c4904b09b0cbc42ab54694b8d4c61ebad947617efe8",
  60: "d866683c2168ffe24b553da24553d547f93ae05fd65331a9c87f486c824f2a95",
  62: "acf91cd4ccfc21a9089ea39d52e3ac4b11f33c66ee9c2e1c58b5feb9aa82fb8f",
  65: "2911ade165ebcd0cdd17a9b076e07e66730d784d1f715830ceffe314aa3e9f63",
};
const objects = {
  forge: { id: 8, left: 55, top: 50, width: 795, height: 640, targetWidth: 260, targetHeight: 210, mainOnly: true },
  house: { id: 8, left: 825, top: 45, width: 530, height: 600, targetWidth: 220, targetHeight: 250, mainOnly: true },
  chest: { id: 26, left: 1260, top: 625, width: 220, height: 180, targetWidth: 100, targetHeight: 82, mainOnly: true },
  chapel: { id: 22, left: 60, top: 50, width: 620, height: 760, targetWidth: 240, targetHeight: 294, mainOnly: true },
  market: { id: 3, left: 590, top: 680, width: 500, height: 440, targetWidth: 200, targetHeight: 176, mainOnly: true },
  camp: { id: 26, left: 50, top: 45, width: 460, height: 460, targetWidth: 200, targetHeight: 200, mainOnly: false },
  sewer: { id: 16, left: 1120, top: 620, width: 300, height: 130, targetWidth: 200, targetHeight: 87, mainOnly: true },
  castle_wall: { id: 49, left: 560, top: 145, width: 165, height: 310, targetWidth: 44, targetHeight: 84, mainOnly: true, background: [252, 225, 184] },
  castle_tower: { id: 49, left: 1495, top: 540, width: 240, height: 420, targetWidth: 112, targetHeight: 196, mainOnly: true, background: [252, 225, 184] },
  castle_gate: { id: 50, left: 1310, top: 225, width: 470, height: 400, targetWidth: 82, targetHeight: 70, mainOnly: true, background: [252, 225, 184] },
  castle_grate: { id: 50, left: 1570, top: 900, width: 225, height: 180, targetWidth: 31, targetHeight: 25, mainOnly: true, clearInside: true, background: [252, 225, 184] },
};
// Matching tools and materials from the submitted GUI icon sheet.
const iconCrops = [
  ["sword", 548, 80], ["axe", 548, 755], ["pick", 548, 945], ["wood", 1650, 755],
  ["fiber", 1520, 80], ["food", 1520, 370], ["iron", 955, 465], ["crystal", 960, 945],
];
// Six shrub variants from the supplied sheet (blue, fern, red, berry, green,
// snow). Shadows baked into the screenshot are removed during the crop.
const plantCrops = [
  [60, 100, 200, 190], [640, 100, 230, 200], [60, 350, 210, 215],
  [665, 360, 200, 200], [60, 650, 180, 180], [1050, 635, 170, 180],
];
const scenes = {
  forge: { id: 6, top: 230, height: 930 },
  chapel: { id: 21, top: 0, height: 1200 },
  market: { id: 1, top: 230, height: 970 },
  camp: { id: 24, top: 230, height: 970 },
  sewer: { id: 15, top: 230, height: 970 },
};

// Largest examples from each row of the supplied mineral and rock sheets.
// Keeping the atlas local avoids publishing extractable third-party artwork.
const mineralRows = [[30, 250], [280, 215], [495, 215], [710, 215], [930, 205]];
const rockRows = [[70, 220], [350, 205], [630, 215], [920, 210]];
async function makeDepositAtlas(input, rows, sides) {
  const size = 96, pieces = [];
  for (const [top, height] of rows) for (const [left, width] of sides) {
    const crop = await makeReferenceObject(input, { left, top, width, height, targetWidth: width, targetHeight: height, mainOnly: true, shadowBelow: 0.55 });
    // Preserve aspect ratio and ground the silhouette inside each cell.
    const { data, info } = await sharp(crop).trim({ threshold: 5 }).resize(90, 90, { fit: "inside", kernel: "nearest" }).png().toBuffer({ resolveWithObject: true });
    pieces.push({ input: data, left: pieces.length * size + Math.floor((size - info.width) / 2), top: size - info.height });
  }
  return sharp({ create: { width: rows.length * sides.length * size, height: size, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const inputs = {};
  for (const [id, expected] of Object.entries(hashes)) {
    const file = path.join(folder, `image-${id}.png`);
    if (!existsSync(file)) continue;
    const data = readFileSync(file);
    if (data.length > 8 * 1024 * 1024 || createHash("sha256").update(data).digest("hex") !== expected) {
      throw new Error(`image-${id}.png não corresponde à imagem fornecida. Nenhum arquivo foi alterado.`);
    }
    const meta = await sharp(data).metadata();
    if (meta.width !== 1800 || meta.height !== 1200) throw new Error(`Dimensões inesperadas em image-${id}.png.`);
    inputs[id] = data;
  }
  if (!!inputs[30] !== !!inputs[31]) throw new Error("As duas imagens do arqueiro (image-30.png e image-31.png) precisam estar juntas.");
  if (inputs[60] && !inputs[28]) throw new Error("O arqueiro de capuz precisa das imagens image-60.png e image-28.png juntas.");

  const generated = new Map();
  const manifest = { version: 1, archer: !!inputs[30], archerHood: !!inputs[60], mageBlue: !!inputs[62], mageRed: !!inputs[65], minerals: !!inputs[52], rocks: !!inputs[54], icons: !!inputs[13], plants: !!inputs[41], bow: !!inputs[36], menu: !!inputs[42], objects: {}, scenes: {} };
  if (inputs[30]) generated.set("archer.png", await makeArcher(inputs));
  if (inputs[60]) generated.set("archer-hood.png", await makeArcher(inputs, { idleWalkId: 60, runAttackId: 28, walkStep: 128 }));
  if (inputs[62]) generated.set("mage-blue.png", await makeMage(inputs[62], "blue"));
  if (inputs[65]) generated.set("mage-red.png", await makeMage(inputs[65], "red"));
  if (inputs[52]) generated.set("minerals.png", await makeDepositAtlas(inputs[52], mineralRows, [[65, 240], [995, 255]]));
  if (inputs[54]) generated.set("rocks.png", await makeDepositAtlas(inputs[54], rockRows, [[65, 215], [930, 220]]));
  if (inputs[41]) {
    const pieces = [];
    for (const [index, [left, top, width, height]] of plantCrops.entries()) {
      const input = await makeReferenceObject(inputs[41], { left, top, width, height, targetWidth: 64, targetHeight: 64, mainOnly: true, shadowBelow: 0.55 });
      pieces.push({ input, left: index * 64, top: 0 });
    }
    generated.set("plants.png", await sharp({ create: { width: 384, height: 64, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer());
  }
  if (inputs[36]) generated.set("bow.png", await makeReferenceObject(inputs[36], {
    left: 625, top: 165, width: 110, height: 105, targetWidth: 64, targetHeight: 64, mainOnly: true, background: [145, 126, 105],
  }));
  if (inputs[42]) generated.set("menu.png", await sharp(inputs[42]).resize(960, 640, { kernel: "nearest" }).png({ compressionLevel: 9 }).toBuffer());
  if (inputs[13]) {
    const pieces = [];
    for (const [index, [, left, top]] of iconCrops.entries()) {
      pieces.push({ input: await makeReferenceObject(inputs[13], { left, top, width: 75, height: 75, targetWidth: 64, targetHeight: 64, mainOnly: true }), left: index * 64, top: 0 });
    }
    generated.set("icons.png", await sharp({ create: { width: 512, height: 64, channels: 4, background: "#00000000" } }).composite(pieces).png({ compressionLevel: 9 }).toBuffer());
  }
  for (const [name, spec] of Object.entries(objects)) {
    manifest.objects[name] = !!inputs[spec.id];
    if (inputs[spec.id]) generated.set(`${name}.png`, await makeReferenceObject(inputs[spec.id], spec));
  }
  for (const [name, spec] of Object.entries(scenes)) {
    manifest.scenes[name] = !!inputs[spec.id];
    if (!inputs[spec.id]) continue;
    const height = Math.round(spec.height * 960 / 1800);
    const buffer = await sharp(inputs[spec.id]).extract({ left: 0, top: spec.top, width: 1800, height: spec.height })
      .resize(960, height, { kernel: "nearest" }).png({ compressionLevel: 9 }).toBuffer();
    generated.set(`scene-${name}.png`, buffer);
  }
  if (!generated.size) throw new Error("Nenhuma das imagens reconhecidas foi encontrada.");

  mkdirSync(output, { recursive: true });
  const known = ["archer.png", "archer-hood.png", "mage-blue.png", "mage-red.png", "minerals.png", "rocks.png", "icons.png", "plants.png", "bow.png", "menu.png", ...Object.keys(objects).map((n) => `${n}.png`), ...Object.keys(scenes).map((n) => `scene-${n}.png`)];
  for (const [name, buffer] of generated) {
    const temp = path.join(output, `.${name}.tmp`); writeFileSync(temp, buffer); renameSync(temp, path.join(output, name));
  }
  for (const name of known) if (!generated.has(name)) rmSync(path.join(output, name), { force: true });
  const temp = path.join(output, ".manifest.json.tmp");
  writeFileSync(temp, JSON.stringify(manifest, null, 2) + "\n"); renameSync(temp, path.join(output, "manifest.json"));
  console.log(`Referências preparadas em ${output}: ${[...generated.keys()].join(", ")}.`);
  console.log("As imagens fornecidas são prévias; os recortes podem ter menos nitidez. Confirme as licenças antes de redistribuí-los.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
