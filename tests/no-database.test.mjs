import test from "node:test";
import assert from "node:assert/strict";
import dbModule from "../src/db/index.ts";
import healthModule from "../src/app/api/health/route.ts";
import scoresModule from "../src/app/api/scores/route.ts";
import multiplayerModule from "../src/app/api/mp/route.ts";

const { getDb, hasDatabaseUrl } = dbModule;

test("o jogo solo e as rotas iniciam sem DATABASE_URL", async (t) => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  assert.equal(hasDatabaseUrl(), false);
  assert.throws(() => getDb(), /DATABASE_URL/);

  const health = await healthModule.GET();
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { ok: false });

  const scores = await scoresModule.GET();
  assert.equal(scores.status, 200);
  assert.deepEqual(await scores.json(), { scores: [] });

  const scorePost = await scoresModule.POST(new Request("http://localhost/api/scores", { method: "POST" }));
  assert.equal(scorePost.status, 503);
  assert.equal((await scorePost.json()).ok, false);

  const multiplayer = await multiplayerModule.POST(new Request("http://localhost/api/mp", { method: "POST" }));
  assert.equal(multiplayer.status, 503);
  const body = await multiplayer.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /PostgreSQL/);
});
