// Group badges: which ones a reader wears, and looking them up for a board.
//
// A group's admin makes its badge (see groups.ts). Here a member chooses which
// of the badges they have to wear, up to three. Wearing is tied to membership
// in the database, so leaving a group takes its badge off without any code
// here. See drizzle/schema.ts.

import { Hono } from "hono";
import { BADGES_WORN_MAX, type Badge } from "../../src/lib/sync/badge-rules";
import type { CardColor } from "../../src/lib/sync/profile-rules";
import { readerOf } from "./auth";
import { isUuid } from "./codes";
import { inTransaction, pool } from "./db";
import { refuse } from "./problems";

interface WornRow {
  user_id: string;
  emoji: string | null;
  tag: string;
  color: CardColor;
}

/**
 * The badges each of these readers wears, in the order they chose, for putting
 * on their lines. One query for a whole board.
 */
export async function badgesFor(userIds: readonly string[]): Promise<Map<string, Badge[]>> {
  const worn = new Map<string, Badge[]>();
  if (userIds.length === 0) return worn;
  const result = await pool.query<WornRow>(
    `select user_id, emoji, tag, color from worn_badges
     where user_id = any($1) order by user_id, position`,
    [userIds],
  );
  for (const row of result.rows) {
    const list = worn.get(row.user_id) ?? [];
    list.push({ emoji: row.emoji, tag: row.tag, color: row.color });
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
 * Sets which badges the caller wears, as a list of group ids in the order to
 * show them. The whole list each time, so there is no half-changed state to
 * reason about. A group they are not in, or one without a badge, is refused.
 */
badges.put("/badges", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body: unknown = await c.req.json().catch(() => null);
  const groupIds =
    typeof body === "object" && body !== null && "groupIds" in body ? body.groupIds : null;
  if (
    !Array.isArray(groupIds) ||
    groupIds.length > BADGES_WORN_MAX ||
    !groupIds.every((id) => typeof id === "string" && isUuid(id)) ||
    new Set(groupIds).size !== groupIds.length
  ) {
    return refuse(c, "invalid");
  }
  const ids = groupIds as string[];

  // Every one of them has to be a group the caller is in, with a badge.
  const wearable = await pool.query<{ count: string }>(
    `select count(*) from group_members m join groups g on g.group_id = m.group_id
     where m.user_id = $1 and m.group_id = any($2::uuid[]) and g.badge_tag is not null`,
    [userId, ids],
  );
  if (Number(wearable.rows[0]?.count ?? 0) !== ids.length) return refuse(c, "not-found");

  await inTransaction(async (client) => {
    await client.query("delete from profile_badges where user_id = $1", [userId]);
    await client.query(
      `insert into profile_badges (user_id, group_id, position)
       select $1, chosen.group_id, chosen.position - 1
       from unnest($2::uuid[]) with ordinality as chosen(group_id, position)`,
      [userId, ids],
    );
  });
  return c.json({ groupIds: ids });
});
