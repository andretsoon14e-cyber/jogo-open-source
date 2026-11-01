import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js' local environment file while allowing deployment variables.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("Configure DATABASE_URL antes de preparar o banco de dados.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
});
