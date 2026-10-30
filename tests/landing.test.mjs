import test from "node:test";
import assert from "node:assert/strict";
import engineModule from "../src/game/engine.ts";
import spritesModule from "../src/game/sprites.ts";
import characterModule from "../src/game/character-art.ts";
import worldModule from "../src/game/world-content.ts";

const { SITES, GLACIER } = worldModule;

const { Engine } = engineModule;
const { CHAR_LOOKS, viewFromAngle } = spritesModule;
const { makeCharacterSprite, CHARACTER_HEIGHT, CHARACTER_WIDTH } = characterModule;

const noop = () => {};
const ctx = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === "measureText") return (text) => ({ width: String(text).length * 7 });
    if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop: noop });
    return noop;
  },
  set(target, key, value) { target[key] = value; return true; },
});
function canvas() {
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0 }),
    addEventListener: noop,
    removeEventListener: noop,
  };
}
const storage = new Map();
globalThis.window = { devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop };
globalThis.document = { createElement: canvas };
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
globalThis.cancelAnimationFrame = noop;
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });

const TILE = 32, SIZE = 190;
const CRASH = { x: 97 * TILE, y: 171 * TILE };
const WAKE = { x: CRASH.x - 72, y: CRASH.y - 104 };
const BASE = { x: 104 * TILE, y: 88 * TILE };

function makeEngine(seed, continueSave = false) {
  return new Engine({
    canvas: canvas(), mode: "single", difficulty: "dificil", playerName: "Teste",
    seed, continueSave, onUi: noop,
  });
}

function canReachBase(game) {
  const start = Math.floor(game.py / TILE) * SIZE + Math.floor(game.px / TILE);
  const goal = Math.floor(BASE.y / TILE) * SIZE + Math.floor(BASE.x / TILE);
  const queue = new Int32Array(SIZE * SIZE);
  const visited = new Uint8Array(SIZE * SIZE);
  let head = 0, tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  while (head < tail && !visited[goal]) {
    const current = queue[head++], x = current % SIZE, y = Math.floor(current / SIZE);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const index = ny * SIZE + nx;
      if (!visited[index] && game.tiles[index] !== 0) {
        visited[index] = 1;
        queue[tail++] = index;
      }
    }
  }
  return Boolean(visited[goal]);
}

function simplifySimulation(game) {
  game.skipCutscene();
  game.updateSpawns = noop;
  game.updateMonsters = noop;
  game.animals = [];
}

test("a praia tem saída e caminho até a base em várias sementes", () => {
  storage.clear();
  for (let seed = 1; seed <= 80; seed++) {
    const game = makeEngine(seed);
    assert.equal(game.px, WAKE.x);
    assert.equal(game.py, WAKE.y);
    assert.notEqual(game.tileAt(game.px, game.py), 0, `água na praia, semente ${seed}`);
    assert.ok(Math.hypot(game.px - CRASH.x, game.py - CRASH.y) > 72, "jogador sobre o avião");
    for (const [dx, dy] of [[45, 0], [-45, 0], [0, 45], [0, -45]]) {
      assert.notEqual(game.tileAt(game.px + dx, game.py + dy), 0, `saída bloqueada, semente ${seed}`);
    }
    assert.ok(canReachBase(game), `base inacessível, semente ${seed}`);
    assert.notEqual(game.tileAt(game.allies[0].x, game.allies[0].y), 0, `Rian preso, semente ${seed}`);
    game.destroy();
  }
});

test("teclado, controle e toque movimentam o personagem após a cutscene", () => {
  storage.clear();
  for (const mode of ["keyboard", "gamepad", "touch"]) {
    const game = makeEngine(7);
    simplifySimulation(game);
    const startY = game.py;
    if (mode === "keyboard") game.keys.add("w");
    if (mode === "touch") game.setTouchMove(0, -1);
    for (let i = 0; i < 30; i++) game.update(1 / 60, { mx: 0, my: mode === "gamepad" ? -1 : 0 });
    assert.ok(game.py < startY - 35, `${mode} não se moveu`);
    game.destroy();
  }
});

test("um save antigo no avião é recuperado sem perder recursos", () => {
  storage.clear();
  storage.set("ilha-save-dificil-single", JSON.stringify({
    v: 2, seed: 8, px: CRASH.x, py: CRASH.y, hp: 88, maxHp: 100,
    inv: { wood: 57, stone: 3, fiber: 0, food: 0, iron: 0, crystal: 0 },
    tools: { axe: 1, pick: 1, sword: 1 }, time: 280, day: 1, score: 33, kills: 0, deaths: 0,
    structures: [], questP: [0, 0, 0, 0, 0, 0, 0], questDone: [false, false, false, false, false, false, false],
    allies: ["rian"], visited: [], nodeHp: [], escortDone: false,
  }));
  // A different seed exercises the actual regeneration path used by Continue.
  const game = makeEngine(12345, true);
  assert.equal(game.state, "playing");
  assert.equal(game.inv.wood, 57);
  assert.equal(game.hp, 88);
  assert.equal(game.score, 33);
  assert.equal(game.px, WAKE.x);
  assert.equal(game.py, WAKE.y);
  assert.ok(game.escort.active);
  game.updateSpawns = noop;
  game.updateMonsters = noop;
  game.keys.add("w");
  for (let i = 0; i < 30; i++) game.update(1 / 60, { mx: 0, my: 0 });
  assert.ok(game.py < WAKE.y - 35);
  game.destroy();
});

test("Rian consegue conduzir um jogador que o segue até a clareira", () => {
  storage.clear();
  for (const seed of [1, 17, 123]) {
    const game = makeEngine(seed);
    simplifySimulation(game);
    for (let frame = 0; frame < 2100 && game.escort.active; frame++) {
      const rian = game.allies.find((ally) => ally.id === "rian");
      const dx = rian.x - game.px, dy = rian.y - game.py;
      const distance = Math.hypot(dx, dy);
      game.update(1 / 30, { mx: distance > 55 ? dx / distance : 0, my: distance > 55 ? dy / distance : 0 });
    }
    assert.equal(game.escort.active, false, `Rian parou na semente ${seed}`);
    assert.ok(Math.hypot(game.px - BASE.x, game.py - BASE.y) < 350, "jogador longe da base");
    game.destroy();
  }
});

test("a cutscene, a praia e o mapa renderizam sem erros", () => {
  storage.clear();
  const game = makeEngine(12);
  assert.doesNotThrow(() => game.renderCutscene());
  game.skipCutscene();
  assert.doesNotThrow(() => game.frame(1 / 60));
  game.toggleMap();
  assert.doesNotThrow(() => game.frame(1 / 60));
  game.destroy();
});

test("cerca custa um pacote e coloca dois trechos no círculo da base", () => {
  storage.clear();
  const game = makeEngine(48);
  simplifySimulation(game);
  game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv.wood = 300; game.inv.stone = 180; game.inv.iron = 100; game.inv.fiber = 100; game.inv.food = 100;
  const price = game.costFor("wall");
  assert.ok(price.wood >= 20 && price.iron >= 2);
  assert.ok(game.build("wall"));
  assert.equal(game.placeReason, "");
  const beforeWood = game.inv.wood, beforeStone = game.inv.stone, beforeIron = game.inv.iron;
  const preview = game.fencePositions("wall");
  assert.equal(preview.length, 2);
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.filter((s) => s.type === "wall").length, 2);
  assert.equal(game.inv.wood, beforeWood - price.wood);
  assert.equal(game.inv.stone, beforeStone - (price.stone ?? 0));
  assert.equal(game.inv.iron, beforeIron - (price.iron ?? 0));
  for (const p of preview) {
    assert.ok(game.structures.some((s) => s.type === "wall" && Math.hypot(s.x - p.x, s.y - p.y) < 1));
    assert.ok(Math.abs(Math.hypot(p.x - BASE.x, p.y - BASE.y) - 350.4) < 1);
  }
  game.rotateFence(3);
  assert.equal(game.placeReason, "");
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.filter((s) => s.type === "wall").length, 4);
  game.cancelPlace();
  assert.ok(game.build("gate"));
  game.rotateFence(5);
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.filter((s) => s.type === "gate").length, 1);
  assert.ok(game.structures.every((s) => game.tileAt(s.x, s.y) !== 0));
  game.destroy();
});

test("31 compras duplas e um portão fecham o círculo sem lacunas", () => {
  storage.clear();
  const game = makeEngine(63);
  simplifySimulation(game);
  game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv.wood = 100000; game.inv.stone = 100000; game.inv.iron = 100000; game.inv.fiber = 100000; game.inv.food = 100000;
  assert.ok(game.build("wall"));
  for (let i = 0; i < 31; i++) assert.ok(game.confirmPlace(), `par ${i + 1} não colocado`);
  assert.equal(game.structures.filter((s) => s.type === "wall").length, 62);
  game.cancelPlace();
  assert.ok(game.build("gate"));
  assert.equal(game.placeReason, "");
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.length, 63);
  const slots = new Set(game.structures.map((s) => {
    const angle = Math.atan2(s.y - BASE.y, s.x - BASE.x);
    return (Math.round(angle * 63 / (2 * Math.PI)) + 63) % 63;
  }));
  assert.equal(slots.size, 63, "o anel tem uma lacuna");
  game.destroy();
});

test("cercas usam a tangente do círculo e estruturas alternam frente/lado", () => {
  storage.clear();
  const game = makeEngine(22);
  simplifySimulation(game); game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv.wood = 1000; game.inv.stone = 1000; game.inv.fiber = 1000; game.inv.iron = 1000; game.inv.food = 1000;
  assert.ok(game.build("wall")); assert.ok(game.confirmPlace());
  for (const wall of game.structures.filter((s) => s.type === "wall")) {
    const expected = Math.atan2(wall.y - BASE.y, wall.x - BASE.x) + Math.PI / 2;
    assert.ok(Math.abs(wall.rotation - expected) < 0.001);
  }
  game.cancelPlace();
  assert.ok(game.build("campfire"));
  assert.equal(game.placeRotation, 0);
  game.rotateStructure(); assert.equal(game.placeRotation, Math.PI / 2);
  game.rotateStructure(); assert.equal(game.placeRotation, 0);
  game.cancelPlace();
  game.destroy();
});

test("quatro materiais de cerca têm custo, resistência e salvamento próprios", () => {
  storage.clear();
  const game = makeEngine(40); simplifySimulation(game); game.escort.active=false; game.px=BASE.x;game.py=BASE.y;
  game.inv={wood:10000,stone:10000,fiber:10000,food:10000,iron:10000,crystal:0};
  // unlock every fence model for this focused test
  game.structures.push(
    {type:"workbench",x:BASE.x,y:BASE.y,hp:200,maxHp:200,prodT:0,open:false,rotation:0,fenceStyle:"palisade"},
    {type:"campfire",x:BASE.x+50,y:BASE.y,hp:180,maxHp:180,prodT:0,open:false,rotation:0,fenceStyle:"palisade"},
  );
  for(const style of ["rustic","palisade","stone","hedge"]){
    game.setFenceStyle(style); assert.equal(game.fenceStyle,style);
    const cost=game.costFor("wall"); assert.ok(Object.values(cost).some((n)=>n>0));
    assert.ok(game.structMaxHp("wall",style)>0);
  }
  assert.ok(game.structMaxHp("wall","stone")>game.structMaxHp("wall","rustic"));
  game.setFenceStyle("hedge"); assert.ok(game.build("wall")); assert.ok(game.confirmPlace()); game.cancelPlace();
  assert.ok(game.structures.filter((x)=>x.type==="wall").every((x)=>x.fenceStyle==="hedge"));
  game.saveGame(true); const loaded=makeEngine(1,true);
  assert.equal(loaded.fenceStyle,"hedge"); assert.ok(loaded.structures.filter((x)=>x.type==="wall").every((x)=>x.fenceStyle==="hedge"));
  loaded.destroy(); game.destroy();
});

test("monstros podem danificar cercas e o jogador pode reconstruí-las", () => {
  storage.clear();
  const game = makeEngine(31);
  simplifySimulation(game);
  game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv.wood = 500; game.inv.stone = 300; game.inv.iron = 100; game.inv.fiber = 100; game.inv.food = 100;
  assert.ok(game.build("wall"));
  assert.ok(game.confirmPlace());
  game.cancelPlace();
  const wall = game.structures.find((s) => s.type === "wall");
  const angle = Math.atan2(wall.y - BASE.y, wall.x - BASE.x);
  game.spawnMonster(wall.x + Math.cos(angle) * 52, wall.y + Math.sin(angle) * 52, "hulk");
  const hp = wall.hp;
  // Use the real monster AI, with no random spawns.
  game.updateMonsters = Engine.prototype.updateMonsters;
  for (let i = 0; i < 180 && wall.hp === hp; i++) game.updateMonsters(1 / 30);
  assert.ok(wall.hp < hp, "monstro não atingiu a cerca");
  const wood = game.inv.wood;
  game.px = wall.x + 38; game.py = wall.y;
  game.tryInteract();
  assert.ok(wall.hp > hp - game.monsters[0].dmg * 2);
  assert.ok(game.inv.wood < wood, "reparo não consumiu madeira");
  game.destroy();
});

test("caminhada, corrida e ataque possuem quadros corporais diferentes", () => {
  const look = CHAR_LOOKS.player;
  for (const view of ["down", "up", "side"]) {
    const idle = makeCharacterSprite(look, "player", view, 0).rows;
    const walk = makeCharacterSprite(look, "player", view, 1).rows;
    const run = makeCharacterSprite(look, "player", view, 3).rows;
    const attack = makeCharacterSprite(look, "player", view, 5).rows;
    assert.notDeepEqual(walk, idle);
    assert.notDeepEqual(run, walk);
    assert.notDeepEqual(attack, idle);
  }
});

test("os personagens têm sprites válidos e distintos nas três direções", () => {
  for (const [id, look] of Object.entries(CHAR_LOOKS)) {
    const sprites = ["down", "up", "side"].map((view) => makeCharacterSprite(look, id, view, 0));
    for (const sprite of sprites) {
      assert.equal(sprite.rows.length, CHARACTER_HEIGHT);
      for (const row of sprite.rows) {
        assert.equal(row.length, CHARACTER_WIDTH);
        for (const pixel of row) assert.ok(pixel === "." || sprite.legend[pixel], `${id}: cor ausente ${pixel}`);
      }
    }
    assert.notDeepEqual(sprites[0].rows, sprites[1].rows);
    assert.notDeepEqual(sprites[0].rows, sprites[2].rows);
  }
  assert.deepEqual(viewFromAngle(Math.PI / 2), { view: "down", flip: false });
  assert.deepEqual(viewFromAngle(-Math.PI / 2), { view: "up", flip: false });
  assert.deepEqual(viewFromAngle(0), { view: "side", flip: false });
  assert.deepEqual(viewFromAngle(Math.PI), { view: "side", flip: true });
});

test("as ruínas possuem recompensa única e descobertas persistentes", () => {
  storage.clear();
  const game = makeEngine(77);
  simplifySimulation(game);
  const site = SITES[0];
  game.px = site.x; game.py = site.y + 70;
  game.updateExploration(0.6);
  assert.ok(game.discoveredSites.has(site.id));
  const before = game.inv.wood;
  game.tryInteract();
  assert.ok(game.claimedSites.has(site.id));
  assert.equal(game.inv.wood, before + site.reward.wood);
  const after = game.inv.wood;
  game.tryInteract();
  assert.equal(game.inv.wood, after, "recompensa foi duplicada");
  game.saveGame(true);
  const loaded = makeEngine(1, true);
  assert.ok(loaded.claimedSites.has(site.id));
  assert.ok(loaded.discoveredSites.has(site.id));
  assert.equal(loaded.inv.wood, after);
  loaded.destroy(); game.destroy();
});

test("região glacial e os dez locais são alcançáveis e renderizáveis", () => {
  storage.clear();
  const game = makeEngine(91);
  simplifySimulation(game);
  assert.ok(game.worldProps.length >= SITES.length + 5);
  assert.ok(game.tiles.some((t) => t === 8), "neve ausente");
  assert.ok(game.tiles.some((t) => t === 9), "gelo ausente");
  assert.ok(game.tiles.some((t) => t === 12), "solo da necrópole ausente");
  assert.ok(game.worldProps.some((prop) => prop.sprite === "necro_king"));
  assert.ok(game.worldProps.filter((prop) => prop.sprite === "necro_grave").length >= 10);
  for (const site of SITES) {
    game.px = site.x; game.py = site.y + 70;
    assert.notEqual(game.tileAt(game.px,game.py),0);
    assert.ok(canReachBase(game), `${site.id} sem trilha para a base`);
    game.centerCamera();
    assert.doesNotThrow(() => game.render());
  }
  game.px = GLACIER.x + 120; game.py = GLACIER.y - 120;
  game.centerCamera();
  assert.doesNotThrow(() => game.render());
  game.destroy();
});

test("equipamentos requerem bancada, consomem materiais e têm efeito", () => {
  storage.clear();
  const game = makeEngine(5);
  simplifySimulation(game);
  game.inv.fiber=100; game.inv.wood=100; game.inv.iron=100; game.inv.crystal=100;
  assert.equal(game.craftEquipment("coat"),false);
  game.structures.push({type:"workbench",x:BASE.x+100,y:BASE.y,hp:100,maxHp:100,prodT:0,open:false});
  assert.equal(game.craftEquipment("coat"),true);
  assert.equal(game.inv.fiber,72);
  assert.equal(game.craftEquipment("coat"),false);
  game.hp=100;game.invulnT=0;game.damagePlayer(50,game.px+5,game.py);
  assert.equal(game.hp,59, "casaco não reduziu dano em 18%");
  assert.equal(game.craftEquipment("charm"),true);
  game.hp=50;game.inv.food=1;game.eatFood();
  assert.equal(game.hp,80,"talismã não aumentou a cura");
  game.destroy();
});

test("novos monstros entram no bestiário e usam sprites válidos", () => {
  storage.clear();
  const game=makeEngine(19);
  simplifySimulation(game);
  for(const type of ["bat","slime","demon","lizard"]){
    game.spawnMonster(game.px+100,game.py-70,type);
    const monster=game.monsters.at(-1);
    assert.ok(spritesModule.SPRITES[monster.skin]);
    monster.hp=0;game.killMonster(monster);
    assert.ok(game.seenCreatures.has(monster.skin));
    assert.ok(game.creatureKills[monster.skin]>=1);
  }
  for(const [key,sprite] of Object.entries(spritesModule.SPRITES)){
    for(const row of sprite.rows)for(const pixel of row){
      assert.ok(pixel==="." || pixel===" " || sprite.legend[pixel],`${key}: cor ausente ${pixel}`);
    }
  }
  game.destroy();
});
