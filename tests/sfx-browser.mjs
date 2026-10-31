import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bundle = join(tmpdir(), "ultima-luz-audio-test.js");
await build({ entryPoints: ["tests/browser-entry.ts"], bundle: true, platform: "browser", format: "iife", globalName: "AudioTest", outfile: bundle, tsconfig: "tsconfig.json" });
const browser = await chromium.launch({
  headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=user-gesture-required"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<canvas style="width:800px;height:600px"></canvas>');
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => {
    window.game = new window.AudioTest.Engine({
      canvas: document.querySelector("canvas"), mode: "single", difficulty: "dificil", playerName: "Teste",
      seed: 77, continueSave: false, onUi: () => {}, settings: { craftPix: false, sfxVol: 0.7 },
    });
  });
  // A real pointer gesture on the interface must initialize/resume Web Audio.
  await page.mouse.click(50, 50);
  await page.waitForFunction(() => window.game.sfx.ctx?.state === "running");
  const audio = await page.evaluate(async () => {
    const sfx = window.game.sfx, ctx = sfx.ctx;
    const analyser = ctx.createAnalyser(), original = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = original.call(this, destination, ...args);
      if (destination === ctx.destination) original.call(this, analyser);
      return result;
    };
    try {
      const samples = new Float32Array(analyser.fftSize);
      const rms = () => {
        analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const levels = {};
      for (const [name, play, delay] of [
        ["vento", () => sfx.wind(), 220],
        ["animal", () => sfx.animal("goose", 1), 60],
        ["pássaros", () => sfx.bird(), 60],
        ["golpe", () => sfx.hit(), 40],
        ["criatura", () => sfx.monsterDeath("hulk", 1), 60],
        ["água", () => sfx.water(1), 180],
        ["fogo", () => sfx.fire(1), 70],
      ]) {
        await wait(1100); play(); await wait(delay); levels[name] = rms();
      }
      await wait(1100); sfx.vol = 0; sfx.water(1); await wait(180); levels.mudo = rms();
      return levels;
    } finally {
      AudioNode.prototype.connect = original;
      window.game.destroy();
    }
  });
  for (const name of ["vento", "animal", "pássaros", "golpe", "criatura", "água", "fogo"]) assert.ok(audio[name] > 0.00001, `${name} não produziu áudio: ${audio[name]}`);
  assert.ok(audio.mudo < 0.00001, `volume zero não silenciou: ${audio.mudo}`);
  const melody = await page.evaluate(async () => {
    const player = new window.AudioTest.MusicManager(); player.setVoice(false); player.play("day");
    const ctx = player.ctx, analyser = ctx.createAnalyser();
    player.master.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const rms = () => { analyser.getFloatTimeDomainData(samples); return Math.sqrt(samples.reduce((n, value) => n + value * value, 0) / samples.length); };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(400); const day = rms();
    player.play("night"); await wait(400); const night = rms();
    player.setVolume(0); await wait(700); const muted = rms();
    player.stop(); await ctx.close(); return { day, night, muted };
  });
  assert.ok(melody.day > 0.00001 && melody.night > 0.00001, `músicas diurna e noturna devem produzir sinal: ${JSON.stringify(melody)}`);
  assert.ok(melody.muted < 0.00001, `volume da música em zero deve silenciar: ${melody.muted}`);
  assert.deepEqual(errors, []);
  console.log("OK: Web Audio desbloqueado; músicas, pássaros, ambiente e combate produzem sinal e respeitam volume zero.");
} finally { await browser.close(); }
