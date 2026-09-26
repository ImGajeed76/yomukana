// The database connection, shared by every route.
//
// Connects as the database owner, which row-level security does not apply to.
// So every query in this function scopes itself to the caller by hand.

import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

/** Postgres' code for a unique value already taken. */
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNIQUE_VIOLATION
  );
}
