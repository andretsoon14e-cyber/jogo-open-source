import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import introModule from "../src/game/intro-art.ts";

const { INTRO_IMPACT, INTRO_BEACH, preloadIntroArt, drawIntroExplosion, introImpactX } = introModule;

test("explosão usa quadros completos 128×80, com fallback leve e enquadramento no celular", async () => {
  const meta = await sharp("public/effects/intro-explosion.png").metadata();
  assert.equal(meta.width, 1280); assert.equal(meta.height, 80);
  const previous = globalThis.Image;
  let imageRequests = 0, imageDraws = [], rectangles = 0;
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "createRadialGradient") return () => ({ addColorStop() {} });
      if (key === "drawImage") return (...args) => imageDraws.push(args);
      if (key === "fillRect") return () => { rectangles++; };
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  try {
    // Missing image support keeps a visible procedural fallback.
    delete globalThis.Image;
    preloadIntroArt(); drawIntroExplosion(ctx, 390, 844, INTRO_IMPACT + 0.6);
    assert.equal(imageDraws.length, 0); assert.ok(rectangles > 10);
    globalThis.Image = class {
      naturalWidth = 1280; naturalHeight = 80;
      set src(value) { assert.equal(value, "/effects/intro-explosion.png"); imageRequests++; this.onload(); }
    };
    preloadIntroArt(); preloadIntroArt(); assert.equal(imageRequests, 1);
    const frames = new Set();
    for (let t = INTRO_IMPACT; t < INTRO_BEACH; t += 1 / 60) {
      imageDraws = []; drawIntroExplosion(ctx, 390, 844, t);
      assert.ok(imageDraws.length > 0);
      for (const [, sx, sy, sw, sh, dx, , dw, dh] of imageDraws) {
        assert.equal(sy, 0); assert.equal(sw, 128); assert.equal(sh, 80);
        assert.equal(sx % 128, 0); assert.ok(sx >= 0 && sx <= 1152);
        assert.ok(Math.abs(dw / dh - 128 / 80) < 1e-9, "proporção original preservada");
        assert.ok(dx + dw <= 390 + 2, "efeito inteiro cabe no celular");
      }
      frames.add(imageDraws[0][1] / 128);
    }
    assert.deepEqual([...frames].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(introImpactX(390) < 390 * 0.7);
  } finally { globalThis.Image = previous; }
});
