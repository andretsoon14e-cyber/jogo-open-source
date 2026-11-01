import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import engineModule from "../src/game/engine.ts";
import spritesModule from "../src/game/sprites.ts";
import characterModule from "../src/game/character-art.ts";
import worldModule from "../src/game/world-content.ts";

const { SITES, GLACIER } = worldModule;

const { Engine } = engineModule;
const { CHAR_LOOKS, viewFromAngle, drawCharacter } = spritesModule;
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

test("locais das referências têm aproximação por terra em várias sementes", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = makeEngine(seed);
    const queue = new Int32Array(SIZE * SIZE), visited = new Uint8Array(SIZE * SIZE);
    let head = 0, tail = 0;
    const start = Math.floor(BASE.y / TILE) * SIZE + Math.floor(BASE.x / TILE);
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const current = queue[head++], x = current % SIZE, y = Math.floor(current / SIZE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const index = ny * SIZE + nx;
        if (!visited[index] && game.tiles[index] !== 0) { visited[index] = 1; queue[tail++] = index; }
      }
    }
    for (const chest of game.chests.filter((item) => item.rare)) {
      const x = Math.floor(chest.x / TILE), y = Math.floor(chest.y / TILE);
      assert.ok(visited[y * SIZE + x], `${chest.label}: inacessível na semente ${seed}`);
    }
    assert.ok(visited[40 * SIZE + 76], `campo mineral inacessível na semente ${seed}`);
    for (const rescue of game.rescues) {
      const x = Math.floor(rescue.x / TILE), y = Math.floor(rescue.y / TILE);
      assert.ok(visited[y * SIZE + x], `${rescue.id}: resgate inacessível por terra na semente ${seed}`);
    }
    for (const prop of game.worldProps.filter((item) => item.sprite.startsWith("reference_"))) {
      let reachable = false;
      for (let dy = -64; dy <= 64; dy += 16) for (let dx = -64; dx <= 64; dx += 16) {
        if (Math.hypot(dx, dy) >= 86) continue;
        const x = Math.floor((prop.x + dx) / TILE), y = Math.floor((prop.y + dy) / TILE);
        if (visited[y * SIZE + x]) reachable = true;
      }
      assert.ok(reachable, `${prop.sprite}: sem aproximação por terra na semente ${seed}`);
    }
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

test("o personagem acompanha a direção ao alternar direita e esquerda", () => {
  storage.clear();
  for (const input of ["keyboard", "gamepad", "touch"]) {
    for (const vertical of [-1, 0, 1]) {
      const game = makeEngine(7);
      try {
        simplifySimulation(game);
        for (const horizontal of [1, -1]) {
          // Previous mouse aim must not override movement direction.
          game.aimTarget = horizontal > 0 ? Math.PI : 0;
          if (input === "keyboard") {
            game.keys.delete("a"); game.keys.delete("d");
            game.keys.add(horizontal > 0 ? "d" : "a");
            if (vertical < 0) game.keys.add("w");
            if (vertical > 0) game.keys.add("s");
          }
          if (input === "touch") game.setTouchMove(horizontal, vertical);
          game.update(1 / 60, { mx: input === "gamepad" ? horizontal : 0, my: input === "gamepad" ? vertical : 0 });
          assert.ok(Math.cos(game.pdir) * horizontal > 0, `${input}: direção errada com x=${horizontal}, y=${vertical}`);
          assert.deepEqual(viewFromAngle(game.pdir), { view: "side", flip: horizontal < 0 }, `${input}: sprite errado com x=${horizontal}, y=${vertical}`);
          assert.equal(game.aimTarget, null);
        }
      } finally {
        game.destroy();
      }
    }
  }
});

test("o sprite lateral é espelhado de verdade, inclusive nas diagonais esquerdas", () => {
  const originalCreateElement = document.createElement;
  const drawn = [];
  document.createElement = () => {
    const image = { width: 0, height: 0, operations: [] };
    const painter = {
      fillStyle: "",
      fillRect(x, y, w, h) { image.operations.push({ x, y, w, h, color: this.fillStyle }); },
    };
    image.getContext = () => painter;
    return image;
  };
  const painter = { save: noop, restore: noop, translate: noop, rotate: noop, drawImage: (image) => drawn.push(image), globalAlpha: 1 };
  try {
    // A unique look ID avoids reusing any cached canvas from other tests.
    for (const angle of [0, Math.PI, Math.atan2(-1, -1), Math.atan2(1, -1)]) {
      drawCharacter(painter, "direction-regression", 0, 0, angle, false, 0);
    }
    const [right, left, upLeft, downLeft] = drawn;
    assert.equal(left.width, right.width);
    assert.ok(right.operations.length > 0);
    assert.equal(left.operations.length, right.operations.length);
    for (let i = 0; i < right.operations.length; i++) {
      const r = right.operations[i];
      const l = left.operations[i];
      assert.deepEqual(l, { ...r, x: right.width - r.x - r.w });
    }
    assert.ok(upLeft === left, "diagonal superior esquerda não usa o sprite espelhado");
    assert.ok(downLeft === left, "diagonal inferior esquerda não usa o sprite espelhado");
  } finally {
    document.createElement = originalCreateElement;
  }
});

test("vento usa quadros em cache, mantém a base fixa e pode ser desligado", () => {
  const game = makeEngine(13);
  try {
    const tree = game.nodes.find((n) => (n.type === "tree" || n.type === "pine") && n.hp > 0);
    assert.ok(tree);
    const originalDrawImage = ctx.drawImage;
    const originalDrawShadow = game.drawShadow;
    const originalCreateElement = document.createElement;
    const draws = [];
    game.drawShadow = noop;
    // Offscreen baking uses a different context from the world canvas.
    const offscreen = new Proxy({}, { get: () => noop, set: () => true });
    document.createElement = () => ({ width: 0, height: 0, getContext: () => offscreen });
    ctx.drawImage = (...args) => draws.push(args);
    try {
      const zero = -(tree.x * 0.01 + tree.y * 0.005) / 0.9;
      const peak = zero + Math.PI / (2 * 0.9);
      game.drawNode(tree, 0, 0, zero);
      game.drawNode(tree, 0, 0, peak);
      game.drawNode(tree, 0, 0, peak + 2 * Math.PI / 0.9);
      const [still, moved, repeated] = draws;
      assert.notEqual(still[0], moved[0], "a copa não balançou");
      assert.equal(moved[0], repeated[0], "o quadro de vento deve ser reutilizado");
      assert.equal(still[2], moved[2], "a altura da base não deve mudar");
      assert.equal(still[1] - moved[1], (moved[0].width - still[0].width) / 2, "o tronco deve permanecer ancorado");
      draws.length = 0;
      game.applySettings({ ...game.settings, treeMotion: false });
      game.drawNode(tree, 0, 0, zero);
      game.drawNode(tree, 0, 0, peak);
      assert.equal(draws[0][0], draws[1][0], "sem vento o sprite deve ficar parado");
    } finally {
      ctx.drawImage = originalDrawImage;
      game.drawShadow = originalDrawShadow;
      document.createElement = originalCreateElement;
    }
    game.harvest(tree);
    assert.ok(game.shakingNodes.has(tree));
    game.skipCutscene();
    game.updateSpawns = noop;
    game.updateMonsters = noop;
    game.update(0.5, { mx: 0, my: 0 });
    assert.equal(game.shakingNodes.has(tree), false, "balanço do golpe deve terminar");
  } finally {
    game.destroy();
  }
});

test("identificação da base não cobre o painel do dia", () => {
  const game = makeEngine(20);
  const originalFillText = ctx.fillText;
  const labels = [];
  ctx.fillText = (text, x, y) => { if (text === "SUA BASE") labels.push({ x, y }); };
  try {
    game.skipCutscene();
    game.time = 280;
    game.camX = BASE.x - game.viewW / 2;
    game.camY = BASE.y - 90;
    game.drawBasePointer();
    assert.equal(labels.length, 2);
    assert.ok(labels.every((label) => label.y >= 60), "rótulo sobrepõe o painel superior");
  } finally {
    ctx.fillText = originalFillText;
    game.destroy();
  }
});

test("criaturas próximas emitem sons apenas quando a opção está ligada", () => {
  const game = makeEngine(21);
  try {
    game.skipCutscene();
    game.spawnMonster(game.px + 80, game.py, "hulk");
    const monster = game.monsters.at(-1);
    let calls = [];
    game.sfx.creature = (type, proximity) => calls.push([type, proximity]);
    game.updateMonsters(1 / 60);
    assert.equal(calls[0][0], "hulk");
    assert.ok(calls[0][1] > 0 && calls[0][1] < 1);
    game.applySettings({ ...game.settings, creatureSounds: false, sfxVol: 0 });
    assert.equal(game.sfx.vol, 0);
    calls = [];
    monster.state = "idle";
    game.updateMonsters(1 / 60);
    assert.equal(calls.length, 0);
  } finally {
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
    assert.ok(Math.abs(Math.hypot(p.x - BASE.x, p.y - BASE.y) - game.fenceSpec().fenceRadius) < 1);
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

test("compras duplas e um portão fecham o círculo compacto sem lacunas", () => {
  storage.clear();
  const game = makeEngine(63);
  simplifySimulation(game);
  game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv.wood = 100000; game.inv.stone = 100000; game.inv.iron = 100000; game.inv.fiber = 100000; game.inv.food = 100000;
  assert.ok(game.build("wall"));
  const count = game.fenceSpec().slots;
  for (let i = 0; i < (count - 1) / 2; i++) assert.ok(game.confirmPlace(), `par ${i + 1} não colocado`);
  assert.equal(game.structures.filter((s) => s.type === "wall").length, count - 1);
  game.cancelPlace();
  assert.ok(game.build("gate"));
  assert.equal(game.placeReason, "");
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.length, count);
  const slots = new Set(game.structures.map((s) => {
    const angle = Math.atan2(s.y - BASE.y, s.x - BASE.x);
    return (Math.round(angle * count / (2 * Math.PI)) + count) % count;
  }));
  assert.equal(slots.size, count, "o anel tem uma lacuna");
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
  assert.equal(game.crystalDiscovered, false);
  game.inspectSite("arch");
  assert.equal(game.crystalDiscovered, true, "cristal encontrado em altar também libera a mineração");
  game.saveGame(true);
  const loaded = makeEngine(1, true);
  assert.equal(loaded.crystalDiscovered, true);
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

test("fogueiras geram partículas pelo tempo da simulação, respeitam o limite e não emitem ao desenhar", () => {
  const game = makeEngine(32);
  const random = Math.random;
  try {
    game.skipCutscene();
    const fire = { type: "campfire", x: game.px + 50, y: game.py, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
    game.structures = [fire]; game.centerCamera();
    Math.random = () => 0.1;
    for (let i = 0; i < 100; i++) game.drawStructure(fire, -game.camX, -game.camY, i / 120);
    assert.equal(game.particles.length, 0, "renderizar não deve criar partículas");
    game.updateStructures(1 / 240);
    assert.equal(game.particles.length, 0, "a probabilidade por quadro deve diminuir em FPS alto");
    game.updateStructures(1 / 60);
    assert.equal(game.particles.length, 1);
    game.particleCap = 1;
    game.updateStructures(1 / 30);
    assert.equal(game.particles.length, 1, "o limite de partículas deve ser respeitado");
    game.particles.length = 0;
    game.state = "paused"; game.frame(1 / 60);
    assert.equal(game.particles.length, 0, "fogueiras não devem emitir durante a pausa");
    fire.x = game.camX + game.viewW + 500;
    game.updateStructures(1 / 30);
    assert.equal(game.particles.length, 0, "fogueiras fora da tela não devem emitir");
  } finally { Math.random = random; game.destroy(); }
});

test("partículas da introdução têm a mesma taxa em 30, 60, 120 e 240 FPS", () => {
  const emitted = [];
  for (const fps of [30, 60, 120, 240]) {
    const game = makeEngine(33);
    try {
      game.cutPhase = 1; game.cutT = 5;
      let births = 0;
      const particles = game.particles;
      const push = particles.push.bind(particles);
      particles.push = (...values) => { births += values.length; return push(...values); };
      for (let i = 0; i < fps / 2; i++) game.renderCutscene(1 / fps);
      emitted.push(births);
      assert.ok(game.particles.length <= game.particleCap);
      game.skipCutscene();
      assert.equal(game.particles.length, 0, "partículas da introdução não devem aparecer no mundo");
    } finally { game.destroy(); }
  }
  assert.deepEqual(emitted, [90, 90, 90, 90]);
});

test("espada e arco são opções funcionais, seguras e persistentes mesmo sem artes opcionais", () => {
  storage.clear();
  const game = makeEngine(77);
  try {
    game.skipCutscene(); game.escort.active = false; game.updateSpawns = noop;
    game.tileAt = () => 2; game.structures = []; game.monsters = []; game.projectiles = []; game.animals = [];
    game.px = 1100; game.py = 1100; game.pdir = 0; game.hp = 100;
    game.applySettings({ ...game.settings, craftPix: false });
    game.setCombatWeapon("bow");
    assert.equal(game.heldTool, "sword");
    game.spawnMonster(1270, 1100, "imp");
    const monster = game.monsters[0]; monster.hp = 6; monster.speed = 0; monster.t = 100;
    game.allies = [{ id: "rian", name: "Rian", color: "#fff", x: 1170, y: 1100, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 }];
    game.tryAttack();
    assert.equal(game.projectiles[0]?.kind, "player");
    for (let i = 0; i < 7; i++) game.updateMonsters(0.1);
    assert.equal(game.kills, 1, "a flecha deve acertar o monstro à distância");
    assert.equal(game.hp, 100, "flechas amigas não atingem o jogador");
    assert.equal(game.allies[0].downT, 0, "flechas amigas não atingem Rian");

    game.monsters = []; game.projectiles = []; game.attackCd = 0;
    game.animals = [{ kind: "rabbit", x: 1230, y: 1100, vx: 0, vy: 0, t: 99, hp: 8, dir: 0, flee: 0 }];
    game.tryAttack();
    for (let i = 0; i < 7; i++) game.updateMonsters(0.1);
    assert.equal(game.animals.length, 0, "a flecha do jogador também permite caçar");
    assert.ok(game.drops.some((d) => d.res === "food"));

    game.saveGame(true);
    const key = game.saveKey(), saved = JSON.parse(localStorage.getItem(key));
    assert.equal(saved.combatWeapon, "bow");
    const reloaded = makeEngine(77, true);
    assert.equal(reloaded.combatWeapon, "bow");
    reloaded.destroy();
    delete saved.combatWeapon;
    localStorage.setItem(key, JSON.stringify(saved));
    const old = makeEngine(77, true);
    assert.equal(old.combatWeapon, "sword", "save antigo mantém o ataque original");
    old.destroy();

    game.setCombatWeapon("sword"); game.attackCd = 0; game.monsters = []; game.projectiles = []; game.animals = [];
    game.spawnMonster(1130, 1100, "imp");
    const melee = game.monsters[0], hp = melee.hp;
    game.tryAttack();
    assert.ok(melee.hp < hp, "trocar para espada restaura o golpe corpo a corpo");
    assert.equal(game.projectiles.length, 0);
  } finally { game.destroy(); storage.clear(); }
});

test("vento só é agendado durante a exploração e respeita a configuração", () => {
  const game = makeEngine(7);
  try {
    simplifySimulation(game); game.escort.active = false;
    let gusts = 0; game.sfx.wind = () => { gusts++; };
    game.update(0.1, { mx: 0, my: 0 });
    assert.equal(gusts, 1);
    game.update(0.1, { mx: 0, my: 0 });
    assert.equal(gusts, 1, "não verificar áudio a cada quadro");
    game.applySettings({ ...game.settings, windSounds: false });
    game.update(2, { mx: 0, my: 0 });
    assert.equal(gusts, 1, "opção desligada não cria rajadas");
    game.applySettings({ ...game.settings, windSounds: true });
    game.state = "paused"; game.frame(2);
    assert.equal(gusts, 1, "o mundo pausado não agenda rajadas");
  } finally { game.destroy(); }
});

test("o território cresce com recursos e estruturas sem perder cercas, portões ou saves antigos", () => {
  storage.clear();
  const game = makeEngine(77); simplifySimulation(game); game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y;
  game.inv = { wood: 100000, stone: 100000, fiber: 100000, food: 100000, iron: 100000, crystal: 100000 };
  assert.equal(game.territoryLevel, 1);
  assert.equal(game.territoryRadius(), 320);
  assert.match(game.territoryUpgrade().reason, /nível 4/);
  assert.equal(game.upgradeTerritory(), false);
  const structure = (type, x, y) => ({ type, x, y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  game.structures.push(structure("workbench", BASE.x - 50, BASE.y), structure("campfire", BASE.x + 40, BASE.y));
  assert.ok(game.build("wall")); assert.ok(game.confirmPlace()); game.cancelPlace();
  assert.ok(game.build("gate")); assert.ok(game.confirmPlace());
  const firstRing = game.structures.filter((s) => s.type === "wall" || s.type === "gate").map((s) => ({ x: s.x, y: s.y, type: s.type, hp: s.hp }));
  const cost = game.territoryUpgrade().cost, wood = game.inv.wood, stone = game.inv.stone;
  assert.ok(game.upgradeTerritory());
  assert.equal(game.territoryLevel, 2); assert.equal(game.territoryRadius(), 640); assert.equal(game.fenceRing, 2);
  assert.equal(game.inv.wood, wood - cost.wood); assert.equal(game.inv.stone, stone - cost.stone);
  assert.deepEqual(game.structures.filter((s) => s.type === "wall" || s.type === "gate").map((s) => ({ x: s.x, y: s.y, type: s.type, hp: s.hp })), firstRing);
  assert.ok(game.build("wall"));
  const newPositions = game.fencePositions("wall");
  for (const p of newPositions) game.tiles[Math.floor(p.y / TILE) * SIZE + Math.floor(p.x / TILE)] = 0;
  assert.ok(game.confirmPlace(), "muralha externa pode fazer fundação sobre água"); game.cancelPlace();
  for (const p of newPositions) {
    assert.ok(Math.abs(Math.hypot(p.x - BASE.x, p.y - BASE.y) - 510.4) < 1);
    assert.equal(game.tileAt(p.x, p.y), 7, "fundação não ficou transitável");
  }
  assert.ok(game.build("gate")); assert.ok(game.confirmPlace(), "cada perímetro pode ter seu próprio portão");
  assert.equal(game.structures.filter((s) => s.type === "gate").length, 2);
  game.setFenceRing(1); assert.equal(game.fenceRing, 1);
  game.setFenceRing(3); assert.equal(game.fenceRing, 1, "anel bloqueado não pode ser selecionado");
  game.setFenceRing(2);
  game.saveGame(true);
  const loaded = makeEngine(1, true);
  assert.equal(loaded.territoryLevel, 2); assert.equal(loaded.fenceRing, 2);
  assert.equal(loaded.structures.filter((s) => s.type === "gate").length, 2);
  assert.ok(firstRing.every((first) => loaded.structures.some((s) => s.type === first.type && s.x === first.x && s.y === first.y && s.hp === first.hp)));
  assert.ok(newPositions.every((p) => loaded.tileAt(p.x, p.y) !== 0), "fundação perdida ao carregar");
  assert.match(loaded.territoryUpgrade().reason, /Forja/);
  loaded.structures.push(structure("forge", BASE.x + 130, BASE.y));
  assert.ok(loaded.upgradeTerritory()); assert.equal(loaded.territoryRadius(), 800);
  assert.match(loaded.territoryUpgrade().reason, /Torre/);
  loaded.structures.push(structure("tower", BASE.x + 190, BASE.y));
  assert.ok(loaded.upgradeTerritory()); assert.equal(loaded.territoryRadius(), 960);
  assert.equal(loaded.upgradeTerritory(), false, "não existe expansão infinita");
  const saved = JSON.parse(storage.get(game.saveKey())); delete saved.territoryLevel; delete saved.fenceRing; delete saved.territoryLayout;
  storage.set(game.saveKey(), JSON.stringify(saved));
  const legacy = makeEngine(77, true);
  assert.equal(legacy.territoryLevel, 1); assert.equal(legacy.fenceRing, 1);
  assert.equal(legacy.territoryRadius(), 480); assert.equal(legacy.fenceSpec().slots, 63);
  assert.ok(firstRing.every((first) => legacy.structures.some((s) => s.type === first.type && s.x === first.x && s.y === first.y)));
  legacy.destroy(); loaded.destroy(); game.destroy();
});

test("uma expansão não consome recursos sem requisitos ou saldo suficiente", () => {
  storage.clear();
  const game = makeEngine(71); simplifySimulation(game); game.escort.active = false; game.px = BASE.x; game.py = BASE.y;
  game.structures = [
    { type: "workbench", x: BASE.x - 90, y: BASE.y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" },
    { type: "campfire", x: BASE.x + 90, y: BASE.y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" },
    { type: "farm", x: BASE.x, y: BASE.y + 90, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" },
  ];
  game.inv = { wood: 99, stone: 80, fiber: 0, food: 0, iron: 0, crystal: 0 };
  const before = { ...game.inv };
  assert.equal(game.territoryUpgrade().reason, "");
  assert.equal(game.upgradeTerritory(), false);
  assert.deepEqual(game.inv, before); assert.equal(game.territoryLevel, 1);
  game.inv.wood = 100;
  game.px = BASE.x + 600;
  assert.match(game.territoryUpgrade().reason, /Volte à base/);
  assert.equal(game.upgradeTerritory(), false);
  game.destroy();
});

test("portão do quarto anel atravessa o rio e reconstrói a ponte no save", () => {
  storage.clear();
  const game = makeEngine(2); simplifySimulation(game); game.escort.active = false;
  game.territoryLevel = 4; game.fenceRing = 4; game.px = BASE.x; game.py = BASE.y;
  game.inv = { wood: 10000, stone: 10000, fiber: 10000, food: 10000, iron: 10000, crystal: 10000 };
  assert.ok(game.build("gate")); game.fenceSlot = 137; game.mouseValid = false; game.updatePlacement();
  const gate = game.fencePosition(game.fenceSlot), angle = Math.atan2(gate.y - BASE.y, gate.x - BASE.x);
  assert.equal(game.tileAt(gate.x, gate.y), 0, "fixture deve atravessar um rio verdadeiro");
  const wet = [gate];
  for (const sign of [-1, 1]) for (let i = 1; i <= 12; i++) {
    const p = { x: gate.x + Math.cos(angle) * sign * i * TILE / 2, y: gate.y + Math.sin(angle) * sign * i * TILE / 2 };
    if (game.tileAt(p.x, p.y) === 0) wet.push(p);
    else if (game.tileAt(p.x, p.y) !== 7 && i >= 2) break;
  }
  assert.ok(game.confirmPlace());
  assert.ok(wet.every((p) => game.tileAt(p.x, p.y) === 7));
  game.saveGame(true);
  const loaded = makeEngine(2, true);
  assert.ok(wet.every((p) => loaded.tileAt(p.x, p.y) === 7), "ponte precisa reaparecer ao carregar");
  assert.equal(loaded.structures.filter((s) => s.type === "gate").length, 1);
  loaded.destroy(); game.destroy();
});

test("lacunas isoladas no perímetro podem ser fechadas com cerca simples e preço proporcional", () => {
  storage.clear();
  const game = makeEngine(70); simplifySimulation(game); game.escort.active = false; game.px = BASE.x; game.py = BASE.y;
  game.inv = { wood: 100000, stone: 100000, fiber: 100000, food: 100000, iron: 100000, crystal: 100000 };
  game.structures = [];
  const count = game.fenceSpec().slots;
  for (let i = 0; i < count; i++) {
    if (i === 0 || i === 3) continue;
    const p = game.fencePosition(i, 1);
    game.structures.push({ type: i === 1 ? "gate" : "wall", ...p, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  }
  assert.equal(game.wallPurchaseSize(), 1);
  const before = { ...game.inv }, cost = game.costFor("wall");
  assert.ok(game.build("wall")); assert.equal(game.fencePositions("wall").length, 1);
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.length, count - 1); assert.equal(game.inv.wood, before.wood - cost.wood);
  assert.equal(game.wallPurchaseSize(), 1);
  assert.ok(game.confirmPlace()); assert.equal(game.structures.length, count);
  assert.equal(new Set(game.structures.map((s) => `${s.x}:${s.y}`)).size, count);
  game.destroy();
});

test("patrulhas surgem fora do perímetro mais distante de um reino ampliado", () => {
  storage.clear();
  const game = makeEngine(5); simplifySimulation(game); game.escort.active = false; game.territoryLevel = 4;
  game.px = BASE.x; game.py = BASE.y; game.tileAt = () => 2; game.monsters = [];
  for (let i = 0; i < 4; i++) game.spawnWave(5);
  assert.ok(game.monsters.length > 0);
  assert.ok(game.monsters.every((m) => Math.hypot(m.x - BASE.x, m.y - BASE.y) > game.fenceSpec(4).fenceRadius));
  game.destroy();
});

test("o último espaço fica reservado para o portão caso o anel ainda não tenha um", () => {
  storage.clear();
  const game = makeEngine(70); simplifySimulation(game); game.escort.active = false; game.px = BASE.x; game.py = BASE.y;
  game.inv = { wood: 100000, stone: 100000, fiber: 100000, food: 100000, iron: 100000, crystal: 100000 };
  game.structures = [];
  const count = game.fenceSpec().slots;
  for (let i = 1; i < count; i++) game.structures.push({ type: "wall", ...game.fencePosition(i, 1), hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  assert.match(game.structLock("wall"), /portão/); assert.equal(game.build("wall"), false);
  assert.ok(game.build("gate")); assert.ok(game.confirmPlace());
  assert.equal(game.structures.filter((s) => s.type === "gate").length, 1);
  assert.equal(game.structures.length, count); game.destroy();
});

test("limite de casas cresce junto com o território", () => {
  storage.clear();
  const game = makeEngine(61); simplifySimulation(game);
  const house = (i) => ({ type: "house", x: BASE.x + i * 40, y: BASE.y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  game.structures = [{ ...house(0), type: "workbench" }, ...Array.from({ length: 5 }, (_, i) => house(i))];
  assert.match(game.structLock("house"), /Máximo de 5 casas/);
  game.territoryLevel = 2; assert.equal(game.structLock("house"), "");
  game.structures.push(...Array.from({ length: 5 }, (_, i) => house(i + 5)));
  assert.match(game.structLock("house"), /Máximo de 10 casas/);
  game.destroy();
});

test("trechos de anéis diferentes se conectam separadamente e portões abertos interrompem a ligação", () => {
  storage.clear();
  const game = makeEngine(80); simplifySimulation(game); game.territoryLevel = 2; game.dpr = 0.8;
  const piece = (ring, slot, type = "wall", open = false) => ({ type, ...game.fencePosition(slot, ring), hp: 100, maxHp: 100, prodT: 0, open, rotation: 0, fenceStyle: "palisade" });
  game.structures = [piece(1, 0), piece(1, 1), piece(2, 0), piece(2, 1, "gate")];
  const links = []; game.drawFenceLink = (_ctx, _style, x1, y1, x2, y2) => links.push([x1, y1, x2, y2]);
  game.drawFenceConnections(-BASE.x + 640, -BASE.y + 360);
  assert.equal(links.length, 2); assert.notDeepEqual(links[0], links[1]);
  game.structures[3].open = true; links.length = 0;
  game.drawFenceConnections(-BASE.x + 640, -BASE.y + 360);
  assert.equal(links.length, 1);
  game.destroy();
});

test("baú da base é sólido antes e depois de aberto, mas permite saída de save antigo", () => {
  const game = makeEngine(61);
  try {
    game.state = "playing"; game.escort.active = false;
    game.updateSpawns = noop; game.updateMonsters = noop;
    const chest = game.chests.find((ch) => ch.label === "Kit do Rian");
    assert.ok(chest);
    game.px = chest.x - 48; game.py = chest.y - 12;
    for (let i = 0; i < 30; i++) game.update(1 / 60, { mx: 1, my: 0 });
    assert.equal(game.baseChestContains(game.px, game.py), false);
    assert.ok(game.px < chest.x - 33, "não atravessa o baú fechado");
    game.tryInteract();
    assert.equal(chest.opened, true, "o baú continua alcançável para interagir");
    for (let i = 0; i < 30; i++) game.update(1 / 60, { mx: 1, my: 0 });
    assert.equal(game.baseChestContains(game.px, game.py), false, "continua sólido após abrir");
    game.px = chest.x; game.py = chest.y - 10; game.pvx = game.pvy = 0;
    for (let i = 0; i < 45; i++) game.update(1 / 60, { mx: 1, my: 0 });
    assert.ok(game.px > chest.x + 34, "save antigo dentro do baú pode sair");
    for (let i = 0; i < 45; i++) game.update(1 / 60, { mx: -1, my: 0 });
    assert.ok(game.px > chest.x + 33, "após sair, não entra novamente");
  } finally { game.destroy(); }
});

test("pode cruzar a fogueira, mas as chamas dão dano e fazem a tela tremer", () => {
  const game = makeEngine(62);
  try {
    game.state = "playing"; game.escort.active = false;
    game.updateSpawns = noop; game.updateMonsters = noop;
    const fire = { type: "campfire", x: BASE.x - 10, y: BASE.y + 100, hp: 180, maxHp: 180, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
    game.structures.push(fire);
    game.px = fire.x - 40; game.py = fire.y; game.hp = 100;
    let burned = false, shook = false;
    for (let i = 0; i < 50; i++) {
      game.update(1 / 60, { mx: 1, my: 0 });
      burned ||= game.hp < 100;
      shook ||= game.shake > 0;
    }
    assert.ok(game.px > fire.x + 20, "o fogo não deve bloquear o caminho");
    assert.ok(burned, "pisar nas chamas causa dano");
    assert.ok(shook, "o impacto faz a tela tremer");
    game.hp = 50; game.px = fire.x + 55; game.py = fire.y;
    game.updateStructures(1);
    assert.ok(game.hp > 50, "calor ainda recupera vida ao lado da fogueira");
  } finally { game.destroy(); }
});

test("ambiente toca sons por proximidade, aceita gesto na interface e respeita os controles", () => {
  const game = makeEngine(63);
  try {
    let unlocked = 0;
    game.sfx.ensure = () => { unlocked++; };
    game.onAudioGesture();
    assert.equal(unlocked, 1, "qualquer gesto de ponteiro pode desbloquear o áudio");
    const heard = [];
    game.sfx.wind = () => heard.push(["wind"]);
    game.sfx.water = (v) => heard.push(["water", v]);
    game.sfx.fire = (v) => heard.push(["fire", v]);
    game.sfx.animal = (k, v) => heard.push(["animal", k, v]);
    game.px = BASE.x; game.py = BASE.y;
    game.animals = [{ kind: "goose", x: game.px + 40, y: game.py, vx: 0, vy: 0, t: 1, hp: 14, dir: 1, flee: 0 }];
    game.structures = [{ type: "campfire", x: game.px + 40, y: game.py, hp: 180, maxHp: 180, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" }];
    const tx = Math.floor(game.px / TILE), ty = Math.floor(game.py / TILE);
    game.tiles[ty * SIZE + tx + 1] = 0;
    game.updateAmbience();
    assert.ok(heard.some(([kind, value]) => kind === "water" && value > 0));
    assert.ok(heard.some(([kind, value]) => kind === "fire" && value > 0));
    assert.ok(heard.some(([kind, animal, value]) => kind === "animal" && animal === "goose" && value > 0));
    assert.ok(heard.some(([kind]) => kind === "wind"));
    heard.length = 0;
    game.settings.ambientSounds = game.settings.creatureSounds = game.settings.windSounds = false;
    game.updateAmbience();
    assert.deepEqual(heard, []);
  } finally { game.destroy(); }
});

test("riachos e campo mineral preservam índices de recursos antigos e rotas por terra", () => {
  // Digests of type/maxHp before adding biomes (commit 7997906). nodeHp saves
  // refer to indices; moving a node away from a new creek is OK, reordering is not.
  const legacy = [
    [1, 2144, "60dfbabaea3c1ea6c0f8fbc111da34058d77f0c83ca4805385adc602efe73e7c"],
    [17, 2101, "ad04a21d294345d0aeece08a535918bc95f38db36010a4ed54f9c0c5109efe22"],
    [77, 2038, "149ba56b7a19061e10d0eb58a89f40cb261664c94c24efc04c3e85a711e649f8"],
  ];
  for (const [seed, oldCount, digest] of legacy) {
    const game = makeEngine(seed);
    try {
      const signature = game.nodes.slice(0, oldCount).map((node) => `${node.type}:${node.maxHp}`).join("|");
      assert.equal(createHash("sha256").update(signature).digest("hex"), digest, `índices mudaram na semente ${seed}`);
      assert.ok(game.nodes.length > oldCount + 15, "novos depósitos foram anexados");
      assert.equal(game.tileAt(76 * TILE, 40 * TILE), 13, "centro dos campos de cristal");
      assert.ok(canReachBase(game), "os riachos não devem isolar o caminho da base");
      assert.ok(game.nodes.every((node) => game.tileAt(node.x, node.y) !== 0), "nós não ficam sob a água");
      const basins = [[17, 39, 78, 95], [158, 178, 103, 132], [66, 85, 146, 163]];
      for (const [x0, x1, y0, y1] of basins) {
        let water = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (game.tiles[y * SIZE + x] === 0) water++;
        assert.ok(water >= 20, `riacho ausente na região ${x0},${y0}`);
      }
    } finally { game.destroy(); }
  }
});

test("tesouros raros e construções de saves antigos sobrevivem aos novos biomas", () => {
  storage.clear();
  const game = makeEngine(77);
  try {
    game.skipCutscene();
    game.nodes[100].hp = 0; game.nodes[100].respawn = 30; game.depletedNodes.add(game.nodes[100]);
    game.chests[0].opened = true;
    assert.equal(game.chests.filter((chest) => chest.rare).length, 4);
    assert.ok(game.chests.filter((chest) => chest.rare).every((chest) => game.tileAt(chest.x, chest.y) !== 0));
    game.saveGame(true);
    const data = JSON.parse(storage.get(game.saveKey()));
    // Old saves only knew the first five chests and could have built where a
    // stream now flows; the structure must remain on a small dry foundation.
    data.chests = data.chests.slice(0, 5);
    const at = game.tiles.findIndex((tile, index) => {
      const x = index % SIZE, y = Math.floor(index / SIZE);
      return tile === 0 && x >= 20 && x <= 37 && y >= 80 && y <= 95;
    });
    assert.ok(at >= 0);
    const fire = { type: "campfire", x: (at % SIZE + 0.5) * TILE, y: (Math.floor(at / SIZE) + 0.5) * TILE, hp: 90, open: false, rotation: 0 };
    data.structures.push(fire);
    storage.set(game.saveKey(), JSON.stringify(data));
    const loaded = makeEngine(123, true); // saved seed differs from requested seed
    try {
      assert.equal(loaded.opts.seed, 77);
      assert.equal(loaded.nodes[100].type, game.nodes[100].type);
      assert.equal(loaded.nodes[100].hp, 0);
      assert.equal(loaded.chests[0].opened, true);
      assert.ok(loaded.chests.slice(5).every((chest) => chest.rare && !chest.opened));
      assert.ok(loaded.structures.some((s) => s.type === "campfire" && s.x === fire.x && s.y === fire.y));
      assert.equal(loaded.tileAt(fire.x, fire.y), 7, "fundação do save fica sobre ponte");
      loaded.chests[5].opened = true; loaded.saveGame(true);
      const again = makeEngine(77, true);
      try { assert.equal(again.chests[5].opened, true, "tesouro novo não pode ser saqueado duas vezes"); }
      finally { again.destroy(); }
    } finally { loaded.destroy(); }
  } finally { game.destroy(); storage.clear(); }
});

test("fauna varia por região e criaturas raras dão recompensas especiais", () => {
  const game = makeEngine(77), originalRandom = Math.random;
  try {
    for (const [tile, expected] of [[2, "goose"], [3, "goat"], [8, "goat"], [13, "rabbit"]]) {
      const at = game.tiles.findIndex((value, index) => {
        const x = (index % SIZE + 0.5) * TILE, y = (Math.floor(index / SIZE) + 0.5) * TILE;
        return value === tile && Math.hypot(x - BASE.x, y - BASE.y) > 500;
      });
      assert.ok(at >= 0, `terreno ${tile} não encontrado`);
      const x = (at % SIZE + 0.5) * TILE, y = (Math.floor(at / SIZE) + 0.5) * TILE;
      const samples = [x / (SIZE * TILE), y / (SIZE * TILE), 0.75, 0.01, 0.5];
      Math.random = () => samples.shift() ?? 0.5;
      game.animals = []; game.spawnAnimals(1);
      assert.equal(game.animals[0]?.kind, expected, `fauna do terreno ${tile}`);
      assert.equal(game.animals[0]?.rare, true);
      game.drops = []; game.hitAnimal(game.animals[0], 1000);
      assert.ok(game.drops.some((drop) => drop.res === "crystal"), "animal raro deixa cristal");
    }
    Math.random = originalRandom;
    game.monsters = []; game.drops = [];
    const x = 76 * TILE, y = 40 * TILE;
    game.spawnMonster(x, y, "brute", true);
    const creature = game.monsters[0];
    assert.equal(creature.skin, "golem");
    assert.equal(creature.rare, true);
    assert.equal(creature.hp, game.monsterCfg("brute").hp * 1.6);
    game.killMonster(creature);
    assert.ok(game.drops.some((drop) => drop.res === "crystal" && drop.n === 2));
  } finally { Math.random = originalRandom; game.destroy(); }
});

test("primeiras noites têm teto menor, crescem com dias e dificuldade e não empilham monstros", () => {
  storage.clear();
  const game = makeEngine(5); simplifySimulation(game); game.escort.active = false;
  game.tileAt = () => 2; game.referenceStructureAt = () => false; game.blockedByWall = () => false;
  game.monsters = []; game.day = 1;
  const early = game.monsterCap();
  game.spawnWave(20);
  assert.ok(game.monsters.length <= early && game.monsters.length > 0);
  for (let i = 0; i < game.monsters.length; i++) for (let j = i + 1; j < game.monsters.length; j++) {
    const a = game.monsters[i], b = game.monsters[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= Math.max(42, a.r + b.r + 16));
  }
  game.day = 5; const middle = game.monsterCap(); game.day = 15; const late = game.monsterCap();
  assert.ok(early < middle && middle < late && late <= 54);
  game.monsters = []; game.spawnMonster(1200, 1200, "imp"); game.spawnMonster(1200, 1200, "imp");
  for (let i = 0; i < 20; i++) game.separateMonsters(0.1);
  assert.ok(Math.hypot(game.monsters[0].x - game.monsters[1].x, game.monsters[0].y - game.monsters[1].y) > 29);
  game.destroy();
});

test("moradores caminham para destinos úteis, contornam obstáculos e mantêm os pés no chão", () => {
  storage.clear(); const game = makeEngine(17); simplifySimulation(game);
  const v = game.villagers[0]; game.villagers = [v]; game.chests = []; game.nearbyNodes = () => [];
  v.x = 58 * TILE; v.y = 122 * TILE; v.dir = 0; v.steps = 0;
  v.goalX = v.x + 100; v.goalY = v.y; v.t = 10;
  game.px = v.x + 1000; game.py = v.y; game.tileAt = () => 2;
  const wall = v.x + 5; game.referenceStructureAt = (x) => x >= wall;
  game.updateVillagers(0.1); assert.ok(v.x > 58 * TILE); assert.ok(v.steps > 0);
  for (let i = 0; i < 25; i++) game.updateVillagers(0.1);
  assert.ok(v.x < wall, "não atravessa a construção");
  assert.ok(Number.isFinite(v.dir));
  v.goalX = undefined; v.goalY = undefined; v.stopT = 0; game.referenceStructureAt = () => false;
  game.updateVillagers(0.1); assert.ok(Number.isFinite(v.goalX) && Number.isFinite(v.goalY), "seleciona outro destino na vila");
  game.destroy();
});

test("queda escala com dificuldade e pressão, preserva itens preciosos e só aplica saque uma vez", () => {
  function makeRaid(difficulty, pressure) {
    storage.clear();
    const game = new Engine({ canvas: canvas(), mode: "single", difficulty, playerName: "Teste", seed: 22, continueSave: false, onUi: noop });
    game.skipCutscene(); game.escort.active = false;
    game.inv = { wood: 100, stone: 100, fiber: 100, food: 100, iron: 40, crystal: 20 };
    game.tools = { axe: 3, pick: 2, sword: 3 }; game.equipment = { harness: true, coat: true, charm: true };
    game.structures = [{ type: "campfire", x: BASE.x, y: BASE.y, hp: 180, maxHp: 180, open: false, rotation: 0, fenceStyle: "palisade", prodT: 0 }];
    for (let i = 0; i < 50; i++) game.structures.push({ type: i % 5 ? "wall" : "farm", x: BASE.x + 300 + i * 40, y: BASE.y, hp: 200, maxHp: 200, open: false, rotation: 0, fenceStyle: "palisade", prodT: 0 });
    game.raidPeak = pressure; game.monsters = []; game.die(); return game;
  }
  const small = makeRaid("dificil", 0), smallLoss = small.deathReport.percent, smallBroken = small.deathReport.destroyed;
  assert.equal(small.state, "gameover"); assert.equal(small.pendingRespawn, true);
  assert.equal(small.inv.iron, 40); assert.equal(small.inv.crystal, 20); assert.deepEqual(small.tools, { axe: 3, pick: 2, sword: 3 });
  assert.ok(small.structures.some((s) => s.type === "campfire")); small.destroy();
  const large = makeRaid("dificil", 12);
  assert.ok(large.deathReport.percent > smallLoss); assert.ok(large.deathReport.destroyed >= smallBroken);
  const beforeReload = { inv: { ...large.inv }, structures: large.structures.length, report: { ...large.deathReport } };
  const saved = JSON.parse(localStorage.getItem(large.saveKey())); assert.equal(saved.pendingRespawn, true);
  large.destroy();
  const loaded = new Engine({ canvas: canvas(), mode: "single", difficulty: "dificil", playerName: "Teste", seed: 22, continueSave: true, onUi: noop });
  assert.equal(loaded.state, "gameover"); assert.deepEqual(loaded.inv, beforeReload.inv); assert.equal(loaded.structures.length, beforeReload.structures);
  loaded.respawn();
  assert.equal(loaded.state, "playing"); assert.equal(loaded.pendingRespawn, false);
  assert.equal(loaded.hp, Math.ceil(loaded.maxHp * 0.3)); assert.equal(loaded.stamina, 25);
  assert.ok(loaded.wakeT > 0 && loaded.invulnT >= 5); assert.deepEqual(loaded.inv, beforeReload.inv);
  assert.ok(Math.hypot(loaded.px - BASE.x, loaded.py - BASE.y) > 25, "não acordar dentro das chamas");
  assert.ok(loaded.allies.every((ally) => Math.hypot(ally.x - loaded.px, ally.y - loaded.py) >= 135), "companheiros não devem cobrir o personagem ferido");
  const after = JSON.parse(localStorage.getItem(loaded.saveKey())); assert.equal(after.pendingRespawn, false);
  loaded.destroy();
  const impossible = makeRaid("impossivel", 12);
  assert.ok(impossible.deathReport.percent > beforeReload.report.percent);
  assert.ok(impossible.deathReport.destroyed > beforeReload.report.destroyed);
  assert.equal(impossible.inv.crystal, 20); assert.equal(impossible.inv.iron, 40);
  impossible.respawn(); assert.equal(impossible.state, "playing", "até no impossível a base pode ser reconstruída");
  impossible.destroy();
});

test("resgates são independentes, exigem combate e preservam o progresso após salvar", () => {
  storage.clear(); const game = makeEngine(77); game.skipCutscene(); game.escort.active = false;
  const rescue = game.rescues.find((entry) => entry.id === "archer");
  game.px = rescue.x + 150; game.py = rescue.y; game.monsters = [];
  game.updateRescues(); assert.equal(rescue.phase, "fighting");
  assert.ok(rescue.defenders.length >= 1 && rescue.defenders.length <= 2);
  assert.equal(game.hireSpecialist("archer"), false, "não pode contratar antes de salvar");
  const other = game.specialists.mage;
  for (const monster of rescue.defenders) { monster.hp = 0; game.killMonster(monster); }
  game.updateRescues(); assert.equal(game.specialists.archer.rescued, true);
  assert.equal(other.rescued, false, "não libera todas as profissões juntas");
  game.px = rescue.x; game.py = rescue.y; game.tryInteract();
  assert.equal(game.specialists.archer.hired, true);
  assert.equal(game.specialistLevel(game.specialists.archer), 1);
  assert.equal(game.allies.filter((a) => a.id === "archer").length, 1);
  game.saveGame(true); game.destroy();
  const loaded = makeEngine(77, true);
  assert.equal(loaded.specialists.archer.hired, true);
  assert.equal(loaded.allies.filter((a) => a.id === "archer").length, 1);
  assert.equal(loaded.specialists.mage.rescued, false);
  loaded.destroy(); storage.clear();
});

test("treino, forja e mineração precisam das tarefas, tempo e recursos corretos", () => {
  storage.clear(); const game = makeEngine(77); game.skipCutscene(); game.escort.active = false;
  game.time = 10; game.monsters = []; game.structures = [];
  for (const id of ["archer", "miner"]) { game.specialists[id].rescued = true; assert.equal(game.hireSpecialist(id), true); }
  const archer = game.specialists.archer, ally = game.allies.find((a) => a.id === "archer");
  ally.x = BASE.x; ally.y = BASE.y; game.inv = { wood: 100, stone: 100, fiber: 100, food: 100, iron: 100, crystal: 100 };
  assert.equal(game.upgradeSpecialist("archer"), false, "sem forja nem treino");
  assert.equal(game.setSpecialistDuty("archer", "mine"), false);
  assert.equal(game.setSpecialistDuty("archer", "train"), true);
  game.updateSpecialists(46); assert.equal(game.specialistLevel(archer), 1, "treino sozinho não fabrica arma");
  game.structures.push({ type: "forge", x: BASE.x, y: BASE.y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  const iron = game.inv.iron; assert.equal(game.upgradeSpecialist("archer"), true);
  assert.equal(game.specialistLevel(archer), 2); assert.ok(game.inv.iron < iron);
  assert.equal(game.upgradeSpecialist("archer"), false, "próximo treino necessário");
  const miner = game.allies.find((a) => a.id === "miner"); miner.x = BASE.x; miner.y = BASE.y;
  let ore = game.inv.iron; game.updateSpecialists(46); assert.equal(game.inv.iron, ore, "sem pedreira não minera");
  game.structures.push({ type: "quarry", x: BASE.x, y: BASE.y, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  game.updateSpecialists(46); assert.equal(game.inv.iron, ore + 2);
  const crystals = game.inv.crystal; game.crystalDiscovered = true; game.updateSpecialists(46); assert.equal(game.inv.crystal, crystals + 1);
  game.setSpecialistDuty("miner", "rest"); ore = game.inv.iron; game.updateSpecialists(50); assert.equal(game.inv.iron, ore);
  game.saveGame(true); game.destroy();
  const loaded = makeEngine(77, true);
  assert.equal(loaded.specialists.archer.weaponLevel, 2); assert.equal(loaded.specialists.miner.duty, "rest");
  assert.equal(loaded.crystalDiscovered, true); loaded.destroy(); storage.clear();
});

test("níveis de espinhos e barricadas dependem do reino e da forja e sobrevivem ao save", () => {
  storage.clear();
  const game = makeEngine(77); simplifySimulation(game); game.escort.active = false;
  game.px = BASE.x; game.py = BASE.y; game.pdir = 0; game.chests = []; game.monsters = []; game.rescues = [];
  game.tileAt = () => 2; game.nearbyNodes = () => []; game.referenceStructureAt = () => false;
  game.inv = { wood: 10000, stone: 10000, fiber: 10000, food: 10000, iron: 10000, crystal: 10000 };
  const structure = (type, x) => ({ type, x, y: BASE.y - 260, prodT: 0, hp: 200, maxHp: 200, open: false, rotation: 0, fenceStyle: "palisade" });
  try {
    assert.equal(game.defenseTier, 1);
    game.setDefenseTier(2); assert.equal(game.defenseTier, 1, "reino insuficiente");
    game.structures = [structure("workbench", BASE.x - 200), structure("farm", BASE.x - 120)];
    game.setDefenseTier(2); assert.equal(game.defenseTier, 2);
    game.setDefenseTier(3); assert.equal(game.defenseTier, 2, "nível 3 ainda bloqueado");
    game.structures.push(structure("forge", BASE.x - 40));
    game.setDefenseTier(3); assert.equal(game.defenseTier, 3);
    game.structures.push(structure("house", BASE.x + 40), structure("campfire", BASE.x + 120), structure("farm", BASE.x + 200));
    game.setDefenseTier(4); assert.equal(game.defenseTier, 4);
    assert.equal(game.baseLevel(), 10);
    const price = game.costFor("spike_trap"), wood = game.inv.wood;
    assert.ok(game.build("spike_trap"));
    game.rotateStructure(); assert.equal(game.placeRotation, 0, "defesas não viram deitadas");
    const forge = game.structures.find((s) => s.type === "forge");
    game.structures = game.structures.filter((s) => s !== forge);
    assert.equal(game.confirmPlace(), false, "revalidar requisitos ao confirmar");
    assert.equal(game.inv.wood, wood, "não cobra ao rejeitar");
    game.structures.push(forge);
    assert.equal(game.confirmPlace(), true);
    const trap = game.structures.find((s) => s.type === "spike_trap");
    assert.equal(trap.tier, 4); assert.equal(trap.maxHp, game.structMaxHp("spike_trap", game.fenceStyle, 4));
    assert.equal(game.inv.wood, wood - price.wood);
    assert.equal(game.baseLevel(), 10, "defesas não aumentam o nível de reino artificialmente");
    game.setDefenseTier(2); game.pdir = Math.PI / 2;
    assert.equal(game.build("barricade"), true); assert.equal(game.confirmPlace(), true);
    const barricade = game.structures.find((s) => s.type === "barricade");
    assert.equal(barricade.tier, 2); barricade.hp -= 20;
    game.saveGame(true);
    const key = game.saveKey(), data = JSON.parse(storage.get(key));
    assert.equal(data.defenseTier, 2);
    assert.deepEqual(data.structures.filter((s) => ["spike_trap", "barricade"].includes(s.type)).map((s) => s.tier), [4, 2]);
    const loaded = makeEngine(1, true);
    try {
      assert.equal(loaded.opts.seed, 77);
      assert.equal(loaded.defenseTier, 2);
      assert.equal(loaded.structures.find((s) => s.type === "spike_trap").tier, 4);
      const savedBarricade = loaded.structures.find((s) => s.type === "barricade");
      assert.equal(savedBarricade.tier, 2); assert.equal(savedBarricade.hp, barricade.hp);
      assert.equal(savedBarricade.maxHp, game.structMaxHp("barricade", game.fenceStyle, 2));
    } finally { loaded.destroy(); }
    // A save from before the new types has neither tier field.
    delete data.defenseTier;
    data.structures = data.structures.filter((s) => s.type !== "spike_trap" && s.type !== "barricade");
    for (const s of data.structures) delete s.tier;
    storage.set(key, JSON.stringify(data));
    const old = makeEngine(1, true);
    try { assert.equal(old.defenseTier, 1); assert.equal(old.structures.length, 6); assert.equal(old.baseLevel(), 10); }
    finally { old.destroy(); }
  } finally { game.destroy(); storage.clear(); }
});

test("espinhos são atravessáveis, atingem apenas hostis e respeitam o tempo de recarga", () => {
  storage.clear(); const game = makeEngine(32); simplifySimulation(game); game.escort.active = false;
  game.tileAt = () => 2; game.nearbyNodes = () => []; game.referenceStructureAt = () => false;
  game.chests = []; game.rescues = []; game.allies = [];
  const trap = { type: "spike_trap", x: BASE.x, y: BASE.y, prodT: 0, hp: 200, maxHp: 200, open: false, rotation: 0, fenceStyle: "palisade", tier: 3 };
  game.structures = [trap]; game.px = BASE.x - 60; game.py = BASE.y; game.monsters = [];
  game.keys.add("d");
  for (let i = 0; i < 80; i++) game.update(0.02, { mx: 0, my: 0 });
  assert.ok(game.px > BASE.x + 30, "jogador deve poder cruzar os espinhos");
  assert.equal(game.blockedByWall(trap.x, trap.y), false);
  game.keys.clear(); game.px = trap.x; game.py = trap.y; game.hp = 100;
  game.allies = [{ id: "rian", name: "Rian", color: "#fff", x: trap.x, y: trap.y, vx: 0, vy: 0, atkCd: 0, downT: 0, dir: 0 }];
  game.spawnMonster(trap.x + 10, trap.y, "imp"); game.spawnMonster(trap.x - 10, trap.y, "imp"); game.spawnMonster(trap.x + 90, trap.y, "imp");
  const [first, second, outside] = game.monsters;
  first.hp = 100; second.hp = 5; outside.hp = 100;
  game.updateStructures(0.01);
  assert.equal(first.hp, 82); assert.ok(second.hp <= 0); assert.equal(outside.hp, 100);
  assert.equal(game.kills, 1); assert.equal(game.hp, 100); assert.equal(game.allies[0].downT, 0);
  game.updateStructures(0.7); game.updateStructures(0.69);
  assert.equal(first.hp, 82, "não aplica dano novamente antes de 1,4 s");
  game.updateStructures(0.02);
  assert.equal(first.hp, 64); assert.equal(game.kills, 1, "um abate só é contado uma vez");
  assert.doesNotThrow(() => game.drawStructure(trap, 0, 0, 0));
  game.destroy(); storage.clear();
});

test("barricada bloqueia pessoas e projéteis, recebe ataque e pode ser reparada", () => {
  storage.clear(); const game = makeEngine(19); game.skipCutscene(); game.escort.active = false;
  game.updateSpawns = noop; game.animals = []; game.chests = []; game.rescues = []; game.allies = []; game.villagers = [];
  game.tileAt = () => 2; game.nearbyNodes = () => []; game.referenceStructureAt = () => false;
  const barrier = { type: "barricade", x: BASE.x, y: BASE.y, prodT: 0, hp: 1000, maxHp: 1000, open: false, rotation: 0, fenceStyle: "palisade", tier: 2 };
  game.structures = [barrier]; game.monsters = []; game.px = BASE.x - 60; game.py = BASE.y; game.inv.wood = 100;
  assert.equal(game.blockedByWall(barrier.x, barrier.y), true);
  assert.equal(game.monsterSpawnClear(barrier.x, barrier.y, "imp"), false);
  game.keys.add("d"); for (let i = 0; i < 80; i++) game.update(0.02, { mx: 0, my: 0 }); game.keys.clear();
  assert.ok(game.px < barrier.x - 20, "jogador não atravessa");
  game.projectiles = [{ kind: "ally", x: barrier.x - 40, y: barrier.y, vx: 400, vy: 0, t: 2, dmg: 7 }];
  game.updateMonsters(0.1); assert.equal(game.projectiles.length, 0, "flechas param na barricada");
  game.spawnMonster(barrier.x + 55, barrier.y, "imp");
  const monster = game.monsters[0]; monster.state = "chase"; monster.speed = 65; monster.t = 99;
  for (let i = 0; i < 150; i++) game.updateMonsters(0.02);
  assert.ok(barrier.hp < barrier.maxHp, "invasores devem atacar a barricada");
  const damaged = barrier.hp, wood = game.inv.wood;
  game.monsters = []; game.px = barrier.x - 35; game.py = barrier.y;
  game.tryInteract(); assert.ok(barrier.hp > damaged); assert.ok(game.inv.wood < wood);
  assert.doesNotThrow(() => game.drawStructure(barrier, 0, 0, 0));
  game.destroy(); storage.clear();
});

test("raio da maga é apenas um efeito visual do projétil, sem dano adicional", () => {
  storage.clear(); const game = makeEngine(33); game.skipCutscene(); game.escort.active = false;
  game.tileAt = () => 2; game.referenceStructureAt = () => false; game.chests = []; game.structures = []; game.monsters = [];
  game.px = 1000; game.py = 1100; game.spawnMonster(1300, 1100, "imp");
  const target = game.monsters[0]; target.hp = 100; target.speed = 0; target.state = "hurt"; target.t = 99;
  game.projectiles = [{ kind: "magic", x: 1220, y: 1100, vx: 420, vy: 0, t: 2, dmg: 7 }];
  game.updateMonsters(0.2);
  assert.equal(target.hp, 93); assert.equal(game.magicEffects.length, 1);
  game.updateParticles(0.6); assert.equal(game.magicEffects.length, 0); assert.equal(target.hp, 93);
  target.x = 1300; target.y = 1100; target.vx = 0; target.vy = 0;
  game.projectiles = [{ kind: "ally", x: 1220, y: 1100, vx: 420, vy: 0, t: 2, dmg: 7 }];
  game.updateMonsters(0.2); assert.equal(target.hp, 86); assert.equal(game.magicEffects.length, 0);
  game.destroy(); storage.clear();
});

test("Rian acompanha só quando solicitado e a escolha sobrevive ao save", () => {
  storage.clear(); const game = makeEngine(12); simplifySimulation(game);
  const rian = game.allies.find((ally) => ally.id === "rian");
  game.escort.active = true;
  assert.equal(game.setRianDuty("follow"), false, "durante a escolta, Rian conduz o caminho");
  game.escort.active = false; game.monsters = []; game.px = BASE.x + 1400; game.py = BASE.y + 1000;
  rian.x = BASE.x; rian.y = BASE.y;
  game.updateAllies(0.1);
  assert.equal(game.rianDuty, "stay");
  assert.ok(Math.hypot(rian.x - BASE.x, rian.y - BASE.y) < 200, "ele não vai atrás do jogador por padrão");
  assert.equal(game.setRianDuty("follow"), true);
  game.updateAllies(0.1);
  assert.ok(Math.hypot(rian.x - game.px, rian.y - game.py) < 200, "um chamado alcança o jogador");
  const loaded = makeEngine(12, true);
  assert.equal(loaded.rianDuty, "follow"); assert.equal(loaded.escort.active, false);
  assert.equal(loaded.setRianDuty("stay"), true);
  const reloaded = makeEngine(12, true);
  const returned = reloaded.allies.find((ally) => ally.id === "rian");
  assert.equal(reloaded.rianDuty, "stay");
  assert.ok(Math.hypot(returned.x - BASE.x, returned.y - BASE.y) < 150, "ao carregar, Rian aparece na base");
  reloaded.destroy(); loaded.destroy(); game.destroy();
});

test("árvores espaçadas preservam índices e deixam tocos persistentes que rendem madeira", () => {
  storage.clear();
  for (const seed of [1, 2, 77]) {
    const game = makeEngine(seed);
    const trees = game.nodes.filter((n) => n.type === "tree" || n.type === "pine");
    for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
      assert.ok(Math.hypot(trees[i].x - trees[j].x, trees[i].y - trees[j].y) >= 50, `árvores sobrepostas na semente ${seed}`);
    }
    game.destroy();
  }
  const game = makeEngine(77); simplifySimulation(game); game.escort.active = false;
  const node = game.nodes.find((n) => n.type === "tree"), index = game.nodes.indexOf(node);
  node.hp = 1; game.harvest(node);
  assert.equal(node.hp, 0); assert.equal(node.stumpHp, 12);
  game.harvest(node); assert.ok(node.stumpHp > 0 && node.stumpHp < 12);
  game.saveGame(true);
  const loaded = makeEngine(77, true), stump = loaded.nodes[index];
  assert.equal(stump.stumpHp, node.stumpHp);
  loaded.drops = []; loaded.harvest(stump);
  assert.equal(stump.stumpHp, 0); assert.equal(loaded.drops.filter((d) => d.res === "wood").length, 3);
  loaded.saveGame(true);
  const gone = makeEngine(77, true); assert.equal(gone.nodes[index].stumpHp, 0);
  const oldSave = JSON.parse(storage.get(game.saveKey())); delete oldSave.nodeStumps;
  storage.set(game.saveKey(), JSON.stringify(oldSave));
  const legacy = makeEngine(77, true); assert.equal(legacy.nodes[index].stumpHp, 12, "saves anteriores também têm toco");
  legacy.destroy(); gone.destroy(); loaded.destroy(); game.destroy();
});

test("arena verifica toda a área, impede respawn e recebe profissionais para treinar", () => {
  storage.clear(); const game = makeEngine(22); simplifySimulation(game); game.escort.active = false;
  game.px = BASE.x - 200; game.py = BASE.y - 200; game.tileAt = () => 2; game.settings.craftPix = false;
  game.structures = []; game.monsters = []; game.nearbyNodes = () => [];
  const x = BASE.x + 65, y = BASE.y + 65;
  assert.equal(game.placeCheck("training", x, y), "");
  const tree = { type: "tree", x: x + 95, y: y + 70, hp: 10, maxHp: 10, respawn: 0, wob: 0 };
  game.nearbyNodes = () => [tree];
  assert.match(game.placeCheck("training", x, y), /árvores/);
  tree.hp = 0; tree.respawn = 0.01; game.depletedNodes.add(tree);
  const arena = { type: "training", x, y, hp: 220, maxHp: 220, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
  game.structures.push(arena); game.update(0.1, { mx: 0, my: 0 });
  assert.equal(tree.hp, 0); assert.ok(tree.respawn > 0, "árvore não cresce por cima do piso");
  assert.match(game.placeCheck("farm", x + 80, y), /arena/);
  game.specialists.archer.rescued = true; assert.ok(game.hireSpecialist("archer"));
  assert.ok(game.setSpecialistDuty("archer", "train"));
  const archer = game.allies.find((ally) => ally.id === "archer"), station = game.trainingStation(arena, "archer");
  archer.x = station.x; archer.y = station.y; archer.vx = 0; archer.vy = 0;
  game.isNight = () => false; game.updateAllies(0.1); game.updateSpecialists(5);
  assert.ok(archer.atkCd > 0, "a prática usa a animação de ataque");
  assert.equal(game.specialists.archer.training, 5);
  assert.equal(game.projectiles.length, 0, "treino não fere criaturas");
  game.spawnMonster(x, y, "imp"); game.updateSpecialists(5);
  assert.equal(game.specialists.archer.training, 5, "treino para quando há perigo");
  game.monsters = []; game.isNight = () => true; game.updateSpecialists(5);
  assert.equal(game.specialists.archer.training, 5, "treino acontece durante o dia");
  game.destroy();
});

test("saves legados preservam os encaixes originais e suas ligações", () => {
  storage.clear(); const original = makeEngine(55); simplifySimulation(original); original.escort.active = false;
  original.legacyTerritory = true; original.px = BASE.x; original.py = BASE.y;
  const wall = (slot) => ({ type: "wall", ...original.fencePosition(slot, 1), hp: 200, maxHp: 200, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  original.structures = [wall(0), wall(1)]; original.saveGame(true);
  const data = JSON.parse(storage.get(original.saveKey())); delete data.territoryLayout;
  storage.set(original.saveKey(), JSON.stringify(data));
  const loaded = makeEngine(55, true); loaded.dpr = 0.8;
  assert.equal(loaded.fenceSpec(1).slots, 63);
  assert.equal(loaded.fenceSpec(1).fenceRadius, 350.4);
  assert.deepEqual(loaded.structures.map(({ x, y }) => ({ x, y })), original.structures.map(({ x, y }) => ({ x, y })));
  const camp = loaded.worldProps.find((p) => p.sprite === "reference_camp");
  assert.deepEqual({ x: camp.x, y: camp.y }, { x: BASE.x - 130, y: BASE.y - 120 });
  const links = []; loaded.drawFenceLink = (...args) => links.push(args);
  loaded.drawFenceConnections(-BASE.x + 640, -BASE.y + 360);
  assert.equal(links.length, 1, "trechos antigos adjacentes continuam conectados");
  loaded.destroy(); original.destroy();
});

test("monstros contornam água próxima sem perder o aviso de ataque ou a capacidade de serem derrotados", () => {
  storage.clear(); const game = makeEngine(42); game.skipCutscene(); game.escort.active = false;
  game.structures = []; game.monsters = []; game.px = 1200; game.py = 1200; game.isNight = () => false;
  game.referenceStructureAt = () => false;
  // A small water strip lies directly between the creature and the player.
  game.tileAt = (x, y) => x > 1080 && x < 1120 && Math.abs(y - 1200) < 18 ? 0 : 2;
  game.spawnMonster(1050, 1200, "crawler");
  const enemy = game.monsters[0]; enemy.state = "chase";
  game.updateMonsters(0.1);
  assert.notEqual(enemy.dir, 0, "escolheu uma direção lateral diante da água");
  assert.notEqual(game.tileAt(enemy.x, enemy.y), 0);
  game.tileAt = () => 2; enemy.x = game.px - 32; enemy.y = game.py; enemy.vx = 0; enemy.vy = 0; enemy.state = "chase"; enemy.atkCd = 0;
  game.updateMonsters(0.01); assert.equal(enemy.state, "windup"); assert.ok(enemy.t >= 0.3, "o ataque continua telegráfico");
  enemy.hp = 1; game.killMonster(enemy); assert.equal(game.kills, 1); assert.equal(enemy.defeated, true);
  game.destroy();
});

test("arena pode ser posicionada pela prévia, cobra só ao confirmar e é salva", () => {
  storage.clear(); const game = makeEngine(77); simplifySimulation(game); game.escort.active = false;
  game.settings.craftPix = false; game.tileAt = () => 2; game.nearbyNodes = () => []; game.chests = [];
  game.structures = []; game.px = BASE.x + 56; game.py = BASE.y + 176; game.centerCamera();
  game.inv = { wood: 500, stone: 500, fiber: 500, food: 10, iron: 0, crystal: 0 };
  const price = game.costFor("training"), before = { ...game.inv };
  assert.ok(game.build("training"));
  game.settings.controls = "kb-mouse"; game.mouseValid = true;
  game.mouseX = BASE.x + 56 - game.camX; game.mouseY = BASE.y + 56 - game.camY;
  game.updatePlacement(); assert.equal(game.placeReason, "");
  assert.equal(game.inv.wood, before.wood, "a prévia não cobra materiais");
  assert.ok(game.confirmPlace()); assert.equal(game.inv.wood, before.wood - price.wood);
  assert.equal(game.structures.filter((s) => s.type === "training").length, 1);
  assert.match(game.structLock("training"), /Já existe/);
  game.saveGame(true); const loaded = makeEngine(77, true);
  assert.equal(loaded.structures.filter((s) => s.type === "training").length, 1);
  assert.equal(loaded.legacyTerritory, false);
  loaded.destroy(); game.destroy();
});
