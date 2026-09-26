// Where the caller stands on every board they are on, in one request.
//
// The leaderboards page shows a place on each board at once. Fetching every
// board to count places in it would be one round trip to Frankfurt per board,
// and each is about half a second from Japan. So Postgres works the places out
// (the views in drizzle/migrations/0015_standings_views.sql) and this hands
// back only the caller's own line from each.

import { Hono } from "hono";
import { readerOf } from "./auth";
import { pool } from "./db";
import { refuse } from "./problems";

export const boards = new Hono();

interface Standing {
  rank: string;
  size: string;
}

boards.get("/boards", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");

  const [following, global, listed, groups] = await Promise.all([
    // Personal to the caller, so not a view: them and the people they follow.
    pool.query<Standing>(
      `with circle as (
         select user_id, score from profiles
         where user_id = $1
            or user_id in (select followee_id from friends where follower_id = $1)
       )
       select rank, size from (
         select user_id, rank() over (order by score desc) as rank, count(*) over () as size
         from circle
       ) ranked
       where user_id = $1`,
      [userId],
    ),
    pool.query<{ rank: string }>("select rank from global_standings where user_id = $1", [userId]),
    pool.query<{ count: string }>("select count(*) from profiles where is_listed"),
    pool.query<{
      group_id: string;
      name: string;
      role: "admin" | "member";
      rank: string;
      member_count: string;
    }>(
      `select s.group_id, g.name, s.role, s.rank, s.member_count
       from group_standings s join groups g on g.group_id = s.group_id
       where s.user_id = $1
       order by s.joined_at`,
      [userId],
    ),
  ]);

  const own = following.rows[0];
  return c.json({
    following: { rank: Number(own?.rank ?? 1), size: Number(own?.size ?? 1) },
    global: {
      // Null when they are not on it: nobody is until they choose to be.
      rank: global.rows[0] === undefined ? null : Number(global.rows[0].rank),
      size: Number(listed.rows[0]?.count ?? 0),
    },
    groups: groups.rows.map((row) => ({
      id: row.group_id,
      name: row.name,
      role: row.role,
      rank: Number(row.rank),
      size: Number(row.member_count),
    })),
  });
});
