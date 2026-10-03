// A runner's marathon score, sent with each sync of the marathon's track,
// until the results are final.
//
// Two numbers, both worked out on the runner's device: the score now, and
// what it will be at the end if they read nothing more. The first is held to
// the same check as a reader's own score (score-check.ts), counted from when
// their race began rather than from when their account was made. The second
// may only be lower: forgetting is the only thing that happens to a score
// with nothing read. Places are decided by it. See liveScore in
// src/lib/sync/marathon-rules.ts.

import { Hono } from "hono";
import { resultsAt, runStart } from "../../src/lib/sync/marathon-rules";
import { readerOf } from "./auth";
import { isUuid } from "./codes";
import { pool } from "./db";
import { refuse } from "./problems";
import { judgeScore } from "./score-check";
import { LIMITS } from "./scores";

/** How long accepted scores are kept for the checks, as for the reader's own. */
const KEEP_INTERVAL = "2 days";

export const marathonScores = new Hono();

marathonScores.post("/marathons/:id/score", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const marathonId = c.req.param("id");
  if (!isUuid(marathonId)) return refuse(c, "not-found");
  const body: unknown = await c.req.json().catch(() => null);
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const score = Number(fields.score);
  const endScore = Number(fields.endScore);
  if (!Number.isFinite(endScore) || endScore < 0 || endScore > score) return refuse(c, "invalid");

  const [member, accepted, clock] = await Promise.all([
    pool.query<{
      entered_at: Date | null;
      starts_at: Date;
      ends_at: Date;
      results_delay_minutes: number;
      peak_score: number;
      peak_at: Date | null;
    }>(
      `select m.entered_at, r.starts_at, r.ends_at, r.results_delay_minutes, m.peak_score, m.peak_at
       from marathon_members m join marathons r on r.marathon_id = m.marathon_id
       where m.marathon_id = $1 and m.user_id = $2`,
      [marathonId, userId],
    ),
    pool.query<{ score: number; accepted_at: Date }>(
      `select score, accepted_at from marathon_score_submissions
       where marathon_id = $1 and user_id = $2 order by accepted_at`,
      [marathonId, userId],
    ),
    pool.query<{ now: Date }>("select now()"),
  ]);
  const row = member.rows[0];
  if (row?.entered_at == null) return refuse(c, "not-found");
  const now = clock.rows[0]?.now.getTime() ?? Date.now();
  const startsAt = row.starts_at.getTime();
  const endsAt = row.ends_at.getTime();
  // Nothing is read before the start, and the board is final once the
  // results are in.
  const final = resultsAt({ startsAt, endsAt, resultsDelay: row.results_delay_minutes });
  if (now < startsAt || now > final) return refuse(c, "expired");

  const verdict = judgeScore(
    score,
    now,
    {
      createdAt: runStart(row.entered_at.getTime(), startsAt),
      peak: row.peak_at === null ? null : { score: row.peak_score, at: row.peak_at.getTime() },
      recent: accepted.rows.map((each) => ({ score: each.score, at: each.accepted_at.getTime() })),
    },
    LIMITS,
  );
  if (verdict === "implausible") {
    await pool.query(
      "insert into score_refusals (user_id, score, marathon_id) values ($1, $2, $3)",
      [userId, score, marathonId],
    );
    return refuse(c, "implausible");
  }

  await pool.query(
    `update marathon_members set score = $1, end_score = $2, scored_at = now(),
       peak_score = greatest(peak_score, $1),
       peak_at = case when $1 > peak_score then now() else peak_at end
     where marathon_id = $3 and user_id = $4`,
    [score, endScore, marathonId, userId],
  );
  await pool.query(
    "insert into marathon_score_submissions (marathon_id, user_id, score) values ($1, $2, $3)",
    [marathonId, userId, score],
  );
  await pool.query(
    `delete from marathon_score_submissions
     where marathon_id = $1 and user_id = $2 and accepted_at < now() - $3::interval
       and accepted_at < (select max(accepted_at) from marathon_score_submissions
                          where marathon_id = $1 and user_id = $2)`,
    [marathonId, userId, KEEP_INTERVAL],
  );
  return c.body(null, 204);
});
