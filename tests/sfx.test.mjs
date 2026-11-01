import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import sfxModule from "../src/game/sfx.ts";
import musicModule from "../src/game/music.ts";

const { Sfx, AUDIO_GROUPS } = sfxModule;
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
  return sfx;
}

const cues = JSON.parse(readFileSync("src/game/audio-cues.generated.json", "utf8"));
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
  for (const file of ["effects", "ambient/wind", "ambient/water", "ambient/sea", "ambient/fire", "music/lobby", "music/day", "music/night", "music/siege"]) {
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

test("impactos variam por material e o banco limita acúmulo e repetição", async (t) => {
  audioEnvironment(t);
  const sfx = await makeSfx(), ctx = sfx.ctx;
  for (const material of ["rock", "ore", "crystal"]) { sfx.mine(material); ctx.currentTime += 1; }
  for (const [i, group] of ["stone", "metal", "crystal"].entries()) {
    assert.ok(AUDIO_GROUPS[group].some((name) => cues[name][0] === ctx.sources[i].started[1]), group);
  }
  ctx.currentTime += 1; sfx.chop(); const first = ctx.sources.at(-1).started[1];
  ctx.currentTime += 1; sfx.chop(); const second = ctx.sources.at(-1).started[1];
  assert.notEqual(first, second, "a mesma amostra não repete imediatamente");
  for (let i = 0; i < 100; i++) { ctx.currentTime += 1; sfx.hit(); }
  assert.ok(ctx.sources.length <= 16, "máximo global de fontes simultâneas");
  sfx.destroy();
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
