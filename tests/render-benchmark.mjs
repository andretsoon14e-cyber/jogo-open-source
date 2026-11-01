import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundlePath = join(tmpdir(), "ultima-luz-engine-benchmark.js");
const withCraftPix = process.env.BENCH_CRAFTPIX === "1";
const withReferences = process.env.BENCH_REFERENCIAS === "1";
const withArt = withCraftPix || withReferences;
await build({ entryPoints: [withArt ? "tests/browser-entry.ts" : "src/game/engine.ts"], bundle: true, platform: "browser", format: "iife", globalName: "UltimaLuzBenchmark", outfile: bundlePath, tsconfig: "tsconfig.json" });
const browser = await chromium.launch({
  headless: true,
  // Benchmark only: let headless Chromium run above its virtual refresh rate.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-frame-rate-limit", "--disable-gpu-vsync"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const shell = '<html><body style="margin:0"><canvas style="width:1280px;height:720px"></canvas></body></html>';
  if (withArt) {
    const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000").origin;
    await page.route(`${origin}/__benchmark`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }));
    await page.goto(`${origin}/__benchmark`);
  } else await page.setContent(shell);
  await page.addScriptTag({ path: bundlePath });
  const result = await page.evaluate(async ({ useCraftPix, useReferences }) => {
    const useArt = useCraftPix || useReferences;
    if (useCraftPix) {
      const status = await window.UltimaLuzBenchmark.loadCraftPix();
      if (!status.hero || !status.orcs || !status.plants) throw new Error("Pacotes CraftPix não encontrados; importe-os e inicie o servidor antes do benchmark.");
    }
    if (useReferences) {
      await window.UltimaLuzBenchmark.loadReferenceArt();
      if (!window.UltimaLuzBenchmark.hasReferenceArcher() || !window.UltimaLuzBenchmark.hasReferenceScene("market")) throw new Error("Referências não encontradas; importe-as e inicie o servidor antes do benchmark.");
    }
    const game = new window.UltimaLuzBenchmark.Engine({ canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Benchmark", seed: 77, continueSave: false, onUi: () => {}, settings: { craftPix: useArt } });
    game.skipCutscene(); game.escort.active = false;
    game.updateSpawns = () => {};
    const scenes = [
      { name: "floresta", quality: "auto", x: 104 * 32, y: 95 * 32, monsters: 0 },
      { name: "floresta", quality: "leve", x: 104 * 32, y: 95 * 32, monsters: 0 },
      { name: "ruínas", quality: "auto", x: 45 * 32, y: 77 * 32 + 80, monsters: 0 },
      { name: "neve e gelo", quality: "auto", x: 137 * 32 + 100, y: 43 * 32 - 70, monsters: 0 },
      { name: "riacho e correnteza", quality: "auto", x: 38 * 32, y: 84 * 32, monsters: 0 },
      { name: "campos de cristal", quality: "auto", x: 76 * 32, y: 40 * 32 + 90, monsters: 0 },
      { name: "combate com 24 criaturas", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24 },
      { name: "32 defesas e 24 criaturas", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24, defenses: 32 },
      { name: "base com 8 fogueiras e 24 criaturas", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24, fires: 8 },
      { name: "cerco com 63 trechos e 24 criaturas", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24, walls: 63 },
      { name: "reino com quatro perímetros e 24 criaturas", quality: "leve", x: 104 * 32, y: 88 * 32 - 500, monsters: 24, kingdom: true },
      ...(useCraftPix ? [{ name: "combate com 24 orcs", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24, orcs: true }] : []),
      ...(useReferences ? [{ name: "vilarejo com arqueiro e referências", quality: "auto", x: 58 * 32 + 145, y: 122 * 32 - 60, monsters: 0, archer: true }] : []),
    ];
    const initialAllies = game.allies.slice();
    const records = [];
    for (const scene of scenes) {
      game.applySettings({ ...game.settings, quality: scene.quality });
      game.px = scene.x; game.py = scene.y; game.hp = game.maxHp; game.invulnT = 20; game.time = 280;
      game.territoryLevel = scene.kingdom ? 4 : 1; game.fenceRing = 1;
      // The 63-piece scenario intentionally measures a preserved legacy ring.
      game.legacyTerritory = scene.walls === 63;
      game.centerCamera(); game.monsters = []; game.structures = []; game.particles = []; game.floaters = [];
      game.allies = initialAllies.slice();
      if (scene.archer) { game.specialists.archer.rescued = true; game.hireSpecialist("archer"); const ally = game.allies.at(-1); ally.x = game.px - 60; ally.y = game.py + 30; }
      for (let i = 0; i < (scene.fires ?? 0); i++) {
        const a = i / scene.fires * Math.PI * 2;
        game.structures.push({ type: "campfire", x: game.px + Math.cos(a) * 110, y: game.py + Math.sin(a) * 110, hp: 100, maxHp: 100, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
      }
      for (let i = 0; i < (scene.defenses ?? 0); i++) {
        const a = i / scene.defenses * Math.PI * 2;
        game.structures.push({ type: i % 2 ? "barricade" : "spike_trap", tier: i % 4 + 1, x: game.px + Math.cos(a) * 240, y: game.py + Math.sin(a) * 240, hp: 1000, maxHp: 1000, prodT: 0, open: false, rotation: 0, fenceStyle: "palisade" });
      }
      for (let i = 0; i < (scene.walls ?? 0); i++) {
        const p = game.fencePosition(i), a = i / 63 * Math.PI * 2;
        game.structures.push({ type: "wall", x: p.x, y: p.y, hp: 1000, maxHp: 1000, prodT: 0, open: false, rotation: a + Math.PI / 2, fenceStyle: "palisade" });
      }
      if (scene.kingdom) for (let ring = 1; ring <= 4; ring++) {
        const { slots } = game.fenceSpec(ring);
        for (let i = 0; i < slots; i++) {
          const p = game.fencePosition(i, ring), a = i / slots * Math.PI * 2;
          game.structures.push({ type: i === 0 ? "gate" : "wall", x: p.x, y: p.y, hp: 1000, maxHp: 1000, prodT: 0, open: false, rotation: a + Math.PI / 2, fenceStyle: "stone" });
        }
      }
      const kinds = scene.orcs ? ["orc"] : ["imp", "bat", "slime", "demon", "brute", "spitter"];
      for (let i = 0; i < scene.monsters; i++) {
        const a = i / scene.monsters * Math.PI * 2;
        game.spawnMonster(game.px + Math.cos(a) * 180, game.py + Math.sin(a) * 160, kinds[i % kinds.length]);
      }
      // Yield to the compositor instead of queuing hundreds of frames in one JS task.
      const frameTimes = [], intervals = [];
      let previous = 0, lastFrame = 0, peakParticles = 0;
      for (let i = 0; i < 210; i++) await new Promise((resolve) => requestAnimationFrame((t) => {
        const before = performance.now();
        const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 1 / 120;
        lastFrame = t;
        game.frame(dt);
        peakParticles = Math.max(peakParticles, game.particles.length);
        if (i >= 30) {
          frameTimes.push(performance.now() - before);
          if (previous) intervals.push(t - previous);
          previous = t;
        }
        resolve();
      }));
      const avg = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
      intervals.sort((a, b) => a - b); frameTimes.sort((a, b) => a - b);
      records.push({
        cena: scene.name, qualidade: scene.quality,
        intervaloMedioMs: +avg.toFixed(2), intervaloP95Ms: +intervals[Math.floor(intervals.length * 0.95)].toFixed(2),
        cpuP95Ms: +frameTimes[Math.floor(frameTimes.length * 0.95)].toFixed(2),
        picoParticulas: peakParticles,
        resolucao: `${game.canvas.width}×${game.canvas.height}`,
      });
    }
    game.state = "gameover"; game.destroy();
    return records;
  }, { useCraftPix: withCraftPix, useReferences: withReferences });
  console.table(result);
  assert.ok(result.every((r) => Number.isFinite(r.intervaloMedioMs) && r.intervaloMedioMs > 0), "benchmark inválido");
  console.log(`Intervalos entre quadros no Chromium headless deste ambiente (${withArt ? "artes importadas" : "arte procedural"}), com limite virtual desativado. Não garantem FPS em outros aparelhos ou telas.`);
} finally { await browser.close(); }
