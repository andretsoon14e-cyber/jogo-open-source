import test from "node:test";
import assert from "node:assert/strict";
import { Engine, dodgeJumpHeight } from "../src/game/engine";
import { BESTIARY } from "../src/game/world-content";
import { SPRITES } from "../src/game/sprites";
import { anchoredRect, rectanglesOverlap, resourceArtBounds, tileAreaIndex } from "../src/game/world-layout";

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
function make(seed = 77, continueSave = false, craftPix = false) {
  return new Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed, continueSave, onUi() {}, settings: { craftPix } });
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
  for (const seed of [1, 2, 5, 17, 77, 123, 999]) {
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
      assert.equal(h.houses.length, 2, `${seed}: duas casas em ${h.name}`);
      for (const house of h.houses) {
        assert.notEqual(game.tileAt(house.x, house.y), 0, `${seed}: casa em terra`);
        assert.equal(game.referenceStructureAt(house.x, house.y - 75), true, `${seed}: casa sólida sem arte`);
        assert.equal(game.referenceStructureAt(house.x, house.y + 20), false, `${seed}: entrada livre`);
      }
    }
    assert.equal(game.villagers.filter((v) => v.figure !== undefined).length, 4);
    const buildings = [...game.villageHouses, ...game.hamlets.flatMap((hamlet) => hamlet.houses), ...game.villageBuildings];
    for (const building of buildings) {
      const tx = Math.floor(building.x / 32), ty = Math.floor((building.y + 24) / 32);
      assert.equal(seen[ty * 190 + tx], 1, `${seed}: entrada acessível em (${building.x}, ${building.y})`);
    }
    const deposits = game.nodes.filter((n) => ["rock", "ore", "crystal"].includes(n.type) &&
      Math.hypot((n.x - 76 * 32) / 480, (n.y - 40 * 32) / 320) < 2);
    for (let i = 0; i < deposits.length; i++) for (let j = i + 1; j < deposits.length; j++) {
      assert.ok(Math.hypot(deposits[i].x - deposits[j].x, deposits[i].y - deposits[j].y) >= 50, `${seed}: depósitos sobrepostos`);
    }
    game.destroy();
  }
});

test("trilhas não são cobertas por copas, plantas, depósitos, casas, capela ou feira", () => {
  for (const seed of [1, 2, 3, 17, 77, 123, 235, 999, 65535]) {
    const game = make(seed);
    const roads = tileAreaIndex(game.tiles, 190, 190, 32, (tile) => [4, 7, 11].includes(tile));
    const water = tileAreaIndex(game.tiles, 190, 190, 32, (tile) => tile === 0);
    const houses = [...game.villageHouses, ...game.hamlets.flatMap((h) => h.houses)];
    for (const [index, chest] of game.chests.entries()) {
      if (index === 1) continue; // baú da base mantém a posição de saves antigos
      assert.equal(roads.count(anchoredRect(chest.x, chest.y + 4, 52, 34)), 0, `${seed}: baú fora da trilha`);
    }
    assert.equal(game.villageHouses.length, 5, `${seed}: cinco casas principais`);
    assert.equal(game.villageBuildings.length, 2, `${seed}: capela e feira`);
    assert.ok(game.villageHouses.every((house) => house.scale === 1.8));
    assert.ok(game.hamlets.every((hamlet) => hamlet.houses.length === 2 && hamlet.houses.every((house) => house.scale === 1.35)));
    const rects = [
      ...houses.map((house) => anchoredRect(house.x, house.y, 220 * house.scale, 250 * house.scale)),
      ...game.villageBuildings.map((b) => anchoredRect(b.x, b.y, b.width, b.height)),
    ];
    for (const rect of rects) {
      assert.equal(roads.count(rect), 0, `${seed}: construção sobre trilha`);
      assert.equal(water.count(rect), 0, `${seed}: construção sobre água`);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      assert.equal(rectanglesOverlap(rects[i], rects[j], 50), false, `${seed}: construções muito juntas`);
    }
    for (const node of game.nodes) {
      const art = resourceArtBounds(node.type, node.x, node.y);
      assert.equal(roads.count(art), 0, `${seed}: ${node.type} cobre uma trilha`);
      assert.equal(rects.some((r) => rectanglesOverlap(art, r)), false, `${seed}: ${node.type} cobre construção`);
    }
    const chest = game.chests.find((c) => c.label === "Baú do vilarejo");
    assert.equal(roads.count(anchoredRect(chest.x, chest.y + 4, 52, 34, 6)), 0, `${seed}: baú sobre trilha`);
    game.destroy();
  }
  const withoutArt = make(77, false, false), withArt = make(77, false, true);
  assert.deepEqual(withArt.villageHouses, withoutArt.villageHouses, "artes opcionais não mudam o traçado");
  assert.deepEqual(withArt.hamlets, withoutArt.hamlets);
  assert.deepEqual(withArt.villageBuildings, withoutArt.villageBuildings);
  assert.deepEqual(withArt.nodes.map(({ x, y, type }) => ({ x, y, type })), withoutArt.nodes.map(({ x, y, type }) => ({ x, y, type })));
  withoutArt.destroy(); withArt.destroy();
});

test("construções de um save prevalecem sobre novas casas e pontos fixos", () => {
  store.clear();
  const game = make(77), home = game.villageHouses[0], chapel = game.villageBuildings.find((b) => b.name === "chapel");
  const makeStructure = (x, y) => ({ type: "house", x, y, hp: 100, maxHp: 300, open: false, prodT: 0, rotation: 0 });
  game.structures = [makeStructure(home.x, home.y), makeStructure(chapel.x, chapel.y)];
  game.chests[2].opened = true;
  game.saveGame(true); game.destroy();
  const restored = make(77, true);
  assert.equal(restored.structures.length, 2);
  assert.deepEqual(restored.structures.map(({ x, y }) => ({ x, y })), [{ x: home.x, y: home.y }, { x: chapel.x, y: chapel.y }]);
  assert.equal(restored.villageHouses.some((h) => h.index === home.index), false);
  assert.equal(restored.villageBuildings.some((b) => b.name === "chapel"), false);
  assert.equal(restored.worldProps.some((p) => p.sprite === "reference_chapel"), false);
  assert.equal(restored.chests[2].opened, true, "posição do baú pode mudar sem perder seu estado");
  restored.destroy(); store.clear();
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
  const h = game.hamlets[0], savedX = h.houses[0].x, savedY = h.houses[0].y;
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

test("recursos são afastados de casas e cercas salvas sem perder vida, tocos ou posição da construção", () => {
  store.clear(); const game = make(77); game.escort.active = false;
  const trees = game.nodes.filter((node) => node.type === "tree" || node.type === "pine");
  const tree = trees[0], stump = trees.find((node) => Math.hypot(node.x - tree.x, node.y - tree.y) > 800);
  const i = game.nodes.indexOf(tree), j = game.nodes.indexOf(stump);
  const house = { type: "house", x: tree.x, y: tree.y + 20, hp: 147, maxHp: 220, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
  const fence = { type: "wall", x: stump.x, y: stump.y, hp: 81, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
  tree.hp = tree.maxHp - 1; stump.hp = 0; stump.stumpHp = 5; stump.respawn = 70;
  game.structures = [house, fence]; game.saveGame(true);
  const restored = make(77, true), savedHouse = restored.structures.find((s) => s.type === "house");
  assert.deepEqual([savedHouse.x, savedHouse.y, savedHouse.hp], [house.x, house.y, house.hp]);
  assert.equal(restored.nodes[i].hp, tree.hp); assert.equal(restored.nodes[j].stumpHp, 5);
  const houseArea = anchoredRect(house.x, house.y + 60, 300, 320);
  assert.equal(rectanglesOverlap(resourceArtBounds(restored.nodes[i].type, restored.nodes[i].x, restored.nodes[i].y), houseArea), false);
  assert.ok(Math.hypot(restored.nodes[j].x - fence.x, restored.nodes[j].y - fence.y) >= 60);
  assert.equal(restored.structures.find((s) => s.type === "wall").hp, fence.hp);
  restored.destroy(); game.destroy(); store.clear();
});

test("salto mantém o personagem no lugar com teclado, controle e toque; caminhar volta ao aterrissar", () => {
  for (const input of ["keyboard", "gamepad", "touch"]) {
    const game = make(); game.skipCutscene(); game.escort.active = false;
    game.tileAt = () => 2; game.referenceStructureAt = () => false; game.structures = []; game.chests = [];
    game.animals = []; game.monsters = []; game.updateSpawns = () => {}; game.nodeBuckets.clear();
    game.px = 1200; game.py = 1200; game.pvx = 180; game.pvy = 45; game.stamina = 100;
    if (input === "keyboard") game.keys.add("d");
    if (input === "touch") game.touchMove.x = 1;
    const pad = input === "gamepad" ? { mx: 1, my: 0, run: true } : { mx: 0, my: 0 };
    game.tryRoll();
    assert.equal(game.stamina, 85); assert.equal(game.pvx, 0); assert.equal(game.pvy, 0);
    for (let frame = 0; frame < 13; frame++) {
      game.update(0.02, pad);
      assert.equal(game.px, 1200, `${input}: salto não deve avançar`);
      assert.equal(game.py, 1200, `${input}: salto não deve deslizar`);
    }
    assert.ok(game.invulnT > 0); const hp = game.hp;
    game.damagePlayer(20, 1000, 1000); assert.equal(game.hp, hp, `${input}: invulnerabilidade preservada`);
    game.update(0.02, pad);
    assert.ok(game.px > 1200, `${input}: movimento retorna ao pousar`);
    game.destroy();
  }
});

test("troncos pequenos permitem contornar, deslizar e sair sem atravessá-los mesmo em corrida", () => {
  const game = make(); game.skipCutscene(); game.escort.active = false;
  game.tileAt = () => 2; game.referenceStructureAt = () => false; game.structures = []; game.chests = [];
  game.animals = []; game.monsters = []; game.updateSpawns = () => {};
  const tree = { type: "tree", x: 1050, y: 1000, hp: 24, maxHp: 24, respawn: 0, wob: 0 };
  game.nodes = [tree]; game.rebuildNodeBuckets();
  game.px = 1038; game.py = 1000; game.pvx = 278; game.pvy = 0;
  game.update(0.1, { mx: 1, my: 0, run: true });
  assert.ok(game.px <= 1040, "uma passada longa não atravessa o tronco");
  game.px = 1000; game.py = 1012; game.pvx = 0; game.pvy = 0;
  for (let i = 0; i < 45; i++) game.update(1 / 60, { mx: 1, my: 0 });
  assert.ok(game.px > 1090, "a borda da copa não deve bloquear");
  game.px = 1038; game.py = 1000; game.pvx = 0; game.pvy = 0;
  for (let i = 0; i < 45; i++) game.update(1 / 60, { mx: 1, my: 1 });
  assert.ok(game.px > 1050 && game.py > 1020, "é possível deslizar pelo tronco");
  game.px = tree.x; game.py = tree.y; game.pvx = 0; game.pvy = 0;
  for (let i = 0; i < 20; i++) game.update(1 / 60, { mx: 1, my: 0 });
  assert.ok(game.px > tree.x + 10, "um save dentro do tronco consegue sair");
  game.destroy();
});

test("monstros saem de trás de casas, não ficam presos em árvores e não surgem dentro do tronco", () => {
  const game = make(); game.skipCutscene(); game.escort.active = false;
  game.tileAt = () => 2; game.structures = []; game.chests = []; game.time = 280;
  game.px = 1400; game.py = 1000; game.invulnT = 100;
  game.referenceStructureAt = (x, y) => x > 1100 && x < 1200 && y > 925 && y < 1075;
  game.monsters = []; game.spawnMonster(1000, 1000, "imp");
  let monster = game.monsters[0]; monster.state = "chase";
  for (let i = 0; i < 180; i++) {
    game.updateMonsters(1 / 30);
    assert.equal(game.referenceStructureAt(monster.x, monster.y), false, "não deve atravessar a construção");
  }
  assert.ok(monster.x > 1200, "contornou a construção ao invés de oscilar na parede");
  game.referenceStructureAt = () => false; game.monsters = [];
  const tree = { type: "tree", x: 1150, y: 1000, hp: 24, maxHp: 24, respawn: 0, wob: 0 };
  game.nodes = [tree]; game.rebuildNodeBuckets();
  assert.equal(game.monsterSpawnClear(tree.x, tree.y, "imp"), false);
  assert.equal(game.monsterSpawnClear(tree.x + 45, tree.y, "imp"), true);
  game.spawnMonster(1000, 1000, "imp"); monster = game.monsters[0]; monster.state = "chase";
  for (let i = 0; i < 90; i++) game.updateMonsters(1 / 30);
  assert.ok(monster.x > tree.x + 40, "árvores não prendem a perseguição");
  game.destroy();
});

test("copas ficam translúcidas quando uma criatura passa atrás delas", () => {
  const alphas = [];
  const state = { globalAlpha: 1, drawImage() { alphas.push(this.globalAlpha); } };
  const painter = new Proxy(state, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
  const view = { ...canvas, getContext: () => painter };
  const game = new Engine({ canvas: view, mode: "single", difficulty: "dificil", playerName: "Teste", seed: 77, continueSave: false, onUi() {}, settings: { craftPix: false, treeMotion: false } });
  game.px = 1800; game.py = 1800; game.monsters = [];
  const tree = { type: "tree", x: 1000, y: 1000, hp: 24, maxHp: 24, respawn: 0, wob: 0 };
  game.drawNode(tree, 0, 0, 0); assert.equal(alphas.at(-1), 1);
  game.spawnMonster(1000, 940, "imp"); alphas.length = 0;
  game.drawNode(tree, 0, 0, 0); assert.equal(alphas.at(-1), 0.45);
  game.monsters[0].hp = 0; alphas.length = 0;
  game.drawNode(tree, 0, 0, 0); assert.equal(alphas.at(-1), 1);
  game.destroy();
});

test("todos os sprites locais de monstros usam a mesma redução sem mudar as estatísticas", () => {
  const scales = [];
  const state = { globalAlpha: 1, scale(x, y) { scales.push([x, y]); } };
  const painter = new Proxy(state, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
  const view = { ...canvas, getContext: () => painter };
  const game = new Engine({ canvas: view, mode: "single", difficulty: "dificil", playerName: "Teste", seed: 77, continueSave: false, onUi() {}, settings: { craftPix: false } });
  game.monsters = [];
  for (const type of ["imp", "orc", "crawler", "lizard", "zombie", "demon", "vampire", "lich", "skeleton", "bat", "hulk", "brute"]) {
    game.spawnMonster(1000, 1000, type); const monster = game.monsters.at(-1);
    const before = { hp: monster.hp, dmg: monster.dmg, speed: monster.speed, r: monster.r };
    scales.length = 0; game.drawMonster(monster, 0, 0, 0);
    assert.ok(scales.some(([x, y]) => x === 0.75 && y === 0.75), `${type}: redução proporcional`);
    assert.deepEqual({ hp: monster.hp, dmg: monster.dmg, speed: monster.speed, r: monster.r }, before, `${type}: combate preservado`);
  }
  game.destroy();
});
