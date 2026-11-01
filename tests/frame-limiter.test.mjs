import test from "node:test";
import assert from "node:assert/strict";
import limiterModule from "../src/game/frame-limiter.ts";
import settingsModule from "../src/game/settings.ts";

const { FrameLimiter } = limiterModule;
const { DEFAULT_SETTINGS } = settingsModule;

function countFrames(refreshRate, cap, seconds = 3) {
  const limiter = new FrameLimiter(0, cap);
  let count = 0;
  for (let i = 1; i <= refreshRate * seconds; i++) {
    if (limiter.shouldRender(i * 1000 / refreshRate, cap)) count++;
  }
  return count;
}

test("limites de FPS preservam o ritmo em telas com frequências diferentes", () => {
  for (const [refresh, cap, expected] of [
    [60, 120, 180], [144, 120, 360], [165, 120, 360],
    [240, 144, 432], [144, 60, 180], [240, 0, 720],
  ]) {
    assert.ok(Math.abs(countFrames(refresh, cap) - expected) <= 1, `${refresh} Hz, limite ${cap}`);
  }
  assert.equal(DEFAULT_SETTINGS.fpsCap, 0, "novos jogadores não devem ficar limitados a 120 FPS");
});

test("trocar o limite em tempo real libera o próximo quadro", () => {
  const limiter = new FrameLimiter(0, 60);
  assert.equal(limiter.shouldRender(4, 60), false);
  assert.equal(limiter.shouldRender(8, 0), true);
  assert.equal(limiter.shouldRender(12, 0), true);
  assert.equal(limiter.shouldRender(16, 144), false);
  assert.equal(limiter.shouldRender(20, 144), true);
});
