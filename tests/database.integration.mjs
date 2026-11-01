import assert from "node:assert/strict";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import dbModule from "../src/db/index.ts";
import schemaModule from "../src/db/schema.ts";
import healthModule from "../src/app/api/health/route.ts";
import scoresModule from "../src/app/api/scores/route.ts";
import multiplayerModule from "../src/app/api/mp/route.ts";

// This test writes to the configured database; use a dedicated test database.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
if (!dbModule.hasDatabaseUrl()) throw new Error("Configure DATABASE_URL para executar o teste de banco.");

const db = dbModule.getDb();
const { rooms, roomPlayers, scores } = schemaModule;
const marker = `teste-${Date.now().toString(36)}`;
let code;
let scoreId;

function post(path, body) {
  return new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

try {
  const health = await healthModule.GET();
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const createdResponse = await multiplayerModule.POST(post("mp", { action: "create", difficulty: "dificil" }));
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.equal(created.ok, true);
  code = created.code;
  assert.match(code, /^[A-Z2-9]{5}$/);

  const joinResponse = await multiplayerModule.POST(post("mp", { action: "join", code }));
  assert.equal(joinResponse.status, 200);
  const joined = await joinResponse.json();
  assert.equal(joined.seed, created.seed);
  assert.equal(joined.difficulty, "dificil");

  const first = await multiplayerModule.POST(post("mp", {
    action: "sync", code, playerId: `${marker}-1`, state: { name: marker, x: 12, y: 34, hp: 90, score: 10, day: 1 },
  }));
  assert.equal(first.status, 200);
  const second = await multiplayerModule.POST(post("mp", {
    action: "sync", code, playerId: `${marker}-2`, state: { name: marker, x: 56, y: 78, hp: 80, score: 20, day: 2 },
  }));
  assert.equal(second.status, 200);
  const sync = await second.json();
  assert.equal(sync.teamScore, 30);
  assert.equal(sync.players.length, 1);
  assert.equal(sync.players[0].id, `${marker}-1`);

  const scoreResponse = await scoresModule.POST(post("scores", {
    name: marker, score: 99999998, days: 3, kills: 4, difficulty: "dificil", mode: "multi", outcome: "vitoria",
  }));
  assert.equal(scoreResponse.status, 200);
  const savedScore = await scoreResponse.json();
  scoreId = savedScore.entry.id;
  const ranking = await scoresModule.GET();
  assert.ok((await ranking.json()).scores.some((entry) => entry.id === scoreId));

  console.log("OK: banco, criação/entrada de sala, sincronização e placar compartilhado.");
} finally {
  try {
    if (code) {
      await db.delete(roomPlayers).where(eq(roomPlayers.code, code));
      await db.delete(rooms).where(eq(rooms.code, code));
    }
    if (scoreId != null) await db.delete(scores).where(eq(scores.id, scoreId));
  } finally {
    await db.$client.end();
  }
}
