// The database connection, shared by every route.
//
// Connects as the database owner, which row-level security does not apply to.
// So every query in this function scopes itself to the caller by hand.

import { attachDatabasePool } from "@neon/functions";
import { Pool, type PoolClient } from "pg";

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

/** Runs `work` in one transaction, so nothing is ever left half done. */
export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // Whatever goes wrong, the transaction is rolled back and the connection
  // returned, then the error goes on to Hono, which answers 500.
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
