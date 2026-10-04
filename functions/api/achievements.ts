// Achievements: which seals a reader has earned, worked out here from what
// the server holds, never taken from the app's word for it.
//
// Reading seals come from the reader's synced sentences, counted by day in
// Postgres in the reader's own time zone, so a long history is a few hundred
// rows here rather than every sentence. Marathon seals come from final
// results, so a marathon that ended before these seals existed counts too.
// The people seals come from group joins and follows, the account seals from
// when the account was made.
// Rules: src/lib/sync/seal-rules.ts. Once earned, a seal is kept.

import { Hono } from "hono";
import { FASTEST_KEY_MS, sealsEarned, type SealFacts } from "../../src/lib/sync/seal-rules";
import { DAY_GOAL, readingDayIn, streakOfDays } from "../../src/lib/stats/streak";
import { MARATHON_MIN_SENTENCES, PODIUM_MIN_RUNNERS } from "../../src/lib/sync/marathon-rules";
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
 * Whether a synced sentence is one a person could have typed: finished no
 * later than now, and no faster than FASTEST_KEY_MS a key. A condition on a
 * row's `finished_at` and `record`, with the key time as parameter `param`.
 */
function isTypedByAPerson(param: string): string {
  return `finished_at <= now() + interval '5 minutes'
    and jsonb_typeof(record->'durationMs') = 'number'
    and jsonb_typeof(record->'keyCount') = 'number'
    and jsonb_typeof(record->'errors') = 'number'
    and (record->>'keyCount')::numeric > 0
    and (record->>'durationMs')::numeric >= (record->>'keyCount')::numeric * ${param}`;
}

/**
 * Sentences a day, by the reader's day: in their time zone, turning at 4 am
 * as the streak does, on their own track and in marathons together, only
 * those a person could have typed.
 */
async function daysOf(userId: string, timeZone: string): Promise<DayRow[]> {
  const result = await pool.query<DayRow>(
    `select
       (extract(epoch from ((finished_at at time zone $2) - interval '4 hours')::date) / 86400)::int as day,
       count(*) as sentences,
       count(*) filter (where (record->>'errors')::numeric = 0) as perfect
     -- Sentences read in marathons count as well: reading is reading.
     from (
       select finished_at, record from attempts where user_id = $1
       union all
       select finished_at, record from marathon_attempts where user_id = $1
     ) a
     where ${isTypedByAPerson("$3")}
     group by 1`,
    [userId, timeZone, FASTEST_KEY_MS],
  );
  return result.rows;
}

interface MarathonRow {
  wins: string;
  podiums: string;
  finished: string;
}

/**
 * The reader's marathons with final results, counted three ways. A runner
 * counts as having run one once they read MARATHON_MIN_SENTENCES in it that
 * a person could have typed. Places come from the score at the end, as the
 * board's do, among everyone who ran, with ties sharing the place; they
 * earn seals only in a marathon with PODIUM_MIN_RUNNERS who really ran.
 */
async function marathonsOf(userId: string): Promise<MarathonRow> {
  const result = await pool.query<MarathonRow>(
    `with mine as (
       select r.marathon_id from marathon_members m
       join marathons r on r.marathon_id = m.marathon_id
       where m.user_id = $1 and m.entered_at is not null
         and now() >= r.ends_at + make_interval(mins => r.results_delay_minutes)
     ),
     runners as (
       select m.marathon_id, m.user_id, m.end_score,
         (select count(*) from marathon_attempts a
          where a.marathon_id = m.marathon_id and a.user_id = m.user_id
            and ${isTypedByAPerson("$2")}) as sentences
       from marathon_members m join mine on mine.marathon_id = m.marathon_id
       where m.entered_at is not null
     ),
     placed as (
       select user_id, sentences,
         rank() over (partition by marathon_id order by round(end_score) desc) as place,
         count(*) filter (where sentences >= $3) over (partition by marathon_id) as real_runners
       from runners
     )
     select
       count(*) filter (where place = 1 and real_runners >= $4) as wins,
       count(*) filter (where place <= 3 and real_runners >= $4) as podiums,
       count(*) as finished
     from placed
     where user_id = $1 and sentences >= $3`,
    [userId, FASTEST_KEY_MS, MARATHON_MIN_SENTENCES, PODIUM_MIN_RUNNERS],
  );
  return result.rows[0] ?? { wins: "0", podiums: "0", finished: "0" };
}

/** Everything a seal is earned from, for one reader. Null when they have no profile. */
async function factsOf(userId: string, timeZone: string, now: number): Promise<SealFacts | null> {
  const [days, marathons, invited, followers, account] = await Promise.all([
    daysOf(userId, timeZone),
    marathonsOf(userId),
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
    marathonWins: Number(marathons.wins),
    marathonPodiums: Number(marathons.podiums),
    marathonsFinished: Number(marathons.finished),
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
