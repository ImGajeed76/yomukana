// What a reader wears on their card, and looking it up for a board: group
// badges and achievement seals, up to three of either, in the order chosen.
//
// A group's admin makes its badge (see groups.ts); seals are earned (see
// achievements.ts). Here a reader chooses which of what they have to wear.
// Wearing is tied in the database to the membership or the seal, so leaving
// a group takes its badge off without any code here. See drizzle/schema.ts.

import { Hono } from "hono";
import { BADGES_WORN_MAX, type Worn } from "../../src/lib/sync/badge-rules";
import { isSealId } from "../../src/lib/sync/seal-rules";
import type { CardColor } from "../../src/lib/sync/profile-rules";
import { readerOf } from "./auth";
import { isUuid } from "./codes";
import { inTransaction, pool } from "./db";
import { refuse } from "./problems";

interface WornRow {
  user_id: string;
  emoji: string | null;
  tag: string | null;
  color: CardColor | null;
  seal: string | null;
  earned_at: Date | null;
}

/**
 * What each of these readers wears, badges and seals, in the order they
 * chose, for putting on their lines. One query for a whole board.
 */
export async function badgesFor(userIds: readonly string[]): Promise<Map<string, Worn[]>> {
  const worn = new Map<string, Worn[]>();
  if (userIds.length === 0) return worn;
  const result = await pool.query<WornRow>(
    `select user_id, emoji, tag, color, seal, earned_at from worn_badges
     where user_id = any($1) order by user_id, position`,
    [userIds],
  );
  for (const row of result.rows) {
    const list = worn.get(row.user_id) ?? [];
    if (row.seal !== null && row.earned_at !== null) {
      list.push({ seal: row.seal, earnedAt: row.earned_at.getTime() });
    } else if (row.tag !== null && row.color !== null) {
      list.push({ emoji: row.emoji, tag: row.tag, color: row.color });
    }
    worn.set(row.user_id, list);
  }
  return worn;
}

export const badges = new Hono();

interface OwnBadgeRow {
  group_id: string;
  name: string;
  badge_emoji: string | null;
  badge_tag: string;
  badge_color: CardColor;
  position: number | null;
}

/**
 * Every badge the caller could wear: one for each of their groups that has
 * one, with the group's name so they know which is which, and where it sits
 * among the ones they wear, or null.
 */
badges.get("/badges", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const result = await pool.query<OwnBadgeRow>(
    `select g.group_id, g.name, g.badge_emoji, g.badge_tag, g.badge_color, b.position
     from group_members m
     join groups g on g.group_id = m.group_id
     left join profile_badges b on b.group_id = m.group_id and b.user_id = m.user_id
     where m.user_id = $1 and g.badge_tag is not null
     order by m.joined_at`,
    [userId],
  );
  return c.json(
    result.rows.map((row) => ({
      groupId: row.group_id,
      groupName: row.name,
      badge: { emoji: row.badge_emoji, tag: row.badge_tag, color: row.badge_color },
      position: row.position,
    })),
  );
});

/**
 * Everything the caller could wear: their group badges as /badges lists
 * them, and the seals they have earned, each with where it sits among what
 * they wear, or null. /badges stays as it was for an app from before seals.
 */
badges.get("/wearables", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const [groupBadges, seals] = await Promise.all([
    pool.query<OwnBadgeRow>(
      `select g.group_id, g.name, g.badge_emoji, g.badge_tag, g.badge_color, b.position
       from group_members m
       join groups g on g.group_id = m.group_id
       left join profile_badges b on b.group_id = m.group_id and b.user_id = m.user_id
       where m.user_id = $1 and g.badge_tag is not null
       order by m.joined_at`,
      [userId],
    ),
    pool.query<{ achievement_id: string; earned_at: Date; position: number | null }>(
      `select a.achievement_id, a.earned_at, b.position
       from achievements a
       left join profile_badges b on b.user_id = a.user_id and b.achievement_id = a.achievement_id
       where a.user_id = $1
       order by a.earned_at`,
      [userId],
    ),
  ]);
  return c.json({
    badges: groupBadges.rows.map((row) => ({
      groupId: row.group_id,
      groupName: row.name,
      badge: { emoji: row.badge_emoji, tag: row.badge_tag, color: row.badge_color },
      position: row.position,
    })),
    seals: seals.rows.map((row) => ({
      seal: row.achievement_id,
      earnedAt: row.earned_at.getTime(),
      position: row.position,
    })),
  });
});

/**
 * Sets which badges the caller wears, as a list of group ids in the order to
 * show them. The whole list each time, so there is no half-changed state to
 * reason about. A group they are not in, or one without a badge, is refused.
 */
badges.put("/badges", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body: unknown = await c.req.json().catch(() => null);
  // `worn` holds group ids and seal ids together; `groupIds` is what an app
  // from before seals sends, and means the same with only badges in it.
  const list =
    typeof body === "object" && body !== null
      ? "worn" in body
        ? body.worn
        : "groupIds" in body
          ? body.groupIds
          : null
      : null;
  if (
    !Array.isArray(list) ||
    list.length > BADGES_WORN_MAX ||
    !list.every((id) => typeof id === "string" && (isUuid(id) || isSealId(id))) ||
    new Set(list).size !== list.length
  ) {
    return refuse(c, "invalid");
  }
  const ids = list as string[];
  const groupIds = ids.filter((id) => isUuid(id));
  const sealIds = ids.filter((id) => !isUuid(id));

  // Every badge has to be from a group the caller is in, and every seal one they earned.
  const [wearableGroups, earnedSeals] = await Promise.all([
    pool.query<{ count: string }>(
      `select count(*) from group_members m join groups g on g.group_id = m.group_id
       where m.user_id = $1 and m.group_id = any($2::uuid[]) and g.badge_tag is not null`,
      [userId, groupIds],
    ),
    pool.query<{ count: string }>(
      "select count(*) from achievements where user_id = $1 and achievement_id = any($2::text[])",
      [userId, sealIds],
    ),
  ]);
  if (Number(wearableGroups.rows[0]?.count ?? 0) !== groupIds.length) return refuse(c, "not-found");
  if (Number(earnedSeals.rows[0]?.count ?? 0) !== sealIds.length) return refuse(c, "not-found");

  await inTransaction(async (client) => {
    await client.query("delete from profile_badges where user_id = $1", [userId]);
    for (const [position, id] of ids.entries()) {
      await client.query(
        isUuid(id)
          ? "insert into profile_badges (user_id, group_id, position) values ($1, $2, $3)"
          : "insert into profile_badges (user_id, achievement_id, position) values ($1, $2, $3)",
        [userId, id, position],
      );
    }
  });
  return c.json({ worn: ids, groupIds });
});
