import test from "node:test";
import assert from "node:assert/strict";
import { Engine, dodgeJumpHeight } from "../src/game/engine";
import { BESTIARY } from "../src/game/world-content";
import { SPRITES } from "../src/game/sprites";

const store = new Map();
const ctx = new Proxy({}, {
  get: (target, key) => key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
});
const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 1280, height: 720 }), addEventListener() {}, removeEventListener() {} };
globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.document = { createElement: () => canvas };
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });
function make(seed = 77, continueSave = false) {
  return new Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed, continueSave, onUi() {}, settings: { craftPix: false } });
}

// Reachability on the actual tile grid, including the village-house hitboxes.
function reachable(game) {
  const width = 190, tile = 32, seen = new Uint8Array(width * width), queue = new Int32Array(width * width);
  const start = 88 * width + 104;
  let head = 0, tail = 0; seen[start] = 1; queue[tail++] = start;
  while (head < tail) {
    const idx = queue[head++], x = idx % width, y = Math.floor(idx / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, at = yy * width + xx;
      if (xx < 0 || yy < 0 || xx >= width || yy >= width || seen[at]) continue;
      if (game.tiles[at] === 0 || game.referenceStructureAt(xx * tile + tile / 2, yy * tile + tile / 2)) continue;
      seen[at] = 1; queue[tail++] = at;
    }
  }
  return seen;
}

test("novos vilarejos e biomas são acessíveis com casas separadas em várias sementes", () => {
  for (const seed of [1, 2, 17, 77, 123, 999]) {
    const game = make(seed);
    assert.equal(game.hamlets.length, 4);
    assert.ok(game.tiles.some((t) => t === 14), `${seed}: outono`);
    assert.ok(game.tiles.some((t) => t === 15), `${seed}: cerejeiras`);
    const seen = reachable(game);
    for (const h of game.hamlets) {
      assert.equal(seen[Math.floor(h.y / 32) * 190 + Math.floor(h.x / 32)], 1, `${seed}: caminho até ${h.name}`);
      assert.ok(Math.hypot(h.x - 104 * 32, h.y - 88 * 32) > 1040, `${seed}: aldeia fora do maior anel da base`);
      assert.equal(game.villagers.filter((v) => v.hamletId === h.id && v.figure === undefined).length, 2);
      const obstructions = game.nodes.filter((n) => ["tree", "pine", "rock", "ore", "crystal"].includes(n.type) &&
        Math.abs(n.x - h.x) < 310 && n.y > h.y - 150 && n.y < h.y + 280);
      assert.equal(obstructions.length, 0, `${seed}: praça livre em ${h.name}`);
      for (const dx of [-215, 215]) {
        assert.equal(game.tileAt(h.x + dx, h.y - 75) === 0, false, `${seed}: casa em terra`);
        assert.equal(game.referenceStructureAt(h.x + dx, h.y - 75), true, `${seed}: casa sólida sem arte`);
        assert.equal(game.referenceStructureAt(h.x + dx, h.y + 140), false, `${seed}: entrada livre`);
      }
    }
    assert.equal(game.villagers.filter((v) => v.figure !== undefined).length, 4);
    const deposits = game.nodes.filter((n) => ["rock", "ore", "crystal"].includes(n.type) &&
      Math.hypot((n.x - 76 * 32) / 480, (n.y - 40 * 32) / 320) < 2);
    for (let i = 0; i < deposits.length; i++) for (let j = i + 1; j < deposits.length; j++) {
      assert.ok(Math.hypot(deposits[i].x - deposits[j].x, deposits[i].y - deposits[j].y) >= 50, `${seed}: depósitos sobrepostos`);
    }
    game.destroy();
  }
});

test("visitantes das referências mantêm pose parada e resposta identificada", () => {
  const game = make();
  const visitor = game.villagers.find((v) => v.figure === 0);
  game.px = visitor.x; game.py = visitor.y;
  const original = { x: visitor.x, y: visitor.y };
  for (let i = 0; i < 10; i++) game.updateVillagers(0.2);
  assert.deepEqual({ x: visitor.x, y: visitor.y }, original);
  const events = []; game.opts.onUi = (event) => events.push(event);
  game.rescues = []; game.chests = []; game.structures = []; game.allies = []; game.villagers = [visitor];
  game.tryInteract();
  assert.ok(events.some((event) => event.type === "toast" && event.text.startsWith("Bardo:")));
  game.destroy();
});

test("salvamento preserva construções e recursos quando uma aldeia nova conflita", () => {
  store.clear();
  const game = make(77);
  const h = game.hamlets[0], savedX = h.x - 215, savedY = h.y - 75;
  const resource = game.nodes.findIndex((node) => node.type === "tree" || node.type === "pine");
  game.nodes[resource].hp = 0; game.nodes[resource].respawn = 50; game.nodes[resource].stumpHp = 7;
  game.structures = [{ type: "house", x: savedX, y: savedY, hp: 100, maxHp: 300, open: false, prodT: 0, rotation: 0 }];
  game.saveGame(true); game.destroy();
  const restored = make(77, true);
  assert.equal(restored.hamlets.length, 3);
  assert.equal(restored.hamlets.some((v) => v.id === h.id), false);
  assert.equal(restored.villagers.some((v) => v.hamletId === h.id), false);
  assert.ok(restored.structures.some((s) => s.type === "house" && s.x === savedX && s.y === savedY));
  assert.equal(restored.nodes[resource].hp, 0); assert.equal(restored.nodes[resource].stumpHp, 7);
  restored.destroy(); store.clear();
});

test("arco do salto é visual e mantém custo, janela e recarga da esquiva", () => {
  const game = make(); game.skipCutscene();
  game.stamina = 100; game.tryRoll();
  assert.equal(game.stamina, 85); assert.equal(game.rollT, 0.26);
  assert.equal(game.rollCd, 0.85); assert.equal(game.invulnT, 0.32);
  assert.equal(dodgeJumpHeight(0.26), 0); assert.equal(dodgeJumpHeight(0), 0);
  assert.ok(Math.abs(dodgeJumpHeight(0.13) - 20) < 0.001);
  assert.ok(Math.abs(dodgeJumpHeight(0.2) - dodgeJumpHeight(0.06)) < 0.001);
  game.tryRoll(); assert.equal(game.stamina, 85, "recarga impede custo duplicado");
  game.destroy();
});

test("famílias novas surgem por bioma e permanecem jogáveis sem arte opcional", () => {
  const game = make(); game.skipCutscene(); game.escort.active = false;
  const originalTile = game.tileAt, originalRandom = Math.random;
  try {
    game.tileAt = () => 12; // necrópole
    for (const [roll, type] of [[0.1, "zombie"], [0.3, "skeleton"], [0.5, "lich"], [0.7, "vampire"]]) {
      Math.random = () => roll;
      assert.equal(game.monsterTypeForZone(0, 0), type);
      game.spawnMonster(1000, 1000, type);
      const monster = game.monsters.at(-1);
      assert.equal(monster.skin, type);
      assert.ok(monster.hp > 0 && monster.dmg > 0 && monster.speed > 0);
      assert.ok(SPRITES[type], `${type}: fallback`);
      assert.ok(BESTIARY.some((entry) => entry.sprite === type));
      game.killMonster(monster); game.killMonster(monster);
      assert.equal(game.creatureKills[type], 1, `${type}: não contar morte duas vezes`);
    }
    game.tileAt = () => 2; Math.random = () => 0.8;
    assert.equal(game.monsterTypeForZone(0, 0), "orc");
  } finally { Math.random = originalRandom; game.tileAt = originalTile; game.destroy(); }
});

test("lich dispara e pode causar dano; zumbi, esqueleto e vampiro atacam de perto", () => {
  const game = make(); game.skipCutscene(); game.escort.active = false; game.structures = []; game.tileAt = () => 2;
  game.px = 1000; game.py = 1000; game.hp = 100;
  for (const type of ["zombie", "skeleton", "vampire"]) {
    game.monsters = []; game.projectiles = []; game.invulnT = 0; game.hp = 100;
    game.spawnMonster(1025, 1000, type);
    game.monsters[0].state = "windup"; game.monsters[0].t = 0.001;
    game.updateMonsters(0.01); game.updateMonsters(0.01);
    assert.ok(game.hp < 100, `${type}: dano corpo a corpo`);
  }
  game.monsters = []; game.projectiles = []; game.invulnT = 0; game.hp = 100;
  game.spawnMonster(1180, 1000, "lich"); game.monsters[0].state = "windup"; game.monsters[0].t = 0.001;
  game.updateMonsters(0.01); assert.equal(game.projectiles.length, 1);
  for (let i = 0; i < 60 && game.hp === 100; i++) game.updateMonsters(0.01);
  assert.ok(game.hp < 100, "orbe do lich atinge o jogador");
  game.destroy();
});
