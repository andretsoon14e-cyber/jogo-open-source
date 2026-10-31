import test from "node:test";
import assert from "node:assert/strict";
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

test("fogueiras geram partículas pelo tempo da simulação, respeitam o limite e não emitem ao desenhar", () => {
  const game = makeEngine(32);
  const random = Math.random;
  try {
    game.skipCutscene();
    const fire = { type: "campfire", x: game.px, y: game.py, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" };
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
  assert.equal(game.territoryRadius(), 480);
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
  const saved = JSON.parse(storage.get(game.saveKey())); delete saved.territoryLevel; delete saved.fenceRing;
  storage.set(game.saveKey(), JSON.stringify(saved));
  const legacy = makeEngine(77, true);
  assert.equal(legacy.territoryLevel, 1); assert.equal(legacy.fenceRing, 1);
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
  for (let i = 0; i < 63; i++) {
    if (i === 0 || i === 3) continue;
    const p = game.fencePosition(i, 1);
    game.structures.push({ type: i === 1 ? "gate" : "wall", ...p, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  }
  assert.equal(game.wallPurchaseSize(), 1);
  const before = { ...game.inv }, cost = game.costFor("wall");
  assert.ok(game.build("wall")); assert.equal(game.fencePositions("wall").length, 1);
  assert.ok(game.confirmPlace());
  assert.equal(game.structures.length, 62); assert.equal(game.inv.wood, before.wood - cost.wood);
  assert.equal(game.wallPurchaseSize(), 1);
  assert.ok(game.confirmPlace()); assert.equal(game.structures.length, 63);
  assert.equal(new Set(game.structures.map((s) => `${s.x}:${s.y}`)).size, 63);
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
  for (let i = 1; i < 63; i++) game.structures.push({ type: "wall", ...game.fencePosition(i, 1), hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
  assert.match(game.structLock("wall"), /portão/); assert.equal(game.build("wall"), false);
  assert.ok(game.build("gate")); assert.ok(game.confirmPlace());
  assert.equal(game.structures.filter((s) => s.type === "gate").length, 1);
  assert.equal(game.structures.length, 63); game.destroy();
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
