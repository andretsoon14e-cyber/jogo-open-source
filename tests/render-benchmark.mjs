import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundlePath = join(tmpdir(), "ultima-luz-engine-benchmark.js");
await build({ entryPoints: ["src/game/engine.ts"], bundle: true, platform: "browser", format: "iife", globalName: "UltimaLuzBenchmark", outfile: bundlePath, tsconfig: "tsconfig.json" });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<html><body style="margin:0"><canvas style="width:1280px;height:720px"></canvas></body></html>');
  await page.addScriptTag({ path: bundlePath });
  const result = await page.evaluate(() => {
    const game = new window.UltimaLuzBenchmark.Engine({ canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Benchmark", seed: 77, continueSave: false, onUi: () => {} });
    game.skipCutscene(); game.escort.active = false;
    game.updateSpawns = () => {};
    const scenes = [
      { name: "floresta", x: 104*32, y: 95*32, monsters: 0 },
      { name: "ruínas", x: 45*32, y: 77*32+80, monsters: 0 },
      { name: "neve e gelo", x: 137*32+100, y: 43*32-70, monsters: 0 },
      { name: "combate com 24 criaturas", x: 104*32, y: 88*32, monsters: 24 },
    ];
    const records = [];
    for (const scene of scenes) {
      game.px = scene.x; game.py = scene.y; game.centerCamera(); game.monsters = [];
      const kinds = ["imp","bat","slime","demon","brute","spitter"];
      for(let i=0;i<scene.monsters;i++) {
        const a = i/scene.monsters*Math.PI*2;
        game.spawnMonster(game.px+Math.cos(a)*180, game.py+Math.sin(a)*160,kinds[i%kinds.length]);
      }
      for(let i=0;i<15;i++) game.frame(1/120);
      const frameTimes=[];
      const start = performance.now();
      for(let frame=0;frame<120;frame++) {
        const before=performance.now();
        game.frame(1/120);
        frameTimes.push(performance.now()-before);
      }
      // Flush commands to include software/GPU rendering work in the batch.
      game.ctx.getImageData(0,0,1,1);
      const total = performance.now()-start;
      frameTimes.sort((a,b)=>a-b);
      records.push({ scene: scene.name, averageMs: +(total/120).toFixed(2), p95CpuMs: +frameTimes[Math.floor(frameTimes.length*.95)].toFixed(2), resolution: `${game.canvas.width}×${game.canvas.height}` });
    }
    game.state = "gameover"; game.destroy();
    return records;
  });
  console.table(result);
  assert.ok(result.every((r) => Number.isFinite(r.averageMs)), "benchmark inválido");
  console.log("Medição do renderizador no Chromium headless deste ambiente; não representa FPS garantidos em outros aparelhos.");
} finally { await browser.close(); }
