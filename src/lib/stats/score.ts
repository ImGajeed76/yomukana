// One number for how well someone reads.
//
// The reader asked for something they can compare with someone else at a glance,
// so it has no ceiling: it is a sum over everything they know, not a percentage
// of a fixed syllabary. Learning one more kanji reading always adds to it, which
// is the property that keeps it comparable between a beginner and someone three
// years in.
//
// It measures what the reader can read today, not what they have ever learned.
// Every item counts for the chance they would still recall it right now, so a
// character they have not seen in a year counts for about as much as they would
// get it right, and the score falls when they stop and climbs back when they
// return. A number that only ever rose would say more about how long someone
// had been using the app than about how well they read.
//
// And it measures reading, not typing. Each item's pace is its reading time:
// recognition latency with the reader's own reach for a key taken off. A fast
// typist and a slow one with the same Japanese score the same, and so does one
// reader on a phone and at a desk.
//
// What a point means, in one sentence: a tenth of a kana you would read right
// now, at a normal reading pace.

import { parseItemId, recallProbability, type ItemState, type ItemStore } from "../srs";
import { dayKey } from "../time";
import { carryForward, type DailyPoint } from "./series";

/** Points for one kana read at the reference pace and remembered. */
const KANA_POINTS = 10;
/**
 * Points for one kanji word. Worth more than a kana because a reading has to be
 * learned per word: 生 in 生きる is not 生 in 学生. See CLAUDE.md 2.
 */
const WORD_POINTS = 25;

/**
 * The reading time a point is defined against, in milliseconds.
 *
 * Reading time, not recognition latency: what is left after the reader's own
 * reach for a key is taken off. Fixed rather than taken from the reader, since
 * a score normalised against its own reader cannot be compared with anyone
 * else's, which is the whole point of having one.
 */
const REFERENCE_READING_MS = 350;

/**
 * The shortest reading time the pace will believe.
 *
 * A reading time near zero means the character was read before the key was
 * reached for, which is what knowing it cold looks like, and dividing by it
 * would hand out unbounded credit for a rounding difference.
 */
const FASTEST_BELIEVABLE_MS = 40;
const SLOWEST_CREDIT = 0.25;
const FASTEST_CREDIT = 2.5;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** How fast the reader reads this item, as a multiple of the reference. */
function paceOf(state: ItemState): number {
  // No clean reading means no evidence of pace, which is not the same as
  // evidence of average pace. It takes the slowest credit until there is one.
  if (state.meanReadingMs === null) return SLOWEST_CREDIT;

  const reading = Math.max(state.meanReadingMs, FASTEST_BELIEVABLE_MS);
  return clamp(REFERENCE_READING_MS / reading, SLOWEST_CREDIT, FASTEST_CREDIT);
}

/** The reader's score: everything they could read right now, weighted by how fast. */
export function scoreOf(store: ItemStore, now: Date): number {
  let points = 0;

  for (const state of store.items.values()) {
    if (state.reviews === 0) continue;

    const item = parseItemId(state.id);
    if (item === null) continue;

    const weight = item.kind === "kana" ? KANA_POINTS : WORD_POINTS;
    points += weight * recallProbability(state, now) * paceOf(state);
  }

  return Math.round(points);
}

export interface ScoredAttempt {
  readonly finishedAt: number;
  readonly score?: number;
}

/**
 * The score at the end of each of the last `days` days, oldest first.
 *
 * The last reading of a day wins, because a score is a running total: where it
 * stood when the reader stopped is where they finished the day.
 */
export function dailyScores(
  attempts: readonly ScoredAttempt[],
  days: number,
  now: Date,
): DailyPoint[] {
  const endOfDay = new Map<string, number>();

  for (const attempt of [...attempts].sort((left, right) => left.finishedAt - right.finishedAt)) {
    if (attempt.score === undefined) continue;
    endOfDay.set(dayKey(new Date(attempt.finishedAt)), attempt.score);
  }

  return carryForward(endOfDay, days, now);
}
