// Whether a new score is one a real reader could have reached.
//
// The score is worked out on the reader's device, so the server cannot check
// the arithmetic. What it can check is the time: nobody gets anywhere faster
// than the fastest plausible reader does, and that reader's path is measured
// (scripts/simulate/fastest-reader.ts). It is not a straight line. It climbs
// steeply on the first day, while everything is new, and then barely, so no
// single rate fits it: a rate loose enough for the first day would let a
// week-old account claim anything. The path itself is the limit.
//
// Two kinds of rise, judged differently:
//
// - A new best. It has to fit inside the account's age, so a new account
//   cannot arrive with a year's worth of points, and the step up from every
//   score accepted before has to take at least as long as the fastest reader
//   needs for that same step, so an old account cannot jump either.
// - Getting back to where they were. A score falls when someone stops, and
//   climbs back quickly when they return, because it is mostly review. That
//   is held to plain rates per ten minutes, hour and day, and only up to
//   their own best.
//
// A drop is always fine. All times are the server's, never the device's.
//
// Pure, so every rule here is pinned by a test. See score-check.test.ts.

/** One limit: the most a score may rise within `windowMs`. */
export interface GainLimit {
  readonly windowMs: number;
  readonly maxGain: number;
}

export interface ScoreLimits {
  /** How fast a score may climb back to a best it has had before. */
  readonly relearning: readonly GainLimit[];
  /** The least time, in milliseconds, the fastest plausible reader needs to reach `score` from nothing. */
  readonly leastTimeTo: (score: number) => number;
  /**
   * The latest time the fastest path still stands at `score`, where a step
   * up from it starts: the end of a break or a night, if it took one there.
   */
  readonly lastTimeAt: (score: number) => number;
  /**
   * How long ago a score must have been accepted for the step up from it to
   * be held to the path. Over a few sentences, how fast a score grows
   * depends on which sentences come up, not on the reader, so shorter steps
   * are left to the relearning limits.
   */
  readonly shortestStepMs: number;
}

/** A score the server accepted, and when, by its own clock. */
export interface AcceptedScore {
  readonly score: number;
  readonly at: number;
  /** The best accepted up to and including this one. */
  readonly best: number;
}

/** What the server knows about a reader's scores so far. */
export interface ScoreRecord {
  /** When the account was made. Every path starts here, at nothing. */
  readonly createdAt: number;
  /** The best score accepted, and when, or null before the first. */
  readonly peak: AcceptedScore | null;
  /** Recently accepted scores, oldest first. */
  readonly recent: readonly AcceptedScore[];
}

export type ScoreVerdict = "accept" | "implausible";

/** Whether each relearning window allows the rise to `score` by `now`. */
function isWithinRates(
  score: number,
  now: number,
  history: readonly AcceptedScore[],
  limits: readonly GainLimit[],
): boolean {
  const first = history[0];
  if (first === undefined) return false;
  for (const limit of limits) {
    // Where the reader stood at the start of this window: the last score
    // accepted before it began, or the account's start when there is none.
    let baseline = first;
    for (const entry of history) {
      if (entry.at <= now - limit.windowMs) baseline = entry;
    }
    const elapsed = Math.max(0, now - baseline.at);
    const allowed = limit.maxGain * Math.max(1, elapsed / limit.windowMs);
    if (score - baseline.score > allowed) return false;
  }
  return true;
}

export function judgeScore(
  score: number,
  now: number,
  record: ScoreRecord,
  limits: ScoreLimits,
): ScoreVerdict {
  if (!Number.isFinite(score) || score < 0) return "implausible";

  const start: AcceptedScore = { score: 0, at: record.createdAt, best: 0 };
  const history = [start, ...record.recent];
  const last = history.at(-1) ?? start;
  if (score <= last.score) return "accept";

  const peak = record.peak ?? start;
  // Climbing back to their own best, or part of the way: as fast as review allows.
  if (!isWithinRates(Math.min(score, peak.score), now, history, limits.relearning)) {
    return "implausible";
  }
  if (score <= peak.score) return "accept";

  // A new best: along the fastest path there is, from every point the server
  // knows the reader stood at. The account's start is one, so the whole path
  // has to fit in the account's age. Each accepted score is another, placed
  // on the path by the best reached by then, since a score that dipped
  // overnight still stands for everything learned before it. One accepted
  // too recently is skipped: the path says nothing about so short a step.
  const needed = limits.leastTimeTo(score);
  for (const entry of [...history, peak]) {
    if (entry !== start && now - entry.at < limits.shortestStepMs) continue;
    const reached = entry.at >= peak.at ? Math.max(entry.best, peak.score) : entry.best;
    if (needed - limits.lastTimeAt(reached) > now - entry.at) return "implausible";
  }
  return "accept";
}
