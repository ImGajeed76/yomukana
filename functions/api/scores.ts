// Scores: the one number other readers see, and the global leaderboard.
//
// A score arrives here after each sync and is kept only if a real reader
// could have reached it. See score-check.ts for the rule. A refused score is
// simply not published: the boards keep the last one that made sense, and
// the reader's own device, which is the source of truth, is not touched.

import { Hono } from "hono";
import {
  SCORE_CEILING,
  SCORE_GAIN_MAX_PER_10_MIN,
  SCORE_GAIN_MAX_PER_DAY,
  SCORE_GAIN_MAX_PER_HOUR,
} from "../../src/lib/sync/score-limits";
import { readerOf } from "./auth";
import { pool } from "./db";
import { refuse } from "./problems";
import { profileOf, type ProfileRow } from "./profiles";
import { judgeScore, type AcceptedScore, type ScoreLimits } from "./score-check";

const MINUTE = 60_000;

const LIMITS: ScoreLimits = {
  gains: [
    { windowMs: 10 * MINUTE, maxGain: SCORE_GAIN_MAX_PER_10_MIN },
    { windowMs: 60 * MINUTE, maxGain: SCORE_GAIN_MAX_PER_HOUR },
    { windowMs: 24 * 60 * MINUTE, maxGain: SCORE_GAIN_MAX_PER_DAY },
  ],
  ceiling: SCORE_CEILING,
};

/**
 * How long accepted scores are kept. The longest check looks back a day, so
 * two is plenty, and the newest is always kept however old it is.
 */
const KEEP_INTERVAL = "2 days";

/** How many readers the global board shows. */
const GLOBAL_BOARD_SIZE = 100;

export const scores = new Hono();

/**
 * Takes the caller's new score, if it is plausible. 200 with the profile when
 * it is kept, 422 when it is not.
 */
scores.post("/score", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body: unknown = await c.req.json().catch(() => null);
  const score =
    typeof body === "object" && body !== null && "score" in body ? Number(body.score) : Number.NaN;

  // When the account was made, by the auth service's clock: the start every
  // score is measured from. Plus what was accepted since.
  const [account, accepted] = await Promise.all([
    pool.query<{ created_at: Date }>(
      `select "createdAt" as created_at from neon_auth."user" where id::text = $1`,
      [userId],
    ),
    pool.query<{ score: number; accepted_at: Date }>(
      "select score, accepted_at from score_submissions where user_id = $1 order by accepted_at",
      [userId],
    ),
  ]);
  const createdAt = account.rows[0]?.created_at;
  if (createdAt === undefined) return refuse(c, "not-found");

  const history: AcceptedScore[] = [
    { score: 0, at: createdAt.getTime() },
    ...accepted.rows.map((row) => ({ score: row.score, at: row.accepted_at.getTime() })),
  ];
  // The time comes from Postgres, like the timestamps in the log, so the two
  // never disagree about what "ten minutes ago" means.
  const clock = await pool.query<{ now: Date }>("select now()");
  const now = clock.rows[0]?.now.getTime() ?? Date.now();
  if (judgeScore(score, now, history, LIMITS) === "implausible") {
    return refuse(c, "implausible");
  }

  const updated = await pool.query<ProfileRow>(
    "update profiles set score = $1, scored_at = now() where user_id = $2 returning *",
    [score, userId],
  );
  const row = updated.rows[0];
  if (row === undefined) return refuse(c, "not-found");
  await pool.query("insert into score_submissions (user_id, score) values ($1, $2)", [
    userId,
    score,
  ]);
  await pool.query(
    `delete from score_submissions
     where user_id = $1 and accepted_at < now() - $2::interval
       and accepted_at < (select max(accepted_at) from score_submissions where user_id = $1)`,
    [userId, KEEP_INTERVAL],
  );
  return c.json(profileOf(row));
});

interface GlobalRow extends ProfileRow {
  rank: string;
}

function lineOf(row: GlobalRow, viewer: string | null): Record<string, unknown> {
  return {
    ...profileOf(row),
    rank: Number(row.rank),
    isYou: row.user_id === viewer,
  };
}

/**
 * The global leaderboard: the best listed readers, and the caller's own line
 * if they are listed but further down. Anyone may look, signed in or not, and
 * so may a screen showing it: everyone on it chose to be.
 */
scores.get("/global", async (c) => {
  const viewer = await readerOf(c.req.raw);
  const ranked = `select p.*, rank() over (order by p.score desc) as rank
                  from profiles p where p.is_listed`;
  const [top, own] = await Promise.all([
    pool.query<GlobalRow>(`${ranked} order by p.score desc, p.username limit $1`, [
      GLOBAL_BOARD_SIZE,
    ]),
    viewer === null
      ? Promise.resolve(null)
      : pool.query<GlobalRow>(`select * from (${ranked}) listed where user_id = $1`, [viewer]),
  ]);
  const ownRow = own?.rows[0];
  const isOwnShown = ownRow === undefined || top.rows.some((row) => row.user_id === viewer);
  return c.json({
    lines: top.rows.map((row) => lineOf(row, viewer)),
    you: isOwnShown ? null : lineOf(ownRow, viewer),
  });
});
