import { NextRequest, NextResponse } from "next/server";
import { getDb, hasDatabaseUrl } from "@/db";
import { scores } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .orderBy(desc(scores.score))
      .limit(25);
    return NextResponse.json({ scores: rows });
  } catch {
    return NextResponse.json({ scores: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: "Placar compartilhado indisponível." }, { status: 503 });
  }
  try {
    const db = getDb();
    const body = await req.json();
    const name = String(body.name ?? "Sobrevivente").slice(0, 24) || "Sobrevivente";
    const score = Math.max(0, Math.min(999999999, Math.floor(Number(body.score) || 0)));
    const days = Math.max(0, Math.floor(Number(body.days) || 0));
    const kills = Math.max(0, Math.floor(Number(body.kills) || 0));
    const difficulty = ["dificil", "muito-dificil", "impossivel"].includes(body.difficulty)
      ? body.difficulty
      : "dificil";
    const mode = body.mode === "multi" ? "multi" : "single";
    const outcome = body.outcome === "vitoria" ? "vitoria" : "morte";
    const [row] = await db
      .insert(scores)
      .values({ name, score, days, kills, difficulty, mode, outcome })
      .returning();
    return NextResponse.json({ ok: true, entry: row });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
