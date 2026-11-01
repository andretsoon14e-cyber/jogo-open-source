import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundle = join(tmpdir(), "ultima-luz-references-test.js");
await build({ entryPoints: ["tests/browser-entry.ts"], bundle: true, platform: "browser", format: "iife", globalName: "ReferenceTest", outfile: bundle, tsconfig: "tsconfig.json" });
async function image(width, height, color) {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}
const sizes = { figures: [384, 96], creatures: [1152, 96], archer: [768, 1152], "archer-hood": [768, 1152], "mage-blue": [1152, 768], "mage-red": [1152, 768], minerals: [960, 96], rocks: [768, 96], icons: [512, 64], plants: [384, 64], bow: [64, 64], menu: [960, 640], forge: [260, 210], house: [220, 250], chest: [100, 82], chapel: [240, 294], market: [200, 176], camp: [200, 200], sewer: [200, 87], castle_wall: [44, 84], castle_tower: [112, 196], castle_gate: [82, 70], castle_grate: [31, 25], house_half_timber: [220, 250], house_wood_a: [220, 250], house_wood_b: [220, 250], house_stone: [220, 250], bridge_wood_h: [160, 108], bridge_wood_v: [64, 136], bridge_stone_h: [160, 116], bridge_stone_v: [80, 140], barricade_1: [96, 128], barricade_2: [96, 128], barricade_3: [96, 128], barricade_4: [96, 128], spikes: [576, 384], lightning: [480, 200], ripples: [384, 64] };
const objectNames = ["forge", "house", "chest", "chapel", "market", "camp", "sewer", "castle_wall", "castle_tower", "castle_gate", "castle_grate", "house_half_timber", "house_wood_a", "house_wood_b", "house_stone", "bridge_wood_h", "bridge_wood_v", "bridge_stone_h", "bridge_stone_v", "barricade_1", "barricade_2", "barricade_3", "barricade_4"];
const fixtures = {};
for (const [key, [width, height]] of Object.entries(sizes)) fixtures[`${key}.png`] = await image(width, height, key === "bow" ? "#993344" : "#68a438");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  for (const scenario of ["missing", "complete", "broken-archer", "broken-object", "broken-resident", "broken-effects", "partial-figures", "broken-figures", "broken-creatures"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://references.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: '<canvas style="width:1280px;height:720px"></canvas>' });
      if (pathname === "/referencias/manifest.json") {
        if (scenario === "missing") return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, archer: true, archerHood: true, mageBlue: true, mageRed: true, minerals: true, rocks: true, icons: true, plants: true, bow: true, menu: true, spikes: true, lightning: true, ripples: true, figures: scenario === "partial-figures" ? [true, false, false, true] : [true, true, true, true], creatures: true, objects: Object.fromEntries(objectNames.map((x) => [x, true])), scenes: { forge: true, chapel: true, market: true, camp: true, sewer: true } }) });
      }
      const name = pathname.split("/").at(-1);
      if ((scenario === "broken-figures" && name === "figures.png") || (scenario === "broken-creatures" && name === "creatures.png")) return route.fulfill({ status: 200, contentType: "image/png", body: fixtures["sewer.png"] });
      if ((scenario === "broken-archer" && name === "archer.png") || (scenario === "broken-object" && name === "chapel.png") || (scenario === "broken-resident" && ["mage-blue.png", "minerals.png"].includes(name)) || (scenario === "broken-effects" && ["spikes.png", "barricade_2.png"].includes(name))) return route.fulfill({ status: 200, contentType: "image/png", body: fixtures["sewer.png"] });
      if (pathname.startsWith("/referencias/") && fixtures[name]) return route.fulfill({ status: 200, contentType: "image/png", body: fixtures[name] });
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://references.test/");
    await page.addScriptTag({ path: bundle });
    const result = await page.evaluate(async () => {
      const api = window.ReferenceTest;
      await api.loadReferenceArt();
      const status = { archer: api.hasReferenceArcher() };
      const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
      const calls = [];
      const original = ctx.drawImage.bind(ctx);
      ctx.drawImage = (...args) => { if (args[0] instanceof HTMLImageElement && args[0].src.includes("/referencias/")) calls.push({ src: new URL(args[0].src).pathname, args: args.slice(1), scaleX: Math.abs(ctx.getTransform().a) }); original(...args); };
      const newPreviews = {
        figure0: api.drawReferenceFigure(ctx, 0, 60, 100), figure1: api.drawReferenceFigure(ctx, 1, 60, 100),
        figure3: api.drawReferenceFigure(ctx, 3, 60, 100), figure4: api.drawReferenceFigure(ctx, 4, 60, 100),
        creature: api.hasReferenceCreature("zombie"), drawn: api.drawReferenceCreature(ctx, "zombie", true),
        white: api.drawReferenceCreature(ctx, "zombie", false, "white"), red: api.drawReferenceCreature(ctx, "lich", false, "red"),
        unknown: api.drawReferenceCreature(ctx, "unknown", false), thumb: !!api.referenceCreatureUrl("skeleton"),
        cached: api.referenceCreatureUrl("skeleton") === api.referenceCreatureUrl("skeleton"),
      };
      const drewArcher = api.drawReferenceArcher(ctx, "side", true, "attack", 0, 0.5);
      const drewChapel = api.drawReferenceObject(ctx, "chapel", 100, 200);
      const objects = { chapel: drewChapel, sewer: api.drawReferenceObject(ctx, "sewer", 100, 200), forge: api.drawReferenceObject(ctx, "forge", 100, 200), house: api.drawReferenceObject(ctx, "house", 100, 200), chest: api.drawReferenceObject(ctx, "chest", 100, 200) };
      const icon = { wood: api.drawReferenceIcon(ctx, "it_wood", 1, 2, 32), bow: api.drawReferenceIcon(ctx, "tool_bow", 1, 2, 32), unknown: api.drawReferenceIcon(ctx, "it_stone", 1, 2, 32), thumb: !!api.referenceIconUrl("tool_axe"), cached: api.referenceIconUrl("tool_axe") === api.referenceIconUrl("axe") };
      const newAssets = { plant: api.drawReferencePlant(ctx, 5, 100, 100), menu: !!api.referenceMenuUrl(), bowThumb: !!api.referenceIconUrl("tool_bow"), castleWall: api.hasReferenceObject("castle_wall"), castleGate: api.hasReferenceObject("castle_gate"), castleGrate: api.hasReferenceObject("castle_grate"), castleTower: api.hasReferenceObject("castle_tower") };
      const expansion = {
        house: api.drawReferenceObject(ctx, "house_wood_a", 100, 200),
        barrier: api.drawReferenceObject(ctx, "barricade_2", 100, 200),
        bridge: api.drawReferenceBridge(ctx, "bridge_wood_v", 10, 10, 64, 96),
        spikes: api.drawReferenceSpikes(ctx, 3, 2, 100, 100),
        spikeThumb: !!api.referenceSpikeUrl(3),
        lightning: api.drawReferenceLightning(ctx, 4, 100, 200),
        ripple: api.drawReferenceRipple(ctx, 5, 100, 100),
      };
      const regional = {
        blue: api.drawReferenceResident(ctx, "mage-blue", "side", true, true, 0),
        red: api.drawReferenceResident(ctx, "mage-red", "up", false, false, 0.2),
        hood: api.drawReferenceResident(ctx, "archer-hood", "down", false, true, 0),
        archer: api.drawReferenceResident(ctx, "archer", "down", false, false, 0),
        mineral: api.drawReferenceDeposit(ctx, "mineral", 9, 100, 100),
        rock: api.drawReferenceDeposit(ctx, "rock", 7, 100, 100),
      };
      const paperdollBow = api.getCharacterUrl("player", "up", "bow", true, 2) !== api.getCharacterUrl("player", "up", "sword", true, 2);
      const directCalls = calls.slice();
      const frame = {
        idle: api.referenceArcherFrame("down", false, "idle", 0, 0),
        left: api.referenceArcherFrame("side", true, "walk", 0, 0),
        right: api.referenceArcherFrame("side", false, "walk", 0, 0),
        attackUp: api.referenceArcherFrame("up", false, "attack", 0, 1),
      };
      // Bridges are clipped to actual crossing tiles, cached, and invalidated
      // when a new foundation changes the terrain.
      const tileMap = new Uint8Array(8 * 8).fill(2);
      for (let y = 2; y <= 4; y++) { tileMap[y * 8 + 2] = 0; tileMap[y * 8 + 3] = 7; tileMap[y * 8 + 4] = 0; }
      const ground = new api.Terrain(tileMap, 8, 8, 32);
      const layer = document.createElement("canvas"); layer.width = layer.height = 256;
      const painter = layer.getContext("2d");
      const alphaAt = (x, y) => painter.getImageData(x * 32 + 16, y * 32 + 16, 1, 1).data[3];
      ground.drawBridges(painter, 0, 0, 256, 256, 0, 0);
      const bridgePaint = { crossing: alphaAt(3, 3), water: alphaAt(2, 3) };
      tileMap[3 * 8 + 3] = 0; ground.invalidateAll(); painter.clearRect(0, 0, 256, 256);
      ground.drawBridges(painter, 0, 0, 256, 256, 0, 0);
      bridgePaint.afterMutation = alphaAt(3, 3); bridgePaint.remaining = alphaAt(3, 2);

      const events = [];
      const make = (continueSave = false) => new api.Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed: 77, continueSave, onUi: (event) => events.push(event) });
      const game = make(); game.skipCutscene(); game.escort.active = false; game.updateSpawns = () => {};
      calls.length = 0;
      for (const resident of game.villagers) game.drawVillager(resident, 0, 0, 0);
      const residentSources = calls.map((call) => call.src.split("/").at(-1));
      const figureDraws = residentSources.filter((name) => name === "figures.png").length;
      game.monsters = []; game.spawnMonster(game.px + 100, game.py, "zombie");
      calls.length = 0; game.drawMonster(game.monsters[0], 0, 0, 0);
      const creatureCall = calls.find((call) => call.src.endsWith("/creatures.png"));
      const monsterDraw = !!creatureCall, monsterScale = creatureCall?.scaleX ?? null;
      const thumbChanged = api.getSpriteUrl("zombie", true) !== api.getSpriteUrl("zombie", false);
      game.applySettings({ ...game.settings, craftPix: false });
      calls.length = 0; game.drawVillager(game.villagers.find((v) => v.figure === 0), 0, 0, 0); game.drawMonster(game.monsters[0], 0, 0, 0);
      const disabledNewDraw = calls.some((call) => /\/(?:figures|creatures)\.png$/.test(call.src));
      game.applySettings({ ...game.settings, craftPix: true });
      // Actual world rendering uses the enlarged reference, not just a stored scale.
      const mainHouse = game.villageHouses[0];
      game.px = mainHouse.x; game.py = mainHouse.y + 170; game.centerCamera(); game.monsters = [];
      calls.length = 0; game.render();
      const houseCall = calls.find((call) => call.src.endsWith("/house.png"));
      const worldHouseSize = houseCall ? houseCall.args.slice(-2) : null;
      game.tileAt = () => 2;
      game.structures = []; game.monsters = [];
      game.questP[1] = 19;
      game.spawnMonster(game.px + 100, game.py, "imp");
      const victim = game.monsters[0];
      game.killMonster(victim); game.killMonster(victim); game.checkQuests();
      const recruited = game.allies.map((a) => a.id);
      game.saveGame(true);
      const key = game.saveKey(), saved = JSON.parse(localStorage.getItem(key));
      const questDoesNotHire = !saved.allies.includes("archer");
      game.destroy();
      delete saved.specialists; saved.allies.push("archer"); saved.tools.sword = 2;
      localStorage.setItem(key, JSON.stringify(saved));
      const loadedOld = make(true);
      const oldCount = loadedOld.allies.filter((a) => a.id === "archer").length;
      const oldLevel = loadedOld.specialistLevel(loadedOld.specialists.archer);
      loadedOld.saveGame(true);
      const upgradedSave = JSON.parse(localStorage.getItem(key)).allies.filter((id) => id === "archer").length;
      loadedOld.destroy();
      saved.allies = saved.allies.filter((id) => id !== "archer");
      localStorage.setItem(key, JSON.stringify(saved));
      const completedOldQuest = make(true);
      const premature = completedOldQuest.allies.some((a) => a.id === "archer");
      completedOldQuest.destroy();
      localStorage.removeItem(key);

      const fight = make(); fight.skipCutscene(); fight.escort.active = false; fight.tileAt = () => 2; fight.structures = []; fight.monsters = []; fight.projectiles = []; fight.animals = [];
      fight.px = 1100; fight.py = 1100; fight.hp = 100; fight.invulnT = 0;
      fight.allies = []; fight.specialists.archer.rescued = true; fight.hireSpecialist("archer");
      const archer = fight.allies[0]; archer.x = 1000; archer.y = 1100;
      fight.spawnMonster(1300, 1100, "imp");
      fight.monsters[0].hp = 3; fight.monsters[0].speed = 0; fight.monsters[0].t = 99;
      fight.updateAllies(0.001);
      const arrow = { count: fight.projectiles.length, kind: fight.projectiles[0]?.kind };
      for (let i = 0; i < 10; i++) fight.updateMonsters(0.1);
      const combat = { hp: fight.hp, kills: fight.kills, quest: fight.questP[1], count: fight.projectiles.length };

      const wall = (type, open) => ({ type, open, x: 1200, y: 1100, hp: 100, maxHp: 100, prodT: 0, rotation: 0, fenceStyle: "palisade" });
      calls.length = 0;
      fight.drawStructure({ ...wall("spike_trap", false), tier: 3, prodT: 1.2 }, 0, 0, 0);
      fight.drawStructure({ ...wall("barricade", false), tier: 2 }, 0, 0, 0);
      const defenseSources = calls.map((call) => call.src.split("/").at(-1));
      calls.length = 0;
      for (let i = 0; i < 5; i++) fight.drawStructure({ ...wall("house", false), x: 1200 + i * 16 }, 0, 0, 0);
      const houseSources = [...new Set(calls.map((call) => call.src.split("/").at(-1)))];
      fight.applySettings({ ...fight.settings, craftPix: false }); calls.length = 0;
      fight.drawStructure({ ...wall("spike_trap", false), tier: 3 }, 0, 0, 0);
      fight.drawStructure({ ...wall("barricade", false), tier: 2 }, 0, 0, 0);
      const disabledDefenseSources = calls.map((call) => call.src.split("/").at(-1));
      fight.applySettings({ ...fight.settings, craftPix: true });
      const trial = (structure) => {
        fight.monsters = []; fight.projectiles = []; fight.structures = structure ? [structure] : [];
        fight.spawnMonster(1300, 1100, "imp");
        const m = fight.monsters[0]; m.speed = 0; m.t = 99; m.hp = 20;
        fight.projectiles.push({ kind: "ally", x: 1000, y: 1100, vx: 420, vy: 0, t: 2, dmg: 7 });
        for (let i = 0; i < 10; i++) fight.updateMonsters(0.1);
        return { hp: m.hp, arrows: fight.projectiles.length };
      };
      const closed = trial(wall("wall", false)), open = trial(wall("gate", true));
      fight.structures = []; fight.monsters = []; fight.projectiles = [];
      fight.spawnMonster(1024, 1100, "imp"); const fastEnemy = fight.monsters[0]; fastEnemy.speed = 0; fastEnemy.t = 99;
      const beforeFast = fastEnemy.hp;
      fight.projectiles.push({ kind: "ally", x: 1000, y: 1100, vx: 420, vy: 0, t: 2, dmg: 7 });
      fight.updateMonsters(0.1);
      const noTunnel = fastEnemy.hp < beforeFast;
      fight.monsters = []; fight.projectiles = [{ x: fight.px - 20, y: fight.py, vx: 330, vy: 0, t: 1, dmg: 10 }];
      fight.invulnT = 0; const beforeEnemy = fight.hp; fight.updateMonsters(0.06);
      const hostileDamage = fight.hp < beforeEnemy;
      fight.monsters = []; fight.projectiles = []; archer.atkCd = 0; fight.updateAllies(0.01);
      const noTarget = fight.projectiles.length === 0;

      // Reference buildings block player and ally arrows, monsters and hostile
      // projectiles without changing the fence siege state.
      const marketProp = fight.worldProps.find((p) => p.sprite === "reference_market");
      fight.px = marketProp.x; fight.py = marketProp.y - 150;
      fight.structures = []; fight.monsters = []; fight.projectiles = [];
      fight.spawnMonster(marketProp.x, marketProp.y + 26, "imp");
      const approaching = fight.monsters[0]; approaching.speed = 0; approaching.state = "hurt"; approaching.t = 99;
      for (let i = 0; i < 10; i++) { approaching.vy = -120; fight.updateMonsters(0.05); }
      const monsterAtBuilding = { offset: approaching.y - marketProp.y, siege: approaching.siege };
      fight.monsters = [];
      const shotAtBuilding = (kind) => {
        fight.projectiles = [{ kind, x: marketProp.x, y: marketProp.y + 37, vx: 0, vy: -300, t: 1, dmg: 7 }];
        fight.updateMonsters(0.1);
        return fight.projectiles.length;
      };
      const buildingShots = [shotAtBuilding("ally"), shotAtBuilding("player"), shotAtBuilding(undefined)];
      const house = wall("house", false); fight.structures = [house];
      const placedFootprints = [fight.blockedByWall(house.x + 50, house.y)];
      house.rotation = Math.PI / 2;
      placedFootprints.push(fight.blockedByWall(house.x, house.y + 50));
      let shadowCalls = 0; const oldShadow = fight.drawShadow; fight.drawShadow = () => { shadowCalls++; };
      house.rotation = 0; fight.drawStructure(house, 0, 0, 0);
      fight.drawStructure(wall("forge", false), 0, 0, 0);
      fight.drawShadow = oldShadow;
      calls.length = 0;
      const chest = { label: "Kit do Rian", x: 100, y: 100, opened: false };
      fight.drawChest(chest, 0, 0, 0);
      const closedChestArt = calls.some((call) => call.src.endsWith("/chest.png"));
      calls.length = 0; chest.opened = true; fight.drawChest(chest, 0, 0, 0);
      const openChestArt = calls.some((call) => call.src.endsWith("/chest.png"));
      calls.length = 0; fight.drawFencePost("stone", 200, 200, 0);
      const castleWall = calls.some((call) => call.src.endsWith("/castle_wall.png"));
      const gate = { ...wall("gate", false), fenceStyle: "stone" };
      calls.length = 0; fight.drawStyledGate(gate, 200, 200);
      const closedCastleGate = calls.map((call) => call.src.split("/").at(-1));
      calls.length = 0; gate.open = true; fight.drawStyledGate(gate, 200, 200);
      const openCastleGate = calls.map((call) => call.src.split("/").at(-1));
      const tower = wall("tower", false); fight.structures = [tower];
      const towerFootprint = fight.blockedByWall(tower.x + 35, tower.y - 80);
      calls.length = 0; fight.drawStructure(tower, 0, 0, 0);
      const castleTower = calls.some((call) => call.src.endsWith("/castle_tower.png"));

      const structureGame = make(); structureGame.skipCutscene(); structureGame.escort.active = false;
      structureGame.tileAt = () => 2; structureGame.nearbyNodes = () => [];
      structureGame.updateSpawns = () => {}; structureGame.updateMonsters = () => {}; structureGame.animals = []; structureGame.allies = []; structureGame.villagers = []; structureGame.structures = [];
      const market = structureGame.worldProps.find((p) => p.sprite === "reference_market");
      structureGame.px = market.x; structureGame.py = market.y + 60;
      const footprint = structureGame.referenceStructureAt(market.x, market.y);
      const placement = structureGame.placeCheck("campfire", market.x, market.y);
      for (let i = 0; i < 25; i++) structureGame.update(0.02, { mx: 0, my: -1 });
      const front = structureGame.py - market.y;
      structureGame.px = market.x; structureGame.py = market.y; structureGame.pvx = 0; structureGame.pvy = 0;
      for (let i = 0; i < 25; i++) structureGame.update(0.02, { mx: 0, my: 1 });
      const escaped = structureGame.py > market.y + 8;
      const camp = structureGame.worldProps.find((p) => p.sprite === "reference_camp");
      const solidCamp = structureGame.referenceStructureAt(camp.x, camp.y - 100);
      const firstRingFree = Array.from({ length: structureGame.fenceSpec(1).slots }, (_, slot) => structureGame.fencePosition(slot, 1)).every((p) => !structureGame.referenceStructureAt(p.x, p.y));
      const attempts = [[-105, -80, 1, 0], [105, -80, -1, 0], [0, -185, 0, 1], [0, 35, 0, -1]];
      const campCollisions = attempts.map(([dx, dy, mx, my]) => {
        structureGame.px = camp.x + dx; structureGame.py = camp.y + dy; structureGame.pvx = 0; structureGame.pvy = 0;
        for (let i = 0; i < 30; i++) structureGame.update(0.02, { mx, my });
        return structureGame.referenceStructureAt(structureGame.px, structureGame.py);
      });
      structureGame.applySettings({ ...structureGame.settings, craftPix: false });
      const disabledFootprint = structureGame.referenceStructureAt(market.x, market.y);
      structureGame.destroy();
      const escort = [];
      if (api.hasReferenceObject("house")) for (const seed of [1, 17, 123]) {
        const guide = new api.Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed, continueSave: false, onUi: () => {} });
        guide.skipCutscene(); guide.updateSpawns = () => {}; guide.updateMonsters = () => {}; guide.animals = [];
        for (let frame = 0; frame < 2100 && guide.escort.active; frame++) {
          const rian = guide.allies.find((a) => a.id === "rian");
          const dx = rian.x - guide.px, dy = rian.y - guide.py, distance = Math.hypot(dx, dy);
          guide.update(1 / 30, { mx: distance > 55 ? dx / distance : 0, my: distance > 55 ? dy / distance : 0 });
        }
        escort.push({ seed, done: !guide.escort.active, nearBase: Math.hypot(guide.px - 104 * 32, guide.py - 88 * 32) < 350 });
        guide.destroy();
      }

      const prop = fight.worldProps.find((p) => p.sprite === "reference_market");
      fight.px = prop.x; fight.py = prop.y + 45; fight.structures = []; fight.chests = []; fight.villagers = [];
      fight.tryInteract();
      const scene = { panel: fight.activePanel, event: events.filter((e) => e.type === "reference").at(-1)?.scene ?? null };
      fight.closePanel(); fight.applySettings({ ...fight.settings, craftPix: false }); fight.tryInteract();
      const disabled = fight.activePanel !== "reference";
      fight.closePanel(); fight.applySettings({ ...fight.settings, craftPix: true });
      // Count actual renderer calls after centering on the recruited ally.
      fight.px = archer.x; fight.py = archer.y; fight.centerCamera(); fight.monsters = []; calls.length = 0; fight.render();
      const renderedArcher = calls.some((call) => call.src.endsWith("/archer.png"));
      fight.destroy();
      ctx.drawImage = original;
      return { status, newPreviews, figureDraws, monsterDraw, monsterScale, worldHouseSize, thumbChanged, disabledNewDraw, drewArcher, objects, icon, newAssets, expansion, bridgePaint, defenseSources, houseSources, disabledDefenseSources, regional, residentSources, paperdollBow, calls: directCalls, frame, recruited, questDoesNotHire, oldCount, oldLevel, upgradedSave, premature, arrow, combat, closed, open, noTunnel, hostileDamage, noTarget, monsterAtBuilding, buildingShots, placedFootprints, shadowCalls, closedChestArt, openChestArt, castleWall, closedCastleGate, openCastleGate, towerFootprint, castleTower, footprint, placement, front, escaped, solidCamp, firstRingFree, campCollisions, disabledFootprint, escort, scene, disabled, renderedArcher };
    });
    const assets = scenario !== "missing", archer = assets && scenario !== "broken-archer", chapel = assets && scenario !== "broken-object";
    const figures = assets && scenario !== "broken-figures", creatures = assets && scenario !== "broken-creatures";
    assert.deepEqual(result.newPreviews, { figure0: figures, figure1: figures && scenario !== "partial-figures", figure3: figures, figure4: false,
      creature: creatures, drawn: creatures, white: creatures, red: creatures, unknown: false, thumb: creatures, cached: true }, `${scenario}: figuras e criaturas opcionais`);
    assert.equal(result.figureDraws, figures ? scenario === "partial-figures" ? 2 : 4 : 0, `${scenario}: visitantes usam as células disponíveis`);
    assert.equal(result.monsterDraw, creatures, `${scenario}: criatura renderizada no mundo`);
    assert.equal(result.monsterScale, creatures ? 0.75 : null, `${scenario}: escala proporcional da criatura`);
    assert.deepEqual(result.worldHouseSize, assets ? [396, 450] : null, `${scenario}: casa ampliada no mundo`);
    assert.equal(result.thumbChanged, creatures, `${scenario}: miniatura do bestiário`);
    assert.equal(result.disabledNewDraw, false, `${scenario}: arte desativada usa fallback`);
    assert.equal(result.status.archer, archer, scenario);
    assert.equal(result.drewArcher, archer, scenario);
    assert.equal(result.objects.chapel, chapel, scenario);
    for (const key of ["sewer", "forge", "house", "chest"]) assert.equal(result.objects[key], assets, `${scenario}: ${key}`);
    assert.deepEqual(result.icon, { wood: assets, bow: assets, unknown: false, thumb: assets, cached: true }, `${scenario}: ícones e fallback`);
    assert.deepEqual(result.newAssets, { plant: assets, menu: assets, bowThumb: assets, castleWall: assets, castleGate: assets, castleGrate: assets, castleTower: assets }, `${scenario}: plantas, menu, arco e castelo`);
    const intactDefenses = assets && scenario !== "broken-effects";
    assert.deepEqual(result.expansion, { house: assets, barrier: intactDefenses, bridge: assets, spikes: intactDefenses, spikeThumb: intactDefenses, lightning: assets, ripple: assets }, `${scenario}: rios, casas e defesas carregam independentemente`);
    assert.deepEqual(result.bridgePaint, { crossing: assets ? 255 : 0, water: 0, afterMutation: 0, remaining: assets ? 255 : 0 }, `${scenario}: pontes recortam apenas tiles reais e invalidam o cache`);
    assert.deepEqual(result.defenseSources, intactDefenses ? ["spikes.png", "barricade_2.png"] : [], `${scenario}: visual das defesas e fallback`);
    assert.deepEqual(result.disabledDefenseSources, [], `${scenario}: referência desligada`);
    assert.equal(result.houseSources.length, assets ? 5 : 0, `${scenario}: casas variadas sem consumir RNG`);
    if (intactDefenses) assert.deepEqual(result.calls.find((call) => call.src.endsWith("/spikes.png")).args.slice(0, 4), [192, 192, 96, 96], "quadro e nível dos espinhos");
    if (assets) assert.deepEqual(result.calls.find((call) => call.src.endsWith("/lightning.png")).args.slice(0, 4), [320, 0, 80, 200], "quadro do relâmpago");
    const intactRegional = assets && scenario !== "broken-resident";
    assert.deepEqual(result.regional, { blue: intactRegional, red: assets, hood: assets, archer, mineral: intactRegional, rock: assets }, `${scenario}: moradores e depósitos com fallback independente`);
    assert.equal(result.residentSources.some((name) => ["mage-red.png", "mage-blue.png", "archer-hood.png", "archer.png"].includes(name)), false, `${scenario}: moradores comuns não usam roupas de especialistas`);
    if (assets) {
      if (intactRegional) {
        assert.deepEqual(result.calls.find((call) => call.src.endsWith("/mage-blue.png")).args.slice(0, 4), [0, 480, 96, 96], "maga caminha para a esquerda");
        assert.deepEqual(result.calls.find((call) => call.src.endsWith("/minerals.png")).args.slice(0, 4), [864, 0, 96, 96], "último minério usa sua própria célula");
      }
    }
    assert.equal(result.paperdollBow, true, `${scenario}: retrato mostra o arco selecionado`);
    if (archer) assert.deepEqual(result.calls.find((call) => call.src.endsWith("/archer.png")).args.slice(0, 4), [384, 864, 96, 96], "ataque para a esquerda, quadro 5");
    if (assets) assert.deepEqual(result.calls.find((call) => call.src.endsWith("/icons.png")).args, [192, 0, 64, 64, 1, 2, 32, 32], "madeira usa o recorte certo da folha");
    assert.deepEqual(result.frame, { idle: { x: 0, y: 0, size: 64 }, left: { x: 0, y: 320, size: 64 }, right: { x: 0, y: 384, size: 64 }, attackUp: { x: 672, y: 1056, size: 96 } });
    assert.equal(result.recruited.filter((x) => x === "archer").length, 0);
    assert.ok(result.recruited.includes("maya"));
    assert.deepEqual([result.questDoesNotHire, result.oldCount, result.oldLevel, result.upgradedSave, result.premature], [true, 1, 2, 1, false]);
    assert.deepEqual(result.arrow, { count: 1, kind: "ally" });
    assert.deepEqual(result.combat, { hp: 100, kills: 1, quest: 1, count: 0 }, "flecha atravessa jogador sem causar fogo amigo e registra o abate");
    assert.deepEqual(result.closed, { hp: 20, arrows: 0 });
    assert.deepEqual(result.open, { hp: 13, arrows: 0 });
    assert.equal(result.noTunnel, true);
    assert.equal(result.hostileDamage, true);
    assert.equal(result.noTarget, true);
    assert.equal(result.monsterAtBuilding.siege, false, `${scenario}: prédio não é alvo de cerco`);
    assert.equal(result.monsterAtBuilding.offset >= 8, assets, `${scenario}: colisão de monstro com prédio: ${JSON.stringify(result.monsterAtBuilding)}`);
    assert.deepEqual(result.buildingShots, assets ? [0, 0, 0] : [1, 1, 1], `${scenario}: projéteis bloqueados`);
    assert.deepEqual(result.placedFootprints, [assets, assets], `${scenario}: dimensões e rotação da casa construída`);
    assert.equal(result.shadowCalls, 0, `${scenario}: sombra indevida sob construções`);
    assert.equal(result.closedChestArt, assets, `${scenario}: baú fechado usa a referência`);
    assert.equal(result.openChestArt, assets, `${scenario}: baú detalhado permanece depois de saqueado`);
    assert.equal(result.castleWall, assets, `${scenario}: muralha usa a peça enviada ou fallback`);
    assert.equal(result.castleTower, assets, `${scenario}: torre usa a peça enviada ou fallback`);
    assert.equal(result.towerFootprint, assets, `${scenario}: torre sólida corresponde à arte`);
    assert.deepEqual(result.closedCastleGate, assets ? ["castle_gate.png", "castle_grate.png"] : [], `${scenario}: grade aparece no portão fechado`);
    assert.deepEqual(result.openCastleGate, assets ? ["castle_gate.png"] : [], `${scenario}: grade some ao abrir`);
    assert.equal(result.firstRingFree, true, `${scenario}: barraca não bloqueia a primeira cerca`);
    assert.equal(result.footprint, assets, `${scenario}: construção sólida apenas com arte`);
    assert.equal(result.disabledFootprint, false, `${scenario}: sem obstáculo invisível ao desligar artes`);
    assert.equal(result.escaped, true, `${scenario}: save antigo dentro da construção consegue sair`);
    assert.equal(result.solidCamp, assets, `${scenario}: interior da barraca tem colisão`);
    if (assets) assert.deepEqual(result.campCollisions, [false, false, false, false], `${scenario}: não atravessa a barraca por nenhum lado`);
    if (assets) {
      assert.match(result.placement, /construção/);
      assert.ok(result.front >= 8, `${scenario}: jogador atravessou a construção: ${result.front}`);
      assert.ok(result.escort.every((trial) => trial.done && trial.nearBase), `${scenario}: rota de Rian bloqueada: ${JSON.stringify(result.escort)}`);
    } else assert.equal(result.placement, "");
    assert.deepEqual(result.scene, assets ? { panel: "reference", event: "market" } : { panel: "build", event: null });
    assert.equal(result.disabled, true);
    assert.equal(result.renderedArcher, archer);
    assert.deepEqual(errors, [], scenario);
    await page.close();
  }
  console.log("OK: referências opcionais, arqueiro, colisões, fogo amigo, missões, migração de saves e interação.");
} finally { await browser.close(); }
