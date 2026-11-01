import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import sfxModule from "../src/game/sfx.ts";
import musicModule from "../src/game/music.ts";

const { Sfx, AUDIO_GROUPS, TOOL_AUDIO_GROUPS } = sfxModule;
const { MusicManager } = musicModule;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const param = () => ({
  value: 0, events: [],
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); },
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push(["target", value, time, constant]); },
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(["exp", value, time]); },
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["linear", value, time]); },
  cancelScheduledValues(time) { this.events.push(["cancel", time]); },
});
class FakeAudioContext {
  currentTime = 0;
  state = "running";
  sampleRate = 32000;
  destination = {};
  sources = [];
  gains = [];
  panners = [];
  createGain() {
    const gain = { gain: param(), connect(node) { this.connected = node; return node; }, disconnect() { this.disconnected = true; } };
    this.gains.push(gain); return gain;
  }
  createStereoPanner() {
    const pan = { pan: param(), connect(node) { this.connected = node; return node; }, disconnect() {} };
    this.panners.push(pan); return pan;
  }
  createBufferSource() {
    const source = { buffer: null, loop: false, playbackRate: param(),
      connect(node) { this.connected = node; return node; }, disconnect() { this.disconnected = true; },
      start(...args) { this.started = args; }, stop(...args) { this.stopped = args; } };
    this.sources.push(source); return source;
  }
  createOscillator() { return { frequency: param(), connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  decodeAudioData() { return Promise.resolve({ duration: 80 }); }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
}

function audioEnvironment(t, request = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.fetch = request;
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
}
async function makeSfx() {
  const sfx = new Sfx(); sfx.ensure();
  await tick(); await tick();
  assert.equal(sfx.samplesReady, true);
  assert.equal(sfx.toolSamplesReady, true);
  return sfx;
}

const cues = JSON.parse(readFileSync("src/game/audio-cues.generated.json", "utf8"));
const toolCues = JSON.parse(readFileSync("src/game/tool-audio-cues.generated.json", "utf8"));
test("banco de áudio tem todas as fatias usadas, não sobrepostas, e arquivos locais", () => {
  const used = new Set(Object.values(AUDIO_GROUPS).flat());
  assert.deepEqual([...used].sort(), Object.keys(cues).sort(), "todas as amostras são usadas e nenhuma está ausente");
  const sorted = Object.entries(cues).sort((a, b) => a[1][0] - b[1][0]);
  let end = 0;
  for (const [key, [start, duration]] of sorted) {
    assert.ok(Number.isFinite(start) && Number.isFinite(duration) && duration > 0, key);
    assert.ok(start >= end - 0.00001, `${key} sobrepõe a anterior`);
    end = start + duration;
  }
  assert.ok(end < 60, "sprite curto para decodificar sem pesar");
  const toolUsed = new Set(Object.values(TOOL_AUDIO_GROUPS).flat());
  assert.deepEqual([...toolUsed].sort(), Object.keys(toolCues).sort(), "todos os sons de ferramenta existem e são usados");
  end = 0;
  for (const [key, [start, duration]] of Object.entries(toolCues).sort((a, b) => a[1][0] - b[1][0])) {
    assert.ok(Number.isFinite(start) && Number.isFinite(duration) && duration > 0, key);
    assert.ok(start >= end - 0.00001, `${key} sobrepõe a anterior`);
    end = start + duration;
  }
  assert.ok(end < 6, "banco adicional de ferramentas continua pequeno");
  for (const file of ["effects", "tool-effects", "ambient/wind", "ambient/water", "ambient/sea", "ambient/fire", "music/lobby", "music/day", "music/night", "music/siege"]) {
    assert.ok(existsSync(`public/audio/${file}.mp3`), `ausente: ${file}`);
  }
});

test("sons amostrados de criaturas têm distância, estéreo, variação e limites", async (t) => {
  audioEnvironment(t);
  const sfx = await makeSfx(), ctx = sfx.ctx;
  sfx.creature("hulk", 1, 0.7);
  assert.equal(ctx.sources.length, 1);
  assert.ok(ctx.panners[0].pan.value > 0, "criatura à direita é posicionada à direita");
  const deep = ctx.sources[0].started[1];
  assert.ok(AUDIO_GROUPS.deep.some((name) => cues[name][0] === deep));
  assert.ok(ctx.sources[0].playbackRate.value < 0.9, "criatura grande é mais grave");
  sfx.creature("bat", 1); assert.equal(ctx.sources.length, 1, "hordas compartilham intervalo");
  ctx.currentTime = 3;
  sfx.creature("bat", 0.8, -1);
  assert.equal(ctx.sources.length, 2);
  assert.ok(AUDIO_GROUPS.small.some((name) => cues[name][0] === ctx.sources[1].started[1]));
  assert.ok(ctx.panners.at(-1).pan.value < 0);
  sfx.monsterDeath("hulk", 0); assert.equal(ctx.sources.length, 2);
  sfx.monsterDeath("hulk", 0.8); assert.equal(ctx.sources.length, 3);
  ctx.currentTime += 3; sfx.creature("skeleton", 1);
  assert.ok(AUDIO_GROUPS.bones.some((name) => cues[name][0] === ctx.sources.at(-1).started[1]), "esqueleto tem ossos");
  ctx.currentTime += 3; sfx.creature("slime", 1);
  assert.ok(AUDIO_GROUPS.slime.some((name) => cues[name][0] === ctx.sources.at(-1).started[1]), "slime usa som viscoso");
  const count = ctx.sources.length;
  sfx.vol = 0; ctx.currentTime = 20;
  sfx.creature("orc", 1); sfx.hit(); assert.equal(ctx.sources.length, count, "mudo não cria vozes");
  sfx.vol = 0.4; ctx.state = "suspended"; sfx.creature("orc", 1); sfx.hit();
  assert.equal(ctx.sources.length, count, "suspenso não acumula vozes");
  ctx.state = "interrupted"; sfx.ensure(); assert.equal(ctx.state, "running", "interrupções de áudio podem ser retomadas");
  sfx.destroy(); assert.equal(ctx.state, "closed"); assert.equal(sfx.ctx, null);
});

test("machado, picareta e espada usam balanços próprios; impactos variam por material", async (t) => {
  audioEnvironment(t);
  const sfx = await makeSfx(), ctx = sfx.ctx;
  for (const tool of ["axe", "pick", "sword"]) { sfx.swing(tool); ctx.currentTime += 1; }
  for (const [i, group] of ["axeSwing", "pickSwing", "swordSwing"].entries()) {
    assert.equal(ctx.sources[i].buffer, sfx.toolSprite, "cada ferramenta usa o banco novo");
    assert.ok(TOOL_AUDIO_GROUPS[group].some((name) => toolCues[name][0] === ctx.sources[i].started[1]), group);
  }
  assert.equal(new Set(ctx.sources.slice(0, 3).map((src) => src.started[1])).size, 3, "três movimentos têm amostras diferentes");
  const base = ctx.sources.length;
  for (const material of ["rock", "ore", "crystal"]) { sfx.mine(material); ctx.currentTime += 1; }
  for (const [i, group] of ["pickStone", "pickMetal", "pickCrystal"].entries()) {
    assert.ok(TOOL_AUDIO_GROUPS[group].some((name) => toolCues[name][0] === ctx.sources[base + i].started[1]), group);
  }
  ctx.currentTime += 1; sfx.chop(); const first = ctx.sources.at(-1).started[1];
  assert.equal(ctx.sources.at(-1).started[0], ctx.currentTime + 0.06, "impacto começa depois do balanço");
  ctx.currentTime += 1; sfx.chop(); const second = ctx.sources.at(-1).started[1];
  assert.ok(TOOL_AUDIO_GROUPS.axeHit.some((name) => toolCues[name][0] === first));
  assert.notEqual(first, second, "a mesma amostra de machado não repete imediatamente");
  for (let i = 0; i < 100; i++) { ctx.currentTime += 1; sfx.hit(); }
  assert.ok(ctx.sources.length <= 16, "máximo global de fontes simultâneas");
  sfx.destroy();
});

test("falha ou atraso do banco de ferramentas mantém fallback e não toca depois de destruir", async (t) => {
  let releaseTool;
  audioEnvironment(t, (url) => url.endsWith("tool-effects.mp3")
    ? new Promise((resolve) => { releaseTool = resolve; })
    : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const sfx = new Sfx(); sfx.ensure(); await tick(); await tick();
  assert.equal(sfx.samplesReady, true); assert.equal(sfx.toolSamplesReady, false);
  sfx.swing("axe"); sfx.ctx.currentTime += 1; sfx.chop(); sfx.ctx.currentTime += 1; sfx.mine("rock");
  assert.equal(sfx.ctx.sources.length, 3, "efeitos anteriores continuam disponíveis enquanto carrega");
  assert.ok(sfx.ctx.sources.every((src) => src.buffer === sfx.sprite));
  sfx.destroy();
  releaseTool({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await tick(); await tick(); assert.equal(sfx.toolSamplesReady, false, "resultado tardio não ressuscita o banco");
});

test("ambientes carregam uma vez, obedecem distância e desligam sem vazar loops", async (t) => {
  const requests = [];
  audioEnvironment(t, async (url) => { requests.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; });
  const sfx = await makeSfx(), ctx = sfx.ctx;
  sfx.water(0, "sea"); assert.equal(requests.filter((v) => v.includes("/ambient/")).length, 0);
  sfx.wind(); sfx.wind();
  await tick(); await tick();
  assert.equal(requests.filter((v) => v.endsWith("/wind.mp3")).length, 1);
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].loop, true);
  for (let i = 0; i < 100; i++) sfx.wind();
  assert.equal(ctx.sources.length, 1, "não cria loop por quadro");
  sfx.setAmbient("wind", 0);
  await new Promise((resolve) => setTimeout(resolve, 1250));
  assert.ok(ctx.sources[0].stopped, "ao desligar, loop é encerrado após o fade");
  sfx.wind(); assert.equal(ctx.sources.length, 2, "o buffer já decodificado é reutilizado");
  assert.equal(requests.filter((v) => v.endsWith("/wind.mp3")).length, 1);
  sfx.vol = 0; assert.equal(sfx.ambientTargets.get("wind"), 0);
  sfx.destroy(); assert.ok(ctx.sources[1].stopped); assert.equal(ctx.state, "closed");
});

test("ambiente ou música que chegam depois do desligamento não começam a tocar", async (t) => {
  let releaseWind;
  audioEnvironment(t, (url) => url.includes("ambient/wind")
    ? new Promise((resolve) => { releaseWind = resolve; })
    : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const sfx = await makeSfx(), ctx = sfx.ctx;
  sfx.wind(); sfx.setAmbient("wind", 0);
  releaseWind({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await tick(); await tick(); assert.equal(ctx.sources.length, 0);
  sfx.wind(); assert.equal(ctx.sources.length, 1);
  sfx.destroy();
});

test("música troca com fade, ignora resultados antigos e respeita mudo e reativação", async (t) => {
  const requests = new Map();
  audioEnvironment(t, (url) => new Promise((resolve) => requests.set(url, resolve)));
  const player = new MusicManager(); player.setVoice(false); player.play("lobby");
  const ctx = player.ctx;
  const finish = async (track) => {
    requests.get(`/audio/music/${track}.mp3`)({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await tick(); await tick();
  };
  await finish("lobby");
  assert.equal(player.current, "lobby"); assert.equal(ctx.sources.length, 1); assert.equal(ctx.sources[0].loop, true);
  player.play("day"); player.play("night");
  await finish("day"); assert.equal(ctx.sources.length, 1, "trilha antiga não começa depois de outra escolha");
  await finish("night"); assert.equal(ctx.sources.length, 2);
  assert.ok(ctx.sources[0].stopped, "transição encerra o lobby com fade");
  player.setVolume(0); assert.ok(ctx.sources[1].stopped, "volume zero encerra a trilha ativa");
  player.setVolume(0.5); await tick(); await tick(); assert.equal(ctx.sources.length, 3, "retomar usa o cache");
  player.setEnabled(false); assert.ok(ctx.sources[2].stopped);
  player.setEnabled(true); await tick(); await tick(); assert.equal(ctx.sources.length, 4);
  player.play("none"); assert.equal(player.current, "none"); assert.ok(ctx.sources[3].stopped);
  player.stop(); await ctx.close();
});

test("voz opcional do lobby respeita música desligada e silêncio", async (t) => {
  audioEnvironment(t);
  const oldUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  t.after(() => { globalThis.SpeechSynthesisUtterance = oldUtterance; });
  let spoken = 0, cancelled = 0;
  window.speechSynthesis = { speak() { spoken++; }, cancel() { cancelled++; } };
  const player = new MusicManager();
  player.setEnabled(false); player.play("lobby"); player.resume();
  assert.equal(spoken, 0, "música desligada não inicia a voz");
  player.setEnabled(true); player.resume(); await tick(); await tick();
  assert.equal(spoken, 1, "voz toca uma vez ao desbloquear o lobby");
  const before = cancelled; player.setVolume(0);
  assert.ok(cancelled > before, "silenciar a música interrompe também a fala em curso");
  player.stop(); await player.ctx.close();
});

test("explosão da introdução usa amostra local, volume de efeitos e para ao pular", async (t) => {
  const requests = [];
  audioEnvironment(t, async (url) => { requests.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; });
  const sfx = await makeSfx(), ctx = sfx.ctx;
  sfx.prepareIntroExplosion(); sfx.prepareIntroExplosion();
  await tick(); await tick();
  assert.equal(requests.filter((url) => url.endsWith("/intro-explosion.mp3")).length, 1);
  assert.equal(sfx.introExplosionReady, true);
  sfx.vol = 0.5; sfx.playIntroExplosion();
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].buffer, sfx.introExplosion, "não usa o ruído sintético quando a amostra está pronta");
  assert.deepEqual(ctx.sources[0].started, [0]);
  assert.equal(ctx.gains.at(-1).gain.value, 0.72);
  assert.equal(sfx.output.gain.value, 0.5, "controle independente de efeitos");
  sfx.stopIntroExplosion(); assert.ok(ctx.sources[0].stopped, "pular encerra a reprodução");
  sfx.vol = 0; sfx.playIntroExplosion();
  assert.equal(ctx.sources.length, 1, "volume zero não inicia outro som");
  sfx.destroy();
});

test("fallback da explosão não toca amostra atrasada após pular ou destruir", async (t) => {
  let releaseIntro;
  audioEnvironment(t, (url) => url.endsWith("intro-explosion.mp3")
    ? new Promise((resolve) => { releaseIntro = resolve; })
    : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const sfx = await makeSfx(), ctx = sfx.ctx;
  sfx.prepareIntroExplosion();
  sfx.playIntroExplosion();
  assert.equal(ctx.sources.length, 1); assert.equal(ctx.sources[0].buffer, sfx.noiseBuffer, "fallback imediato");
  sfx.stopIntroExplosion(); assert.ok(ctx.sources[0].stopped);
  releaseIntro({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await tick(); await tick();
  assert.equal(sfx.introExplosionReady, true);
  assert.equal(ctx.sources.length, 1, "decodificação atrasada não toca por conta própria");
  sfx.destroy(); assert.equal(ctx.state, "closed");
});

test("contexto liberado no menu funciona com música desligada e não fecha ao sair do jogo", async (t) => {
  audioEnvironment(t);
  const music = new MusicManager(); music.setEnabled(false);
  const ctx = music.ensure(); ctx.state = "suspended";
  music.resume();
  assert.equal(ctx.state, "running", "gesto libera os efeitos mesmo com música desativada");
  const sfx = new Sfx(ctx); sfx.ensure();
  await tick(); await tick();
  assert.equal(sfx.ctx, ctx, "efeitos reutilizam o contexto liberado pelo botão inicial");
  const output = sfx.output;
  sfx.destroy();
  assert.equal(output.disconnected, true);
  assert.equal(ctx.state, "running", "o retorno ao menu não fecha a música compartilhada");
  music.stop(); await ctx.close();
});
