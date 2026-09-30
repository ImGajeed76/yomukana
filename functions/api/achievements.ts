// Achievements: which seals a reader has earned, worked out here from what
// the server holds, never taken from the app's word for it.
//
// Reading seals come from the reader's synced sentences, counted by day in
// Postgres in the reader's own time zone, so a long history is a few hundred
// rows here rather than every sentence. The people seals come from group
// joins and follows, the account seals from when the account was made.
// Rules: src/lib/sync/seal-rules.ts. Once earned, a seal is kept.

import { Hono } from "hono";
import { FASTEST_KEY_MS, sealsEarned, type SealFacts } from "../../src/lib/sync/seal-rules";
import { DAY_GOAL, readingDayIn, streakOfDays } from "../../src/lib/stats/streak";
import { readerOf } from "./auth";
import { pool } from "./db";
import { refuse } from "./problems";

/** The reader's time zone if it is one, otherwise UTC, which is always one. */
function timeZoneFrom(value: unknown): string {
  if (typeof value !== "string") return "UTC";
  return Intl.supportedValuesOf("timeZone").includes(value) ? value : "UTC";
}

interface DayRow {
  day: number;
  sentences: string;
  perfect: string;
}

/**
 * Sentences a day, by the reader's day: in their time zone, turning at 4 am
 * as the streak does. Only sentences a person could have typed: finished no
 * later than now, and no faster than FASTEST_KEY_MS a key.
 */
async function daysOf(userId: string, timeZone: string): Promise<DayRow[]> {
  const result = await pool.query<DayRow>(
    `select
       (extract(epoch from ((finished_at at time zone $2) - interval '4 hours')::date) / 86400)::int as day,
       count(*) as sentences,
       count(*) filter (where (record->>'errors')::numeric = 0) as perfect
     from attempts
     where user_id = $1
       and finished_at <= now() + interval '5 minutes'
       and jsonb_typeof(record->'durationMs') = 'number'
       and jsonb_typeof(record->'keyCount') = 'number'
       and jsonb_typeof(record->'errors') = 'number'
       and (record->>'keyCount')::numeric > 0
       and (record->>'durationMs')::numeric >= (record->>'keyCount')::numeric * $3
     group by 1`,
    [userId, timeZone, FASTEST_KEY_MS],
  );
  return result.rows;
}

/** Everything a seal is earned from, for one reader. Null when they have no profile. */
async function factsOf(userId: string, timeZone: string, now: number): Promise<SealFacts | null> {
  const [days, invited, followers, account] = await Promise.all([
    daysOf(userId, timeZone),
    // People in groups the reader runs, other than the reader.
    pool.query<{ count: string }>(
      `select count(distinct m.user_id) from group_members m
       join group_members mine on mine.group_id = m.group_id
         and mine.user_id = $1 and mine.role = 'admin'
       where m.user_id <> $1`,
      [userId],
    ),
    pool.query<{ count: string }>("select count(*) from friends where followee_id = $1", [userId]),
    pool.query<{ created_at: Date }>(
      `select u."createdAt" as created_at from neon_auth."user" u
       join profiles p on p.user_id = u.id::text
       where p.user_id = $1`,
      [userId],
    ),
  ]);
  const joinedAt = account.rows[0]?.created_at;
  if (joinedAt === undefined) return null;

  const counts = new Map<number, number>();
  let sentences = 0;
  let perfectSentences = 0;
  let daysRead = 0;
  for (const row of days) {
    const count = Number(row.sentences);
    counts.set(row.day, count);
    sentences += count;
    perfectSentences += Number(row.perfect);
    if (count >= DAY_GOAL) daysRead += 1;
  }
  const streak = streakOfDays(counts, readingDayIn(timeZone)(now), now);

  return {
    longestStreak: streak.longest,
    daysRead,
    sentences,
    perfectSentences,
    invited: Number(invited.rows[0]?.count ?? 0),
    followers: Number(followers.rows[0]?.count ?? 0),
    joinedAt: joinedAt.getTime(),
    now,
  };
}

export const achievements = new Hono();

/**
 * Checks what the caller has earned, awards anything new, and answers with
 * every seal they have, the ones just earned, and the facts they came from,
 * so the app can say how far the next one is.
 */
achievements.post("/achievements", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body: unknown = await c.req.json().catch(() => null);
  const timeZone = timeZoneFrom(
    typeof body === "object" && body !== null && "timeZone" in body ? body.timeZone : undefined,
  );

  const now = Date.now();
  const facts = await factsOf(userId, timeZone, now);
  if (facts === null) return refuse(c, "not-found");

  // 始 is dated from the day the account was made, everything else from now.
  const fresh = await pool.query<{ achievement_id: string }>(
    `insert into achievements (user_id, achievement_id, earned_at)
     select $1, id, case when id = 'joined' then $3 else now() end
     from unnest($2::text[]) as id
     on conflict do nothing
     returning achievement_id`,
    [userId, sealsEarned(facts), new Date(facts.joinedAt)],
  );
  const all = await pool.query<{ achievement_id: string; earned_at: Date }>(
    "select achievement_id, earned_at from achievements where user_id = $1 order by earned_at",
    [userId],
  );

  return c.json({
    seals: all.rows.map((row) => ({ seal: row.achievement_id, earnedAt: row.earned_at.getTime() })),
    fresh: fresh.rows.map((row) => row.achievement_id),
    facts,
  });
});
