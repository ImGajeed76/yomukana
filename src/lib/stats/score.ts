// One number for how well someone reads.
//
// The reader asked for something they can compare with someone else at a glance,
// so it has no ceiling: it is a sum over everything they know, not a percentage
// of a fixed syllabary. Learning one more kanji reading always adds to it, which
// is the property that keeps it comparable between a beginner and someone three
// years in.
//
// What a point means, in one sentence: one character you recognise at a normal
// pace, without mistakes, and still recognise a week later.

import { parseItemId, type ItemStore } from "../srs";
import { dayKey } from "../time";
import { carryForward, type DailyPoint } from "./series";

/** Points for one kana read at the reference pace and holding. */
const KANA_POINTS = 10;
/**
 * Points for one kanji word. Worth more than a kana because a reading has to be
 * learned per word: 生 in 生きる is not 生 in 学生. See CLAUDE.md 2.
 */
const WORD_POINTS = 25;

/**
 * The pace a point is defined against, in milliseconds of recognition.
 *
 * Fixed rather than taken from the reader's own baseline: a score that
 * normalises against the reader cannot be compared with anyone else's, which is
 * the whole point of having one.
 */
const REFERENCE_MS = 600;
const SLOWEST_CREDIT = 0.25;
const FASTEST_CREDIT = 2.5;

/** Days of FSRS stability at which an item counts as fully learned. */
const STICKS_AFTER_DAYS = 7;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * How much one item is worth right now.
 *
 * Three things have to be true for full credit, and each one scales it rather
 * than gating it: the reader recognises it, recognises it quickly, and still
 * will next week. An item read once and never again decays out of the score the
 * same way it decays out of memory, which is what stops the number from being a
 * record of everything ever seen.
 */
function pointsFor(
  base: number,
  meanLatencyMs: number | null,
  errors: number,
  reviews: number,
  stabilityDays: number,
): number {
  if (reviews === 0) return 0;

  const pace = clamp(
    REFERENCE_MS / (meanLatencyMs ?? REFERENCE_MS),
    SLOWEST_CREDIT,
    FASTEST_CREDIT,
  );
  const accuracy = reviews / (reviews + errors);
  const holds = Math.min(1, stabilityDays / STICKS_AFTER_DAYS);

  return base * pace * accuracy * holds;
}

/** The reader's score: every item they know, weighted by how well they know it. */
export function scoreOf(store: ItemStore): number {
  let points = 0;

  for (const state of store.items.values()) {
    const item = parseItemId(state.id);
    if (item === null) continue;

    points += pointsFor(
      item.kind === "kana" ? KANA_POINTS : WORD_POINTS,
      state.meanLatencyMs,
      state.errors,
      state.reviews,
      state.card.stability,
    );
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
