import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bundle = join(tmpdir(), "ultima-luz-audio-test.js");
await build({ entryPoints: ["tests/browser-entry.ts"], bundle: true, platform: "browser", format: "iife", globalName: "AudioTest", outfile: bundle, tsconfig: "tsconfig.json" });
const root = resolve("public");
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><canvas style="width:800px;height:600px"></canvas><script src="/bundle.js"></script><script>
      window.game = new AudioTest.Engine({ canvas:document.querySelector('canvas'), mode:'single', difficulty:'dificil', playerName:'Teste', seed:77, continueSave:false, onUi:()=>{}, settings:{craftPix:false,sfxVol:0.7} });
      window.player = new AudioTest.MusicManager(); player.setVoice(false); player.play('lobby');
      // Headless Chromium may start with user activation already granted.
      // Suspend explicitly so the gesture-driven resume is tested regardless.
      player.ctx.suspend().then(() => { window.audioStateBeforeGesture = player.ctx.state; });
      window.addEventListener('pointerdown', () => player.resume());
    </script>`);
    return;
  }
  if (path === "/bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(await readFile(bundle)); return; }
  if (!/^\/audio\/(?:[\w-]+\/)?[\w-]+\.mp3$/.test(path)) { res.writeHead(404); res.end(); return; }
  try { const bytes = await readFile(join(root, path)); res.writeHead(200, { "Content-Type": "audio/mpeg" }); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=user-gesture-required"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [], failedAudio = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.url().includes("/audio/") && response.status() >= 400) failedAudio.push(`${response.status()} ${response.url()}`); });
  await page.goto(base);
  await page.waitForFunction(() => window.audioStateBeforeGesture);
  const before = await page.evaluate(() => window.audioStateBeforeGesture);
  assert.equal(before, "suspended", "áudio deve aguardar o primeiro gesto do jogador");
  await page.mouse.click(50, 50);
  await page.waitForFunction(() => window.game.sfx.ctx?.state === "running" && window.game.sfx.samplesReady && window.game.sfx.toolSamplesReady && window.player.active?.track === "lobby", null, { timeout: 30000 });
  const cues = JSON.parse(await readFile("src/game/audio-cues.generated.json", "utf8"));
  const spriteCheck = await page.evaluate((manifest) => {
    const sprite = window.game.sfx.sprite, data = sprite.getChannelData(0), sr = sprite.sampleRate;
    const invalid = [];
    for (const [name, [start, duration]] of Object.entries(manifest)) {
      let peak = 0;
      const from = Math.round(start * sr), end = Math.round((start + duration) * sr), to = Math.min(data.length, end);
      for (let i = from; i < to; i += 11) peak = Math.max(peak, Math.abs(data[i]));
      if (end > data.length || to <= from || peak < 0.003 || peak > 1.05) invalid.push([name, peak]);
    }
    return { duration: sprite.duration, invalid };
  }, cues);
  assert.ok(spriteCheck.duration > 50 && spriteCheck.duration < 60, `duração do sprite inválida ${spriteCheck.duration}`);
  assert.deepEqual(spriteCheck.invalid, [], "todas as fatias reais devem decodificar com sinal");
  const toolCues = JSON.parse(await readFile("src/game/tool-audio-cues.generated.json", "utf8"));
  const toolSprite = await page.evaluate((manifest) => {
    const sprite = window.game.sfx.toolSprite, data = sprite.getChannelData(0), sr = sprite.sampleRate;
    const invalid = [];
    for (const [name, [start, duration]] of Object.entries(manifest)) {
      let peak = 0;
      const from = Math.round(start * sr), end = Math.round((start + duration) * sr), to = Math.min(data.length, end);
      for (let i = from; i < to; i += 5) peak = Math.max(peak, Math.abs(data[i]));
      if (end > data.length || to <= from || peak < 0.003 || peak > 1.05) invalid.push([name, peak]);
    }
    return { duration: sprite.duration, invalid };
  }, toolCues);
  assert.ok(toolSprite.duration > 2 && toolSprite.duration < 6, `banco de ferramentas inválido: ${toolSprite.duration}`);
  assert.deepEqual(toolSprite.invalid, [], "todos os novos sons de ferramenta devem decodificar com sinal");

  // Use actual keyboard events on the same tree: automatic harvesting must
  // not mask the selected tool's sound or emit three identical swishes.
  await page.evaluate(() => {
    const game = window.game, sfx = game.sfx, ctx = sfx.ctx;
    game.skipCutscene(); game.escort.active = false;
    game.px = 1000; game.py = 1000; game.pdir = 0; game.monsters = []; game.animals = [];
    const tree = { type: "tree", x: 1034, y: 1000, hp: 100, maxHp: 100, wob: 0, respawn: 0 };
    game.nearbyNodes = () => [tree];
    window.__toolStarts = [];
    const create = ctx.createBufferSource.bind(ctx);
    window.__restoreCreateSource = () => { ctx.createBufferSource = create; };
    ctx.createBufferSource = () => {
      const src = create(), start = src.start.bind(src);
      src.start = (...args) => { if (src.buffer === sfx.toolSprite) window.__toolStarts.push(args[1]); return start(...args); };
      return src;
    };
  });
  for (const key of ["1", "2", "3"]) {
    await page.keyboard.press(key);
    await page.evaluate(() => { window.game.attackCd = 0; });
    await page.keyboard.press("j");
    await page.waitForTimeout(450);
  }
  const attackOffsets = await page.evaluate(() => { window.__restoreCreateSource(); return window.__toolStarts; });
  const offsetsFor = (prefix) => Object.entries(toolCues).filter(([name]) => name.startsWith(prefix)).map(([, cue]) => cue[0]);
  const swingOffsets = attackOffsets.filter((offset) => ["axeSwing", "pickSwing", "swordSwing"].some((prefix) => offsetsFor(prefix).includes(offset)));
  assert.equal(swingOffsets.length, 3, "cada golpe emite um único balanço");
  for (const [i, prefix] of ["axeSwing", "pickSwing", "swordSwing"].entries()) assert.ok(offsetsFor(prefix).includes(swingOffsets[i]), `${prefix} não foi usado no jogo`);
  assert.equal(attackOffsets.filter((offset) => offsetsFor("axeHit").includes(offset)).length, 3, "os três golpes na árvore preservam o impacto de madeira");

  const sounds = await page.evaluate(async () => {
    const sfx = window.game.sfx, ctx = sfx.ctx, analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; sfx.output.connect(analyser); analyser.connect(ctx.destination);
    const data = new Float32Array(analyser.fftSize);
    const rms = () => { analyser.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((n, v) => n + v * v, 0) / data.length); };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const peakOver = async (ms) => { let max = 0; for (let t = 0; t < ms; t += 35) { await wait(35); max = Math.max(max, rms()); } return max; };
    const result = {};
    for (const [name, play] of [
      ["balanço machado", () => sfx.swing("axe")], ["balanço picareta", () => sfx.swing("pick")], ["balanço espada", () => sfx.swing("sword")],
      ["machado", () => sfx.chop()], ["picareta", () => sfx.mine("rock")], ["metal", () => sfx.mine("ore")],
      ["cristal", () => sfx.mine("crystal")], ["item", () => sfx.pickup("iron")],
      ["passo", () => sfx.footstep("grass", false)], ["criatura", () => sfx.creature("hulk", 1, 0.4)],
      ["morte", () => sfx.monsterDeath("hulk", 1)], ["esqueleto", () => sfx.creature("skeleton", 1)],
      ["ganso", () => sfx.animal("goose", 1)], ["slime", () => sfx.creature("slime", 1)],
      ["cabra", () => { sfx.nextAt.delete("animal"); sfx.animal("goat", 1); }],
      ["pássaro", () => sfx.bird()], ["baú", () => sfx.chest()],
    ]) {
      await wait(1400); play(); result[name] = await peakOver(500);
    }
    for (const [name, play, kind] of [
      ["vento", () => sfx.wind(), "wind"], ["riacho", () => sfx.water(1), "water"],
      ["mar", () => sfx.water(1, "sea"), "sea"], ["fogo", () => sfx.fire(1), "fire"],
    ]) {
      play();
      for (let tries = 0; tries < 200 && !sfx.ambientNodes.has(kind); tries++) await wait(25);
      result[name] = await peakOver(650);
      sfx.silenceAmbience(); await wait(1450);
      if (sfx.ambientNodes.has(kind)) result[`${name}-vazou`] = 1;
    }
    sfx.wind(); await wait(300);
    window.game.state = "playing"; window.game.softPause = true; window.game.ambienceSilenced = false;
    window.game.frame(0); await wait(1400);
    result.pausado = !sfx.ambientNodes.has("wind") && sfx.ambientTargets.get("wind") === 0;
    sfx.wind(); await wait(300); sfx.vol = 0; await wait(500);
    sfx.chop(); result.mudo = await peakOver(200);
    sfx.destroy(); analyser.disconnect();
    return result;
  });
  for (const name of ["balanço machado", "balanço picareta", "balanço espada", "machado", "picareta", "metal", "cristal", "item", "passo", "criatura", "morte", "esqueleto", "slime", "ganso", "cabra", "pássaro", "baú", "vento", "riacho", "mar", "fogo"]) {
    assert.ok(sounds[name] > 0.00001, `${name} não produziu áudio: ${sounds[name]}`);
    assert.ok(!sounds[`${name}-vazou`], `${name} não parou depois de desligar`);
  }
  assert.equal(sounds.pausado, true, "pausar o jogo deve silenciar e encerrar os ambientes");
  assert.ok(sounds.mudo < 0.00001, `volume zero deve silenciar imediatamente: ${sounds.mudo}`);

  const music = await page.evaluate(async () => {
    const player = window.player, ctx = player.ctx, analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; player.master.connect(analyser); analyser.connect(ctx.destination);
    const samples = new Float32Array(analyser.fftSize);
    const rms = () => { analyser.getFloatTimeDomainData(samples); return Math.sqrt(samples.reduce((n, value) => n + value * value, 0) / samples.length); };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const peakOver = async (ms) => { let max = 0; for (let t = 0; t < ms; t += 40) { await wait(40); max = Math.max(max, rms()); } return max; };
    const result = {};
    for (const name of ["lobby", "day", "night", "siege"]) {
      player.play(name);
      for (let tries = 0; tries < 400 && player.active?.track !== name; tries++) await wait(25);
      result[`${name}Active`] = player.active?.track === name;
      await wait(900); result[name] = await peakOver(400);
      result[`${name}Fading`] = !!player.fading;
    }
    player.setVolume(0); await wait(900); result.mudo = await peakOver(100);
    player.setVolume(0.35); await wait(1100); result.retomada = await peakOver(300);
    player.setEnabled(false); await wait(900); result.desligada = await peakOver(100);
    player.setEnabled(true); await wait(1100); result.reativada = await peakOver(300);
    player.stop(); await wait(800); result.parada = await peakOver(100);
    await ctx.close(); analyser.disconnect();
    return result;
  });
  for (const name of ["lobby", "day", "night", "siege"]) {
    assert.equal(music[`${name}Active`], true, `trilha ${name} não carregou`);
    assert.ok(music[name] > 0.00001, `trilha ${name} não produziu sinal: ${music[name]}`);
    assert.equal(music[`${name}Fading`], false, `transição de ${name} não terminou`);
  }
  for (const name of ["mudo", "desligada", "parada"]) assert.ok(music[name] < 0.00001, `música ${name} ainda audível: ${music[name]}`);
  assert.ok(music.retomada > 0.00001 && music.reativada > 0.00001, "música deve voltar após mudar volume ou religar");
  assert.deepEqual(errors, []); assert.deepEqual(failedAudio, []);
  console.log(`OK: gesto real; ${Object.keys(cues).length} efeitos e ${Object.keys(toolCues).length} amostras de ferramentas decodificados; impactos, animais, ambientes e quatro músicas com fade/mudo.`);

  // Opcional: percorre a interface real do Next para testar ida e volta ao menu.
  if (process.env.APP_URL) {
    const app = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const appErrors = [];
    app.on("pageerror", (error) => appErrors.push(error.message));
    await app.addInitScript(() => {
      localStorage.setItem("umbra-settings-v1", JSON.stringify({ voice: false, music: true, musicVol: 0.35, sfxVol: 0.7, craftPix: false }));
      window.__audio = [];
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args);
          const record = { ctx: this, sources: [] }; window.__audio.push(record);
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = create(); record.sources.push(source);
            source.addEventListener("ended", () => { source.__ended = true; });
            return source;
          };
        }
      };
    });
    await app.goto(process.env.APP_URL);
    await app.getByRole("heading", { name: "ILHA DA ÚLTIMA LUZ" }).waitFor();
    await app.waitForFunction(() => window.__audio.length > 0);
    await app.getByRole("button", { name: "Configurações" }).click();
    const settings = app.getByRole("dialog", { name: "Configurações" });
    const musicVolume = settings.getByLabel("Volume da música"), effectsVolume = settings.getByLabel("Volume dos efeitos");
    await app.waitForFunction(() => window.__audio[0].sources.some((source) => source.loop && !source.__ended));
    await musicVolume.focus(); await musicVolume.press("Home");
    await app.waitForFunction(() => JSON.parse(localStorage.getItem("umbra-settings-v1")).musicVol === 0);
    await app.waitForFunction(() => window.__audio[0].sources.filter((source) => source.loop && !source.__ended).length === 0);
    await effectsVolume.focus(); await effectsVolume.press("Home");
    await app.waitForFunction(() => JSON.parse(localStorage.getItem("umbra-settings-v1")).sfxVol === 0);
    for (let i = 0; i < 14; i++) await effectsVolume.press("ArrowRight");
    for (let i = 0; i < 7; i++) await musicVolume.press("ArrowRight");
    await app.waitForFunction(() => JSON.parse(localStorage.getItem("umbra-settings-v1")).musicVol > 0);
    await app.waitForFunction(() => window.__audio[0].sources.some((source) => source.loop && !source.__ended));
    if (process.env.AUDIO_SCREENSHOT_PATH) await app.screenshot({ path: process.env.AUDIO_SCREENSHOT_PATH });
    await settings.getByRole("button", { name: "Pronto" }).click();
    await app.getByRole("button", { name: "Jogar sozinho" }).click();
    await app.waitForFunction(() => window.__audio[0].ctx.state === "running");
    await app.getByRole("button", { name: /Novo jogo/ }).first().click();
    await app.waitForTimeout(2000);
    await app.keyboard.press("Escape"); // pula a introdução
    await app.waitForTimeout(1000);
    await app.keyboard.press("Escape"); // pausa
    await app.getByRole("button", { name: /Menu principal/ }).click();
    await app.waitForTimeout(2000);
    const result = await app.evaluate(() => ({
      requests: performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.includes("/audio/music/")),
      activeLoops: window.__audio[0].sources.filter((source) => source.loop && !source.__ended).length,
      effectContextsOpen: window.__audio.slice(1).filter((record) => record.ctx.state !== "closed").length,
    }));
    assert.ok(result.requests.some((url) => url.includes("lobby.mp3")) && result.requests.some((url) => url.includes("night.mp3")), JSON.stringify(result));
    assert.equal(result.activeLoops, 1, `apenas o tema do lobby deve continuar ao voltar ao menu: ${JSON.stringify(result)}`);
    assert.equal(result.effectContextsOpen, 0, "contexto do jogo deve fechar ao voltar ao menu");
    assert.deepEqual(appErrors, []);
    await app.close();
    console.log("OK: interface real alterna lobby/jogo/menu e fecha os efeitos ao sair.");

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phoneErrors = [];
    phone.on("pageerror", (error) => phoneErrors.push(error.message));
    await phone.addInitScript(() => {
      localStorage.setItem("umbra-settings-v1", JSON.stringify({ voice: false, music: true, controls: "touch", craftPix: false }));
      window.__contexts = [];
      const Native = window.AudioContext;
      window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__contexts.push(this); } };
    });
    await phone.goto(process.env.APP_URL);
    await phone.getByRole("button", { name: "Jogar sozinho" }).tap();
    await phone.waitForFunction(() => window.__contexts[0]?.state === "running");
    await phone.getByRole("button", { name: /Novo jogo/ }).first().tap();
    await phone.locator("canvas").tap({ position: { x: 100, y: 100 } });
    await phone.waitForFunction(() => window.__contexts[1]?.state === "running" && performance.getEntriesByType("resource").some((entry) => entry.name.includes("/audio/effects.mp3")));
    assert.deepEqual(phoneErrors, []);
    await phone.close();
    console.log("OK: gestos de toque ativam música e efeitos na interface móvel.");
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
