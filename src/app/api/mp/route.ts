import { NextRequest, NextResponse } from "next/server";
import { getDb, hasDatabaseUrl } from "@/db";
import { rooms, roomPlayers } from "@/db/schema";
import { eq, lt, and, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export async function POST(req: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: "Multiplayer indisponível: configure um banco PostgreSQL no servidor." }, { status: 503 });
  }
  try {
    const db = getDb();
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const code = makeCode();
      const seed = Math.floor(Math.random() * 2147483646) + 1;
      const difficulty = ["dificil", "muito-dificil", "impossivel"].includes(body.difficulty)
        ? body.difficulty
        : "dificil";
      await db.insert(rooms).values({ code, seed, difficulty });
      // Clean up stale rooms older than 1 day
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
      await db.delete(rooms).where(lt(rooms.createdAt, cutoff)).catch?.(() => {});
      return NextResponse.json({ ok: true, code, seed, difficulty });
    }

    if (action === "join") {
      const code = String(body.code ?? "").toUpperCase().trim();
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
      if (!room) return NextResponse.json({ ok: false, error: "Sala não encontrada" }, { status: 404 });
      return NextResponse.json({ ok: true, code: room.code, seed: room.seed, difficulty: room.difficulty });
    }

    if (action === "sync") {
      const code = String(body.code ?? "").toUpperCase().trim();
      const playerId = String(body.playerId ?? "").slice(0, 48);
      if (!code || !playerId) return NextResponse.json({ ok: false }, { status: 400 });
      const s = body.state ?? {};
      const values = {
        id: playerId,
        code,
        name: String(s.name ?? "Jogador").slice(0, 24),
        x: Number(s.x) || 0,
        y: Number(s.y) || 0,
        hp: Math.floor(Number(s.hp) || 0),
        score: Math.floor(Number(s.score) || 0),
        day: Math.floor(Number(s.day) || 1),
        updatedAt: new Date(),
      };
      await db
        .insert(roomPlayers)
        .values(values)
        .onConflictDoUpdate({
          target: roomPlayers.id,
          set: {
            x: values.x,
            y: values.y,
            hp: values.hp,
            score: values.score,
            day: values.day,
            name: values.name,
            updatedAt: values.updatedAt,
          },
        });
      // Remove players inactive for > 30s
      const stale = new Date(Date.now() - 30000);
      await db
        .delete(roomPlayers)
        .where(and(eq(roomPlayers.code, code), lt(roomPlayers.updatedAt, stale)));
      const others = await db
        .select()
        .from(roomPlayers)
        .where(and(eq(roomPlayers.code, code), ne(roomPlayers.id, playerId)))
        .limit(8);
      const totalScore = await db
        .select({ total: sql<number>`coalesce(sum(${roomPlayers.score}), 0)` })
        .from(roomPlayers)
        .where(eq(roomPlayers.code, code));
      return NextResponse.json({
        ok: true,
        players: others,
        teamScore: Number(totalScore[0]?.total ?? 0),
      });
    }

    return NextResponse.json({ ok: false, error: "ação inválida" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Multiplayer indisponível. Verifique a conexão e o banco de dados." }, { status: 500 });
  }
}
