import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundlePath = join(tmpdir(), "ultima-luz-engine-benchmark.js");
await build({ entryPoints: ["src/game/engine.ts"], bundle: true, platform: "browser", format: "iife", globalName: "UltimaLuzBenchmark", outfile: bundlePath, tsconfig: "tsconfig.json" });
const browser = await chromium.launch({
  headless: true,
  // Benchmark only: let headless Chromium run above its virtual refresh rate.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-frame-rate-limit", "--disable-gpu-vsync"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<html><body style="margin:0"><canvas style="width:1280px;height:720px"></canvas></body></html>');
  await page.addScriptTag({ path: bundlePath });
  const result = await page.evaluate(async () => {
    const game = new window.UltimaLuzBenchmark.Engine({ canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Benchmark", seed: 77, continueSave: false, onUi: () => {} });
    game.skipCutscene(); game.escort.active = false;
    game.updateSpawns = () => {};
    const scenes = [
      { name: "floresta", quality: "auto", x: 104 * 32, y: 95 * 32, monsters: 0 },
      { name: "floresta", quality: "leve", x: 104 * 32, y: 95 * 32, monsters: 0 },
      { name: "ruínas", quality: "auto", x: 45 * 32, y: 77 * 32 + 80, monsters: 0 },
      { name: "neve e gelo", quality: "auto", x: 137 * 32 + 100, y: 43 * 32 - 70, monsters: 0 },
      { name: "combate com 24 criaturas", quality: "auto", x: 104 * 32, y: 88 * 32, monsters: 24 },
    ];
    const records = [];
    for (const scene of scenes) {
      game.applySettings({ ...game.settings, quality: scene.quality });
      game.px = scene.x; game.py = scene.y; game.hp = game.maxHp; game.invulnT = 20;
      game.centerCamera(); game.monsters = [];
      const kinds = ["imp", "bat", "slime", "demon", "brute", "spitter"];
      for (let i = 0; i < scene.monsters; i++) {
        const a = i / scene.monsters * Math.PI * 2;
        game.spawnMonster(game.px + Math.cos(a) * 180, game.py + Math.sin(a) * 160, kinds[i % kinds.length]);
      }
      // Yield to the compositor instead of queuing hundreds of frames in one JS task.
      const frameTimes = [], intervals = [];
      let previous = 0, lastFrame = 0;
      for (let i = 0; i < 210; i++) await new Promise((resolve) => requestAnimationFrame((t) => {
        const before = performance.now();
        const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 1 / 120;
        lastFrame = t;
        game.frame(dt);
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
        resolucao: `${game.canvas.width}×${game.canvas.height}`,
      });
    }
    game.state = "gameover"; game.destroy();
    return records;
  });
  console.table(result);
  assert.ok(result.every((r) => Number.isFinite(r.intervaloMedioMs) && r.intervaloMedioMs > 0), "benchmark inválido");
  console.log("Intervalos entre quadros no Chromium headless deste ambiente, com limite virtual desativado. Não garantem FPS em outros aparelhos ou telas.");
} finally { await browser.close(); }
