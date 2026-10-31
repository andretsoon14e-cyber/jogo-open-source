import test from "node:test";
import assert from "node:assert/strict";
import terrainModule from "../src/game/terrain.ts";

const { collectBridgeRegions, T_WATER, T_GRASS, T_BRIDGE } = terrainModule;

test("pontes seguem os tiles transitáveis, distinguem orientações e não alteram a geração", () => {
  const width = 13, height = 11;
  const tiles = new Uint8Array(width * height).fill(T_GRASS);
  const put = (x, y, tile) => { tiles[y * width + x] = tile; };
  for (let x = 2; x <= 5; x++) { put(x, 2, T_WATER); put(x, 3, T_BRIDGE); put(x, 4, T_WATER); }
  for (let y = 6; y <= 8; y++) { put(8, y, T_WATER); put(9, y, T_BRIDGE); put(10, y, T_WATER); }
  put(1, 9, T_BRIDGE); // dry foundation is not a decorative crossing
  const before = tiles.slice(), random = Math.random;
  let regions;
  try {
    Math.random = () => { throw new Error("não pode consumir o RNG do mundo"); };
    regions = collectBridgeRegions(tiles, width, height);
  } finally { Math.random = random; }
  assert.deepEqual(tiles, before);
  assert.equal(regions.length, 2);
  const horizontal = regions.find((region) => region.x === 2 && region.y === 3);
  const vertical = regions.find((region) => region.x === 9 && region.y === 6);
  assert.deepEqual([horizontal.width, horizontal.height, horizontal.tiles.length], [4, 1, 4]);
  assert.deepEqual([vertical.width, vertical.height, vertical.tiles.length], [1, 3, 3]);
  assert.match(horizontal.art, /_h$/);
  assert.match(vertical.art, /_v$/);
  assert.equal(tiles[3 * width + 3], T_BRIDGE);
  assert.equal(tiles[2 * width + 3], T_WATER);
});

test("cruzamentos enormes não recebem uma única imagem esticada", () => {
  const width = 22, height = 5, tiles = new Uint8Array(width * height).fill(T_GRASS);
  for (let x = 2; x <= 17; x++) { tiles[2 * width + x] = T_BRIDGE; tiles[width + x] = T_WATER; }
  assert.deepEqual(collectBridgeRegions(tiles, width, height), []);
});
