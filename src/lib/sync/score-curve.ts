// A score as it is now, not as it was when it was last sent.
//
// A score falls when someone stops reading, and only their own device can work
// out by how much, so a card or a board line would otherwise keep the score of
// their last sync forever. So a sync also sends, now and then, the score the
// device expects on each of the days in CURVE_DAYS if nothing more is read.
// Between those, a board draws straight lines, and the next sync replaces the
// lot with the real number. The real fall is a curve, so the lines are a
// little off in between and right at each point.
//
// Shared by the app and the API function, and mirrored in SQL by live_score
// (drizzle/migrations/0032_score_curve.sql) so boards rank by the same number
// they show. Pure, so the rules are pinned in tests.

/** Days after the curve was worked out that it gives a score for. Closer together early, where it falls fastest. */
export const CURVE_DAYS = [1, 3, 7, 14, 30, 90] as const;

/** How often the device works the curve out: it costs six scores, and changes slowly. */
export const CURVE_EVERY_MS = 10 * 60_000;

const DAY_MS = 86_400_000;

/** A score as stored: the number last sent, and the curve last sent with one. */
export interface ScoreLine {
  readonly score: number;
  /** When the score was sent, in epoch milliseconds, or null if it never was. */
  readonly scoredAt: number | null;
  /** The scores on CURVE_DAYS, or null before the first curve. */
  readonly curve: readonly number[] | null;
  /** When the curve was worked out, in epoch milliseconds. */
  readonly curveAt: number | null;
}

/**
 * Whether `curve` can be stored with `score`: one number for each of
 * CURVE_DAYS, none above the score and none above the one before. Nothing
 * read means nothing gained, and a curve that rose would show a score the
 * score check never saw.
 */
export function isCurveFor(curve: unknown, score: number): curve is number[] {
  if (!Array.isArray(curve) || curve.length !== CURVE_DAYS.length) return false;
  let ceiling = score;
  for (const point of curve) {
    if (typeof point !== "number" || !Number.isFinite(point) || point < 0 || point > ceiling) {
      return false;
    }
    ceiling = point;
  }
  return true;
}

/**
 * The score at `now`: from the last one sent, along straight lines to each
 * point of the curve still ahead of it, and the last point after that. The
 * curve may be older than the score, sent with an earlier sync, so each point
 * is held at or under the one before it and the score itself: a line never
 * rises.
 */
export function scoreAt(line: ScoreLine, now: number): number {
  const { score, scoredAt, curve, curveAt } = line;
  if (scoredAt === null || curve === null || curveAt === null || now <= scoredAt) return score;
  let fromAt = scoredAt;
  let fromScore = score;
  for (const [index, days] of CURVE_DAYS.entries()) {
    const at = curveAt + days * DAY_MS;
    if (at <= scoredAt) continue;
    const point = Math.min(curve[index] ?? fromScore, fromScore);
    if (now <= at) return fromScore + ((point - fromScore) * (now - fromAt)) / (at - fromAt);
    fromAt = at;
    fromScore = point;
  }
  return fromScore;
}
