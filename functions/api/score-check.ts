// Whether a new score is one a real reader could have reached.
//
// The score is worked out on the reader's device, so the server cannot
// check the arithmetic. What it can check is the speed: nobody's score rises
// faster than the fastest plausible reader's does, practising all day. So a
// new score is compared with where the same reader stood ten minutes, an
// hour and a day earlier, by the server's own clock, and refused when it rose
// faster than that. A drop is always fine: scores fall when people stop.
//
// Time spent offline counts. The allowance for each window grows with the
// time since the score it is compared with, so three days of practice with no
// signal can go up in one sync, as long as three days could have produced it.
//
// Pure, so every rule here is pinned by a test. See score-check.test.ts.

/** One limit: the most a score may rise within `windowMs`. */
export interface GainLimit {
  readonly windowMs: number;
  readonly maxGain: number;
}

export interface ScoreLimits {
  readonly gains: readonly GainLimit[];
  /** The highest score anyone can have: every item known perfectly, read as fast as is believable. */
  readonly ceiling: number;
}

/** A score the server accepted, and when, by its own clock. */
export interface AcceptedScore {
  readonly score: number;
  readonly at: number;
}

export type ScoreVerdict = "accept" | "implausible";

/**
 * Judges a new score.
 *
 * `history` is what was accepted before, oldest first, starting with a score
 * of 0 when the account was made. That first entry is what keeps a brand-new
 * account from arriving with a year's worth of points: whatever it sends is
 * compared with nothing, at the moment it signed up.
 */
export function judgeScore(
  score: number,
  now: number,
  history: readonly AcceptedScore[],
  limits: ScoreLimits,
): ScoreVerdict {
  if (!Number.isFinite(score) || score < 0 || score > limits.ceiling) return "implausible";
  const first = history[0];
  const last = history.at(-1);
  if (first === undefined || last === undefined) return "implausible";
  if (score <= last.score) return "accept";

  for (const limit of limits.gains) {
    // Where the reader stood at the start of this window: the last score
    // accepted before it began, or the account's start when there is none.
    let baseline = first;
    for (const entry of history) {
      if (entry.at <= now - limit.windowMs) baseline = entry;
    }
    const elapsed = Math.max(0, now - baseline.at);
    // At least a whole window's allowance, and more for every window since.
    const allowed = limit.maxGain * Math.max(1, elapsed / limit.windowMs);
    if (score - baseline.score > allowed) return "implausible";
  }
  return "accept";
}
