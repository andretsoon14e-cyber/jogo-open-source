import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/game/engine.ts";

const noop = () => {};
const context = new Proxy({}, {
  get: (_target, key) => key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop: noop }) : noop,
  set: () => true,
});
const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 1280, height: 720 }), addEventListener: noop, removeEventListener: noop };
const storage = new Map();
globalThis.window = { devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop };
globalThis.document = { createElement: () => canvas };
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
globalThis.cancelAnimationFrame = noop;
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });

function make(continueSave = false, onUi = noop) {
  return new Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed: 77, continueSave, settings: { craftPix: false }, onUi });
}

test("jogo começa sem recursos, coleta incrementa a mochila e salva sem perder ferramentas", () => {
  storage.clear();
  let snapshot;
  const game = make(false, (event) => { if (event.type === "snapshot") snapshot = event.snap; });
  const empty = { wood: 0, stone: 0, fiber: 0, food: 0, iron: 0, crystal: 0 };
  assert.deepEqual(game.inv, empty);
  game.skipCutscene();
  assert.deepEqual(snapshot.inv, empty);
  assert.deepEqual(game.tools, { axe: 1, pick: 1, sword: 1 }, "ferramentas dadas por Rian continuam utilizáveis");
  game.drops.push({ res: "wood", x: game.px, y: game.py, vx: 0, vy: 0, n: 2, t: 0 });
  game.updateDrops(0.4); game.emitSnapshot();
  assert.deepEqual(snapshot.inv, { ...empty, wood: 2 }, "somente o recurso coletado entra no inventário");
  assert.equal(game.drops.length, 0);
  game.saveGame(true);
  const saved = { ...game.inv }, loaded = make(true);
  assert.deepEqual(loaded.inv, saved, "save existente mantém os recursos coletados");
  assert.deepEqual(loaded.tools, game.tools);
  loaded.destroy(); game.destroy();
});

test("som acompanha a ferramenta escolhida mesmo no mesmo alvo, sem alterar a coleta automática", () => {
  storage.clear(); const game = make(); game.skipCutscene();
  game.px = 1000; game.py = 1000; game.pdir = 0;
  game.monsters = []; game.animals = []; game.nearbyNodes = () => [];
  const swings = [], impacts = [];
  game.sfx.swing = (tool) => swings.push(tool);
  game.sfx.chop = () => impacts.push("wood");
  game.sfx.mine = (kind) => impacts.push(kind);
  game.sfx.hit = () => impacts.push("enemy");
  const attack = () => {
    const before = swings.length;
    game.attackCd = 0; game.rollT = 0; game.tryAttack();
    assert.equal(swings.length, before + 1, "cada ataque emite exatamente um balanço");
  };
  for (const tool of ["axe", "pick", "sword"]) { game.heldTool = tool; attack(); }
  assert.deepEqual(swings, ["axe", "pick", "sword"], "cada ferramenta soa diferente mesmo golpeando o ar");

  const fp = game.facingPoint(34);
  const node = (type) => ({ type, x: fp.x, y: fp.y, hp: 100, maxHp: 100, wob: 0, respawn: 0 });
  let target = node("tree"); game.nearbyNodes = () => [target];
  for (const tool of ["axe", "pick", "sword"]) {
    game.heldTool = tool; attack();
    assert.equal(game.swingTool, "axe", "a animação automática de coleta não mudou");
    assert.equal(swings.at(-1), tool, "o balanço distingue a ferramenta selecionada na mesma árvore");
    assert.equal(impacts.at(-1), "wood", "o impacto continua correspondendo à madeira");
  }
  target = node("rock"); game.heldTool = "axe"; attack();
  assert.equal(game.swingTool, "pick"); assert.equal(swings.at(-1), "axe"); assert.equal(impacts.at(-1), "rock");

  game.nearbyNodes = () => [];
  game.monsters = [0, 1].map(() => ({ x: fp.x, y: fp.y, r: 12, hp: 100, vx: 0, vy: 0, type: "imp" }));
  game.heldTool = "pick"; const before = swings.length; attack();
  assert.deepEqual(swings.slice(before), ["pick"], "um ataque a vários alvos emite apenas um balanço");
  assert.ok(game.monsters.every((monster) => monster.hp < 100), "o dano continua funcionando");

  game.monsters = []; game.animals = [{ x: fp.x, y: fp.y }]; game.hitAnimal = noop;
  game.heldTool = "axe"; attack(); assert.equal(game.swingTool, "sword"); assert.equal(swings.at(-1), "axe");
  game.animals = []; game.heldTool = "sword"; game.combatWeapon = "bow"; attack();
  assert.equal(swings.at(-1), "bow"); assert.equal(game.projectiles.length, 1, "o arco ainda dispara");
  game.destroy();
});
