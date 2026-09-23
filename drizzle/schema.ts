// The synced copy of a reader's progress, in Postgres.
//
// This is dev-time only. It defines the tables and their row-level security and
// is turned into SQL migrations by drizzle-kit. Nothing in here ships to the
// browser: the app reads and writes these tables through the Neon Data API,
// with a short-lived token from sign-in, and Postgres decides from that token
// which rows it may touch. A Drizzle client in the browser would need the
// database connection string, and anything the browser has, every visitor has.
//
// The reader's own browser stays the source of truth. These tables are a copy
// kept so a second device can catch up. See CLAUDE.md 1.7.
//
// Every table is keyed by `user_id`, filled in from the token rather than sent
// by the client, and every policy compares against it. A reader can only ever
// see, write or delete their own rows.

import { sql } from "drizzle-orm";
import { authenticatedRole, authUid, crudPolicy } from "drizzle-orm/neon";
import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** The signed-in reader, taken from their token, never from the request body. */
function owner() {
  return text("user_id")
    .notNull()
    .default(sql`(auth.user_id())`);
}

/**
 * When the row last changed on the server.
 *
 * Set by a trigger, not by the client, so "what changed since I last looked"
 * does not depend on two devices agreeing about the time.
 */
function changedAt() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}

function ownRowsOnly(userId: Parameters<typeof authUid>[0]) {
  return crudPolicy({ role: authenticatedRole, read: authUid(userId), modify: authUid(userId) });
}

/**
 * One row per item: a kana, or a kanji word with one reading.
 *
 * `state` is the item as the app keeps it, FSRS card and all. `reviewed_at` is
 * its last review, and it decides a conflict: the copy reviewed most recently
 * wins, enforced by a trigger, so a device that was offline for a week cannot
 * overwrite this week's reviews with last week's.
 */
export const items = pgTable(
  "items",
  {
    userId: owner(),
    itemId: text("item_id").notNull(),
    state: jsonb("state").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    updatedAt: changedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("items_changed").on(table.userId, table.updatedAt),
    ownRowsOnly(table.userId),
  ],
);

/**
 * Every finished sentence. Append-only: a sentence read is never unread, so an
 * attempt is inserted once and never changed.
 *
 * `attempt_id` is made by the device that recorded it from when it finished and
 * which sentence it was, which is enough to tell two readings apart and makes
 * uploading the same one twice harmless.
 */
export const attempts = pgTable(
  "attempts",
  {
    userId: owner(),
    attemptId: text("attempt_id").notNull(),
    record: jsonb("record").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    updatedAt: changedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.attemptId] }),
    index("attempts_changed").on(table.userId, table.updatedAt),
    ownRowsOnly(table.userId),
  ],
);

/** The reader's baselines and motor floors, one row per reader. */
export const readers = pgTable(
  "readers",
  {
    userId: owner().primaryKey(),
    model: jsonb("model").notNull(),
    updatedAt: changedAt(),
  },
  (table) => [ownRowsOnly(table.userId)],
);

/** The reader's band and which sentences they have read lately, one row each. */
export const sessions = pgTable(
  "sessions",
  {
    userId: owner().primaryKey(),
    record: jsonb("record").notNull(),
    updatedAt: changedAt(),
  },
  (table) => [ownRowsOnly(table.userId)],
);
