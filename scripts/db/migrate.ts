// Applies the migrations in drizzle/migrations to one Neon branch.
//
// `bun run db:migrate` migrates `dev`, from `.env.local`. Production is
// `bun run db:migrate:production`, from `.env.production.local`, and is run
// only after the same migration has worked on `dev`.
// Uses Neon's own driver rather than
// `drizzle-kit migrate`, whose `pg` driver fails on the SSL settings in a Neon
// connection string and then hides the error behind its progress spinner, so a
// failed migration looked like nothing at all.

import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (process.env.DATABASE_URL_UNPOOLED === undefined && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const url = process.env.DATABASE_URL_UNPOOLED;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_UNPOOLED is not set. Run `neon deploy` to write .env.local.");
}

// Said before and after, so a migration run against the wrong branch is at
// least noticed.
const branch = process.env.NEON_BRANCH ?? "an unnamed branch";
console.log(`migrating ${branch}`);
await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle/migrations" });
console.log(`migrations applied to ${branch}`);
