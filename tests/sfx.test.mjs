import test from "node:test";
import assert from "node:assert/strict";
import sfxModule from "../src/game/sfx.ts";

const { Sfx } = sfxModule;
const param = () => ({
  value: 0, events: [],
  setValueAtTime(value, time) { this.events.push(["set", value, time]); },
  exponentialRampToValueAtTime(value, time) { this.events.push(["exp", value, time]); },
  linearRampToValueAtTime(value, time) { this.events.push(["linear", value, time]); },
});
class FakeAudioContext {
  currentTime = 0;
  state = "running";
  sampleRate = 44100;
  destination = {};
  oscillators = [];
  buffers = 0;
  sources = [];
  closed = false;
  createOscillator() {
    const oscillator = { type: "sine", frequency: param(), connect() {}, start() {}, stop() {} };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() { return { gain: param(), connect() {} }; }
  createBiquadFilter() { return { type: "lowpass", frequency: param(), Q: param(), connect() {} }; }
  createBuffer(_channels, length) { this.buffers++; return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() {
    const source = { buffer: null, connect() {}, start(...args) { this.started = args; } };
    this.sources.push(source);
    return source;
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.closed = true; this.state = "closed"; return Promise.resolve(); }
}

test("sons de criaturas variam por tipo e não se acumulam em hordas", () => {
  const sfx = new Sfx();
  const ctx = new FakeAudioContext();
  sfx.ctx = ctx;
  sfx.creature("hulk", 1);
  assert.equal(ctx.oscillators[0].frequency.events[0][1], 86);
  assert.equal(ctx.buffers, 1);
  assert.equal(ctx.sources.length, 1);
  sfx.creature("bat", 1);
  assert.equal(ctx.sources.length, 1, "o intervalo entre chamados deve impedir sobreposição");
  ctx.currentTime = 2;
  sfx.creature("bat", 0.8);
  assert.equal(ctx.oscillators[2].frequency.events[0][1], 270);
  assert.equal(ctx.buffers, 1, "o ruído deve ser reutilizado");
  assert.equal(ctx.sources.length, 2);
  ctx.currentTime = 4;
  sfx.vol = 0;
  sfx.creature("hulk", 1);
  sfx.noise(0.08, 0.3);
  assert.equal(ctx.sources.length, 2, "volume zero deve silenciar e evitar criar nós de áudio");
  sfx.vol = 0.35;
  ctx.state = "suspended";
  sfx.creature("hulk", 1);
  assert.equal(ctx.sources.length, 2, "não acumular sons enquanto o áudio estiver suspenso");
  sfx.destroy();
  assert.equal(ctx.closed, true);
  assert.equal(sfx.ctx, null);
});

test("rajadas de vento reutilizam ruído, terminam sozinhas e respeitam pausa e volume", () => {
  const sfx = new Sfx();
  const ctx = new FakeAudioContext(); sfx.ctx = ctx;
  sfx.wind();
  assert.equal(ctx.buffers, 1);
  assert.equal(ctx.sources.length, 1);
  assert.deepEqual(ctx.sources[0].started, [0, 0, 1], "fonte limitada a um segundo");
  for (let i = 0; i < 100; i++) sfx.wind();
  assert.equal(ctx.sources.length, 1, "rajadas não acumulam fontes por quadro");
  ctx.currentTime = 20; sfx.wind();
  assert.equal(ctx.sources.length, 2);
  assert.equal(ctx.buffers, 1, "o mesmo buffer de ruído é reutilizado");
  ctx.currentTime = 40; sfx.vol = 0; sfx.wind();
  ctx.state = "suspended"; sfx.vol = 0.35; sfx.wind();
  assert.equal(ctx.sources.length, 2, "volume zero e áudio suspenso não criam nós");
  sfx.destroy();
  assert.equal(ctx.closed, true);
});
