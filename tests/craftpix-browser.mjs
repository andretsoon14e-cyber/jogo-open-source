import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundle = join(tmpdir(), "ultima-luz-craftpix-test.js");
await build({ entryPoints: ["tests/browser-entry.ts"], bundle: true, platform: "browser", format: "iife", globalName: "CraftPixTest", outfile: bundle, tsconfig: "tsconfig.json" });

// Synthetic shapes exercise the loader without distributing third-party art.
async function syntheticImage(width, height, blocks) {
  const rects = blocks.map(([x, y, w, h, color]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`)).png().toBuffer();
}
const fixtures = {};
for (let tier = 1; tier <= 3; tier++) {
  const blocks = [];
  for (let a = 0; a < 4; a++) for (let row = 0; row < 4; row++) for (let frame = 0; frame < 12; frame++) {
    const color = `rgb(${40 + tier * 40},${40 + row * 40},${40 + a * 40})`;
    blocks.push([frame * 32 + 8, (a * 4 + row) * 32 + 8, 16, 20, color]);
  }
  for (let a = 0; a < 3; a++) for (let row = 0; row < 4; row++) for (let frame = 0; frame < 12; frame++) {
    blocks.push([frame * 32 + 8, 512 + (a * 4 + row) * 32 + 8, 16, 20, "#ef40c0"]);
  }
  for (let row = 0; row < 4; row++) for (let frame = 0; frame < 8; frame++) {
    blocks.push([frame * 48 + 4, 896 + row * 48 + 4, 40, 40, "#40efef"]);
  }
  fixtures[`hero-${tier}.png`] = await syntheticImage(384, 1088, blocks);
  const enemies = [];
  for (let a = 0; a < 3; a++) for (let row = 0; row < 4; row++) for (let frame = 0; frame < 8; frame++) {
    enemies.push([frame * 64 + 12, (a * 4 + row) * 64 + 10, 38, 34, `rgb(${tier * 60},${60 + row * 35},${70 + a * 50})`]);
  }
  fixtures[`orc-${tier}.png`] = await syntheticImage(512, 768, enemies);
}
fixtures["world.png"] = await syntheticImage(256, 70, [
  [10, 5, 40, 60, "#348248"], [70, 5, 48, 53, "#a0c541"], [135, 5, 49, 64, "#418b89"],
  [196, 2, 23, 19, "#a5dd55"], [228, 3, 23, 26, "#e3a347"],
]);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  for (const scenario of ["missing", "complete", "broken-hero"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://craftpix.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: '<canvas style="width:1280px;height:720px"></canvas>' });
      if (pathname === "/craftpix/manifest.json") {
        if (scenario === "missing") return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, hero: true, orcs: true, plants: true }) });
      }
      const name = pathname.split("/").at(-1);
      if (scenario === "broken-hero" && name === "hero-2.png") return route.fulfill({ status: 200, contentType: "image/png", body: fixtures["world.png"] });
      if (fixtures[name]) return route.fulfill({ status: 200, contentType: "image/png", body: fixtures[name] });
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://craftpix.test/");
    await page.addScriptTag({ path: bundle });
    const result = await page.evaluate(async () => {
      const api = window.CraftPixTest;
      const status = await api.loadCraftPix();
      const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      const avatar = (craftPix) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        api.drawCharacter(ctx, "player", 100, 100, Math.PI, true, 1, { craftPix, heroLevel: 2, carryTool: "axe" });
        return canvas.toDataURL();
      };
      const importedAvatar = avatar(true), fallbackAvatar = avatar(false);
      const heroDraws = [];
      const originalDrawImage = ctx.drawImage.bind(ctx);
      ctx.drawImage = (...args) => {
        if (args[0] instanceof HTMLImageElement && args[0].src.includes("/hero-")) heroDraws.push(args.slice(1));
        originalDrawImage(...args);
      };
      for (const [angle, options] of [
        [Math.PI / 2, { carryTool: "sword", toolLevel: 2 }],
        [Math.PI / 2, { carryTool: "sword", toolLevel: 2, action: "attack", attackProgress: 0.5 }],
        [Math.PI, { carryTool: "sword", toolLevel: 2, action: "attack", attackProgress: 0.5 }],
        [0, { carryTool: "sword", toolLevel: 4, action: "attack", attackProgress: 0.5 }],
      ]) api.drawCharacter(ctx, "player", 100, 100, angle, false, 0, { craftPix: true, heroLevel: 2, ...options });
      ctx.drawImage = originalDrawImage;
      const drewPlant = api.drawCraftPlant(ctx, "tree", 100, 180, 0, false, 1);
      const plantDraws = [];
      if (status.plants) {
        const original = ctx.drawImage.bind(ctx);
        ctx.drawImage = (...args) => { plantDraws.push(args); original(...args); };
        api.drawCraftPlant(ctx, "tree", 200, 300, 0, false, 1);
        api.drawCraftPlant(ctx, "tree", 200, 300, 0.024, false, 1);
        api.drawCraftPlant(ctx, "tree", 200, 300, 0.024, false, 1);
        ctx.drawImage = original;
      }
      const game = new api.Engine({ canvas, mode: "single", difficulty: "dificil", playerName: "Teste", seed: 77, continueSave: false, onUi: () => {} });
      game.skipCutscene(); game.escort.active = false; game.updateSpawns = () => {};
      const attackArcs = (tool, level, craftPix) => {
        game.applySettings({ ...game.settings, craftPix });
        game.swingTool = tool; game.tools[tool] = level; game.attackT = 0.11;
        let arcs = 0;
        const original = ctx.arc.bind(ctx);
        ctx.arc = (...args) => { arcs++; original(...args); };
        game.drawPlayer(0, 0, 0);
        ctx.arc = original;
        return arcs;
      };
      const attackOverlays = {
        importedSword: attackArcs("sword", 2, true),
        advancedSword: attackArcs("sword", 4, true),
        axe: attackArcs("axe", 2, true),
        proceduralSword: attackArcs("sword", 2, false),
      };
      game.attackT = 0; game.tools.sword = 1; game.tools.axe = 1;
      game.applySettings({ ...game.settings, craftPix: true });
      const random = Math.random;
      Math.random = () => 0.8;
      const spawningWithArt = game.monsterTypeForZone(game.px, game.py);
      game.applySettings({ ...game.settings, craftPix: false });
      const spawningWithoutArt = game.monsterTypeForZone(game.px, game.py);
      game.applySettings({ ...game.settings, craftPix: true });
      Math.random = random;
      game.spawnMonster(game.px + 25, game.py, "orc");
      const orc = game.monsters.at(-1);
      for (const direction of [0, Math.PI, -Math.PI / 2, Math.PI / 2, Math.atan2(-1, -1)]) {
        orc.dir = direction; orc.state = "attack"; orc.t = 0.08; orc.flash = 0.1;
        game.drawMonster(orc, -game.camX, -game.camY, 2);
      }
      orc.state = "windup"; orc.t = 0.001; game.invulnT = 0;
      const health = game.hp;
      game.updateMonsters(0.01); game.updateMonsters(0.01);
      const damageApplied = game.hp < health;
      game.killMonster(orc);
      const kills = game.creatureKills.orc;
      game.applySettings({ ...game.settings, craftPix: false });
      game.drawMonster(orc, -game.camX, -game.camY, 2);
      game.frame(1 / 120);
      const plantCache = status.plants ? {
        repeat: plantDraws[1][0] === plantDraws[2][0],
        sameHeight: plantDraws[0][2] === plantDraws[1][2],
        sameAnchor: plantDraws[0][1] - plantDraws[1][1] === (plantDraws[1][0].width - plantDraws[0][0].width) / 2,
      } : null;
      game.destroy();
      return { status, avatarChanged: importedAvatar !== fallbackAvatar, heroDraws, attackOverlays, drewPlant, kills, plantCache, spawningWithArt, spawningWithoutArt, damageApplied };
    });
    const expected = scenario === "missing" ? { hero: false, orcs: false, plants: false }
      : scenario === "broken-hero" ? { hero: false, orcs: true, plants: true }
        : { hero: true, orcs: true, plants: true };
    assert.deepEqual(result.status, expected, scenario);
    assert.equal(result.avatarChanged, expected.hero, `${scenario}: fallback do personagem`);
    if (expected.hero) {
      assert.equal(result.heroDraws.length, 4);
      assert.deepEqual(result.heroDraws[0].slice(1, 4), [512, 32, 32], "espada original na animação parada");
      assert.deepEqual(result.heroDraws[1], [192, 896, 48, 48, -72, -108, 144, 144], "ataque com espada original completo e ancorado");
      assert.deepEqual(result.heroDraws[2].slice(0, 4), [192, 944, 48, 48], "ataque à esquerda usa a direção correta");
      assert.deepEqual(result.heroDraws[3].slice(0, 4), [128, 448, 32, 32], "níveis avançados preservam a espada existente");
    } else assert.deepEqual(result.heroDraws, []);
    assert.deepEqual(result.attackOverlays, {
      importedSword: expected.hero ? 0 : 1, advancedSword: 1, axe: 1, proceduralSword: 1,
    }, `${scenario}: evitar ataque duplicado e preservar ferramentas`);
    assert.equal(result.drewPlant, expected.plants, `${scenario}: fallback das plantas`);
    assert.equal(result.kills, 1, `${scenario}: registro e abate do orc`);
    assert.equal(result.damageApplied, true, `${scenario}: o ataque do orc deve causar dano`);
    assert.equal(result.spawningWithArt === "orc", expected.orcs, `${scenario}: surgimento com arte`);
    assert.notEqual(result.spawningWithoutArt, "orc", `${scenario}: tabela de surgimento original sem arte`);
    if (expected.plants) assert.deepEqual(result.plantCache, { repeat: true, sameHeight: true, sameAnchor: true });
    assert.deepEqual(errors, [], scenario);
    await page.close();
  }

  // The transparent HUD cache is composited only in two bands. Verify that
  // none of its actual pixels fall in the skipped area at representative sizes.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("http://craftpix.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: '<canvas style="width:1280px;height:720px"></canvas>' }));
  await page.goto("http://craftpix.test/"); await page.addScriptTag({ path: bundle });
  const hud = await page.evaluate(() => {
    const game = new window.CraftPixTest.Engine({ canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Teste", seed: 7, continueSave: false, onUi: () => {}, settings: { craftPix: false } });
    game.skipCutscene(); game.interactHint = "E: Salvar na fogueira";
    game.structures = [{ type: "gate", x: 3328, y: 2816, hp: 100, maxHp: 100, open: false, rotation: 0, fenceStyle: "palisade", prodT: 0 }];
    game.spawnMonster(3330, 2816, "orc");
    const results = [];
    for (const [width, height] of [[320, 240], [390, 844], [699, 500], [700, 500], [1280, 720], [1920, 1080]]) {
      game.viewW = width; game.viewH = height;
      const layer = document.createElement("canvas"); layer.width = width; layer.height = height;
      game.ctx = layer.getContext("2d"); game.renderHud();
      const pixels = game.ctx.getImageData(0, 0, width, height).data;
      const top = Math.min(104, height), bottom = Math.max(top, height - (width < 700 ? 142 : 190));
      let escaped = 0;
      for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3]) escaped++;
      results.push({ width, height, escaped });
    }
    game.destroy(); return results;
  });
  assert.ok(hud.every(({ escaped }) => escaped === 0), `partes do HUD fora das faixas: ${JSON.stringify(hud)}`);
  const terrainPreview = await page.evaluate(() => {
    const tiles = new Uint8Array(64 * 16).fill(2); // Four grass chunks; only two bake per frame.
    const terrain = new window.CraftPixTest.Terrain(tiles, 64, 16, 32);
    const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 512;
    const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    terrain.draw(ctx, 0, 0, 2048, 512, 0, 0, 0);
    const grass = [...ctx.getImageData(1200, 100, 1, 1).data];
    tiles.fill(1); terrain.invalidateAll();
    terrain.draw(ctx, 0, 0, 2048, 512, 0, 0, 1);
    const sand = [...ctx.getImageData(1200, 100, 1, 1).data];
    return { grass, sand };
  });
  assert.deepEqual(terrainPreview, { grass: [134, 173, 79, 255], sand: [227, 209, 145, 255] }, "prévia dos trechos não deve virar oceano");
  const fences = await page.evaluate(() => {
    const engine = new window.CraftPixTest.Engine({ canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Teste", seed: 7, continueSave: false, onUi: () => {}, settings: { craftPix: false } });
    const styles = ["palisade", "rustic", "stone", "hedge", "mixed"];
    const results = [];
    for (const style of styles) {
      engine.structures = [];
      for (let i = 0; i < 63; i++) {
        const p = engine.fencePosition(i);
        engine.structures.push({ type: i === 3 ? "gate" : "wall", x: p.x, y: p.y, hp: 100, maxHp: 100, prodT: 0, open: i === 3, rotation: i / 63 * Math.PI * 2 + Math.PI / 2, fenceStyle: style === "mixed" ? styles[i % 4] : style });
      }
      const render = (cached) => {
        const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
        engine.ctx = canvas.getContext("2d"); engine.ctx.fillStyle = "#395d2b"; engine.ctx.fillRect(0, 0, 1280, 720);
        engine.dpr = cached ? 1 : 0.999; // Keep the context at 1x to compare identical geometry.
        const ox = -(3328 - 640), oy = -(2816 - 360);
        engine.drawFenceConnections(ox, oy);
        for (const part of engine.structures) engine.drawStructure(part, ox, oy, 0);
        return engine.ctx.getImageData(0, 0, 1280, 720).data;
      };
      engine.fenceLinks.clear(); engine.fencePosts.clear();
      const direct = render(false), baked = render(true);
      let changed = 0, max = 0, total = 0;
      for (let i = 0; i < direct.length; i += 4) {
        const diff = Math.max(Math.abs(direct[i] - baked[i]), Math.abs(direct[i + 1] - baked[i + 1]), Math.abs(direct[i + 2] - baked[i + 2]));
        if (diff) { changed++; max = Math.max(max, diff); total += diff; }
      }
      const before = engine.fenceLinks.size;
      render(true); const reused = engine.fenceLinks.size === before;
      engine.structures[3].open = false; render(true);
      const gateUpdated = engine.fenceLinks.size === before + 2;
      engine.structures.splice(8, 1); // A removed segment must not leave rails behind.
      const removedDirect = render(false), removedBaked = render(true);
      let removedDiff = 0;
      for (let i = 0; i < removedDirect.length; i += 4) {
        const diff = Math.max(Math.abs(removedDirect[i] - removedBaked[i]), Math.abs(removedDirect[i + 1] - removedBaked[i + 1]), Math.abs(removedDirect[i + 2] - removedBaked[i + 2]));
        if (diff) removedDiff++;
      }
      results.push({ style, changed, max, mean: total / (changed || 1), reused, gateUpdated, removedDiff, links: before });
    }
    engine.destroy(); return results;
  });
  for (const result of fences) {
    assert.ok(result.changed < 6000 && result.max <= 32 && result.mean < 2, `visual da cerca alterado: ${JSON.stringify(result)}`);
    assert.ok(result.reused && result.gateUpdated && result.links > 0 && result.removedDiff < 6000, `cache da cerca inválido: ${JSON.stringify(result)}`);
  }
  await page.close();
  console.log("OK: carregamento opcional, fallback, combate, árvores, cercas, terreno e HUD em 6 tamanhos.");
} finally { await browser.close(); }
