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
import {
  check,
  doublePrecision,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

/**
 * A signed-in reader as their friends see them: a name and a score.
 *
 * Made automatically on the first sync, with a random name the reader can
 * change. The score is the one the app already works out on the device, sent
 * with each sync, so it is the score as of the last sync and `scored_at` says
 * when that was.
 *
 * Readable by its owner and by anyone who added them, and by no one else.
 * There is no list of every reader: someone is found only by typing their
 * exact name, through `find_profile`. See drizzle/migrations for that.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: owner().primaryKey(),
    // Stored lowercase and kept to a small alphabet, so a name read aloud or
    // copied from a chat is the name that finds them.
    username: text("username").notNull(),
    // Free text, any script, shown instead of the username where there is one.
    displayName: text("display_name"),
    // One of a fixed palette, named rather than a colour value, so each name
    // can have its own shade in light and dark mode.
    cardColor: text("card_color").notNull().default("green"),
    // Whether anyone may see this profile at /@username, and later on the
    // global board. Off until the reader turns it on. See CLAUDE.md 1.7.
    score: doublePrecision("score").notNull().default(0),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    updatedAt: changedAt(),
  },
  (table) => [
    uniqueIndex("profiles_username").on(table.username),
    check("profiles_username_format", sql`${table.username} ~ '^[a-z0-9_-]{3,20}$'`),
    check("profiles_display_name_length", sql`char_length(${table.displayName}) between 1 and 32`),
    check(
      "profiles_card_color",
      sql`${table.cardColor} in ('green', 'blue', 'violet', 'rose', 'amber', 'slate')`,
    ),
    pgPolicy("profiles_read_own_and_added", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = (select auth.user_id()) or exists (
        select 1 from friends
        where friends.follower_id = (select auth.user_id())
          and friends.followee_id = ${table.userId}
      )`,
    }),
    pgPolicy("profiles_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: authUid(table.userId),
    }),
    pgPolicy("profiles_update_own", {
      for: "update",
      to: authenticatedRole,
      using: authUid(table.userId),
      withCheck: authUid(table.userId),
    }),
    pgPolicy("profiles_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: authUid(table.userId),
    }),
  ],
);

/**
 * Who a reader has added to their board. One-way, like following: the person
 * added is not asked and does not need to add them back.
 *
 * Each row belongs to the reader who added someone, and only they can see,
 * add or remove it. When either profile goes, the row goes with it.
 */
export const friends = pgTable(
  "friends",
  {
    followerId: text("follower_id")
      .notNull()
      .default(sql`(auth.user_id())`)
      .references(() => profiles.userId, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    check("friends_not_self", sql`${table.followerId} <> ${table.followeeId}`),
    ownRowsOnly(table.followerId),
  ],
);
