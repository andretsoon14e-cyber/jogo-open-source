import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/game/engine";

const context = new Proxy({}, {
  get: (_target, key) => key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
});
const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 1280, height: 720 }), addEventListener() {}, removeEventListener() {} };
globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.document = { createElement: () => canvas };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });

function make(seed = 77, overrides = {}) {
  return new Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed, continueSave: false, onUi() {}, settings: { craftPix: false, windSounds: false, creatureSounds: false }, ...overrides });
}

// Seek dry ground where one sound is close and the other is beyond earshot.
function findPlace(game, kind) {
  const W = 190;
  for (let ty = 8; ty < 182; ty += 2) for (let tx = 8; tx < 182; tx += 2) {
    if (game.tiles[ty * W + tx] === 0) continue;
    let sea = 192 ** 2, stream = 192 ** 2;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tx + dx, y = ty + dy, i = y * W + x;
      if (game.tiles[i] !== 0) continue;
      const d = (dx * 32) ** 2 + (dy * 32) ** 2;
      if (game.oceanTiles[i]) sea = Math.min(sea, d); else stream = Math.min(stream, d);
    }
    if (kind === "sea" && sea < 96 ** 2 && stream >= 192 ** 2 ||
        kind === "stream" && stream < 96 ** 2 && sea >= 192 ** 2 ||
        kind === "dry" && sea >= 192 ** 2 && stream >= 192 ** 2) return { x: (tx + 0.5) * 32, y: (ty + 0.5) * 32 };
  }
  throw new Error(`Nenhum terreno para ${kind}`);
}

test("mar e riachos usam a costa real em sementes diferentes; distância, fogueira e opções funcionam", () => {
  for (const seed of [1, 77, 999]) {
    const game = make(seed), heard = {};
    game.sfx.water = (value, type) => { heard[type] = value; };
    game.sfx.fire = (value) => { heard.fire = value; };
    game.sfx.setAmbient = (type, value) => { heard[type] = value; };
    for (const place of ["sea", "stream", "dry"]) {
      const { x, y } = findPlace(game, place); game.px = x; game.py = y;
      game.structures = [{ type: "campfire", x: x + 22, y, hp: 100 }];
      game.updateAmbience();
      if (place === "sea") { assert.ok(heard.sea > 0.4, `${seed}: ondas na praia`); assert.equal(heard.water, 0, `${seed}: praia não vira riacho`); }
      if (place === "stream") { assert.ok(heard.water > 0.4, `${seed}: riacho`); assert.equal(heard.sea, 0, `${seed}: riacho não vira mar`); }
      if (place === "dry") { assert.equal(heard.water, 0); assert.equal(heard.sea, 0); }
      assert.ok(heard.fire > 0.8, "fogueira audível de perto");
      game.structures[0].x += 500; game.updateAmbience(); assert.equal(heard.fire, 0, "fogueira distante não é audível");
    }
    game.settings.ambientSounds = false; game.updateAmbience();
    assert.deepEqual([heard.sea, heard.water, heard.fire], [0, 0, 0], "opção desliga os três ambientes");
    game.destroy();
  }
});

test("botão de controle tenta retomar os dois contextos mesmo durante o despertar", () => {
  let sfxResumes = 0, musicResumes = 0;
  const music = { setEnabled() {}, setVolume() {}, setVoice() {}, resume() { musicResumes++; } };
  const game = make(77, { music });
  game.sfx.ensure = () => { sfxResumes++; };
  game.wakeT = 1;
  Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [{ axes: [0, 0], buttons: [{ pressed: true }] }] }, configurable: true });
  try {
    game.pollGamepad(); game.pollGamepad();
    assert.equal(sfxResumes, 1); assert.equal(musicResumes, 1);
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });
    game.destroy();
  }
});
