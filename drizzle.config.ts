import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Migrations for the synced copy of progress. Run with `bun run db:migrate`,
// which reads the connection string from `.env.local` (written by `neon
// deploy`, never committed). The unpooled URL, because schema changes want a
// direct connection rather than a pooled one.
//
// Loaded here rather than trusted to the runner: drizzle-kit evaluates this file
// in a way that does not always inherit the environment of whatever started it.
if (process.env.DATABASE_URL_UNPOOLED === undefined && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const url = process.env.DATABASE_URL_UNPOOLED;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_UNPOOLED is not set. Run `neon deploy` to write .env.local.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url },
  // Neon's auth schema holds users and sessions and is Neon's to manage.
  schemaFilter: ["public"],
  entities: { roles: { provider: "neon" } },
});
