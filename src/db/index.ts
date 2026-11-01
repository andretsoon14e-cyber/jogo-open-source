import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __umbraDbPool?: Pool;
};

let pool: Pool | undefined;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Open the pool only when an API actually needs it. The solo game needs no database. */
export function getDb() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for multiplayer and shared scores");
  }

  pool ??= globalForDb.__umbraDbPool ?? new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__umbraDbPool = pool;
  }

  return drizzle(pool);
}
