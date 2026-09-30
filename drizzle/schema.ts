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
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  uuid,
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
    // Whether they are on the global leaderboard, where anyone can see them.
    // Off until they turn it on: it is the one place a name becomes findable.
    isListed: boolean("is_listed").notNull().default(false),
    score: doublePrecision("score").notNull().default(0),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    // The best score the API function has accepted, and when. A new best is
    // held to the fastest path a reader can take; getting back to an old one
    // after a break only to how fast a reader relearns. See
    // functions/api/score-check.ts.
    peakScore: doublePrecision("peak_score").notNull().default(0),
    peakAt: timestamp("peak_at", { withTimezone: true }),
    // The reading streak, worked out on the device from its sentences (see
    // src/lib/stats/streak.ts) and sent with each sync, for the card. With
    // when it ends if nothing more is read, so a card stops showing a streak
    // that has broken since, however long ago the reader last synced.
    streakDays: integer("streak_days").notNull().default(0),
    streakAliveUntil: timestamp("streak_alive_until", { withTimezone: true }),
    updatedAt: changedAt(),
  },
  (table) => [
    uniqueIndex("profiles_username").on(table.username),
    check("profiles_username_format", sql`${table.username} ~ '^[a-z0-9_-]{3,20}$'`),
    check("profiles_display_name_length", sql`char_length(${table.displayName}) between 1 and 32`),
    check(
      "profiles_card_color",
      sql`${table.cardColor} in (
        'rose', 'orange', 'amber', 'lime', 'green', 'teal',
        'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'
      )`,
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
/**
 * Scores the API function accepted, with its own clock's time, kept for about
 * two days. Each new score is checked against where the reader stood ten
 * minutes, an hour and a day before, and this is where those come from. See
 * functions/api/scores.ts. Closed to the Data API like the group tables.
 */
export const scoreSubmissions = pgTable(
  "score_submissions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    score: doublePrecision("score").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("score_submissions_by_reader").on(table.userId, table.acceptedAt)],
).enableRLS();

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

/**
 * A group of readers who all see each other: a class, a school, a group of
 * friends. Unlike following, it is shared, so everyone in it sees the same
 * board.
 *
 * Only the API function reads or writes groups and their members, never the
 * Data API: who may join, see and remove whom are rules, and they live in one
 * place. Row-level security is on with no policy, so the Data API sees nothing
 * here even if a grant is ever added by mistake. See functions/api/groups.ts.
 */
export const groups = pgTable(
  "groups",
  {
    groupId: uuid("group_id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Joins the group while it lasts. Null when the admin has turned it off.
    inviteCode: text("invite_code"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    // Shows the board, read-only and without signing in, on a screen in a
    // classroom. Null until the admin makes one.
    displayCode: text("display_code"),
    // Whether members other than the admin may share the invite, and make one
    // when none is working. Changing, replacing and stopping it stay the
    // admin's.
    membersCanInvite: boolean("members_can_invite").notNull().default(false),
    // The group's badge, which members can wear on their card: a tag of 2 to
    // 4 characters in a card colour, and an emoji from the app's own list if
    // the admin wants one. No tag, no badge. The function checks the emoji and
    // the tag's letters, see src/lib/sync/badge-rules.ts.
    badgeEmoji: text("badge_emoji"),
    badgeTag: text("badge_tag"),
    badgeColor: text("badge_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("groups_invite_code").on(table.inviteCode),
    uniqueIndex("groups_display_code").on(table.displayCode),
    check("groups_name_length", sql`char_length(${table.name}) between 1 and 40`),
    check(
      "groups_badge_whole",
      sql`(${table.badgeTag} is null) = (${table.badgeColor} is null)
        and (${table.badgeTag} is not null or ${table.badgeEmoji} is null)`,
    ),
    check("groups_badge_emoji_length", sql`char_length(${table.badgeEmoji}) between 1 and 8`),
    check("groups_badge_tag_length", sql`char_length(${table.badgeTag}) between 2 and 4`),
    check(
      "groups_badge_color",
      sql`${table.badgeColor} in (
        'rose', 'orange', 'amber', 'lime', 'green', 'teal',
        'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'
      )`,
    ),
  ],
).enableRLS();

/**
 * Who is in a group. The reader who made it is its admin, who can rename it,
 * invite, remove members and delete it, and let members invite too. Everyone else is a member.
 *
 * When a reader deletes their account the rows go with their profile, and a
 * trigger makes sure a group left without an admin gets one, or goes if it
 * is empty. See drizzle/migrations for that.
 */
export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.groupId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_by_reader").on(table.userId),
    check("group_members_role", sql`${table.role} in ('admin', 'member')`),
  ],
).enableRLS();

/**
 * The group badges a reader wears on their card, up to three, in the order
 * they chose. Tied to their membership, not just to the group: leaving a group
 * or being removed from it takes its badge off by the same cascade, so no rule
 * anywhere has to remember to.
 *
 * Closed to the Data API like the group tables. The following board reads the
 * badges through the `followed_badges` view instead, which shows only the
 * reader and the people they follow. See drizzle/migrations.
 */
export const profileBadges = pgTable(
  "profile_badges",
  {
    userId: text("user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    position: smallint("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId] }),
    uniqueIndex("profile_badges_position").on(table.userId, table.position),
    check("profile_badges_position_range", sql`${table.position} between 0 and 2`),
    foreignKey({
      columns: [table.groupId, table.userId],
      foreignColumns: [groupMembers.groupId, groupMembers.userId],
      name: "profile_badges_membership",
    }).onDelete("cascade"),
  ],
).enableRLS();
