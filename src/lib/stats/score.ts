// One number for how well someone reads, to compare with anyone else.
//
// It is how much of real Japanese text they can read, on a scale with no top.
// Every item counts by how often it turns up in real text (text-share.ts), so
// a word on every page is worth far more than one seen once a year, and by the
// chance they still recall it, averaged over the next few days. The share of
// text they read is then put on a scale where every point is equal work:
// 1,000 points for each time they halve the words they would get stuck on.
// Going from stuck on half the words to a quarter is 1,000 points, and so is
// going from one in a hundred to one in two hundred, which takes far more.
// So the score never stops growing, and every point is harder than the last.
//
// Why this and not something else was decided by simulation, not by taste:
// scripts/simulate runs simulated people with their own hidden memory through
// the app's real practice loop, and every candidate was scored against what
// those people could really read. See scripts/simulate/README.md. In short:
//
// - Recall averaged over the next three days, not now: a week of cramming
//   looks like knowledge "now" and fades by Friday. Averaging further ahead
//   resisted cramming more but put people in the wrong order more often;
//   three days ordered them best in every simulated world.
// - No reading-speed term. A keystroke is hand plus eye, and two people whose
//   hands and eyes add up the same type the same, so speed across people
//   cannot be measured fairly from typing. Every speed term tried made a slow
//   typist or a phone reader look like a worse reader. Speed still counts
//   where it is fair: a reader's own quick reads grade Easy and last longer.
// - It falls when someone stops practising, as their reading does.

import { recallProbability, type ItemStore } from "../srs";
import { dayKey } from "../time";
import { carryForward, type DailyPoint } from "./series";
import type { TextShare } from "./text-share";

/** Points for each halving of the words a reader would get stuck on. */
const POINTS_PER_HALVING = 1000;

/** Recall is averaged over now and each of this many days ahead. */
const HORIZON_DAYS = 3;

const DAY_MS = 86_400_000;

/** Short of all of the text by this much at most, so the logarithm stays finite. */
const NEVER_ALL = 1e-9;

/**
 * The share of real text the reader reads, 0 to 1: every item they have
 * studied, weighted by how much of the text it is and by the chance they
 * recall it over the next few days.
 */
export function readingShareOf(store: ItemStore, now: Date, share: TextShare): number {
  let covered = 0;
  for (const state of store.items.values()) {
    if (state.reviews === 0) continue;
    const uses = share.usesOf.get(state.id);
    if (uses === undefined) continue;
    let recall = 0;
    for (let day = 0; day <= HORIZON_DAYS; day++) {
      recall += recallProbability(state, new Date(now.getTime() + day * DAY_MS));
    }
    covered += (uses / share.totalUses) * (recall / (HORIZON_DAYS + 1));
  }
  return Math.min(covered, 1 - NEVER_ALL);
}

/** The reader's score: 1,000 points for each halving of the words they would stumble on. */
export function scoreOf(store: ItemStore, now: Date, share: TextShare): number {
  // log2(1) is 0, and minus 0 is -0, which prints and compares as a surprise.
  const halvings = -Math.log2(1 - readingShareOf(store, now, share));
  return Math.round(POINTS_PER_HALVING * halvings) || 0;
}

export interface ScoredAttempt {
  readonly finishedAt: number;
  /** The score, on today's scale, once that sentence was graded. Older attempts have none. */
  readonly readingScore?: number;
}

/**
 * The score at the end of each of the last `days` days, oldest first.
 *
 * The last reading of a day wins, because a score is a running total: where it
 * stood when the reader stopped is where they finished the day. Only scores on
 * today's scale: attempts from before it have a number on another scale, and
 * drawing both on one line would show a fall that never happened.
 */
export function dailyScores(
  attempts: readonly ScoredAttempt[],
  days: number,
  now: Date,
): DailyPoint[] {
  const endOfDay = new Map<string, number>();

  for (const attempt of [...attempts].sort((left, right) => left.finishedAt - right.finishedAt)) {
    if (attempt.readingScore === undefined) continue;
    endOfDay.set(dayKey(new Date(attempt.finishedAt)), attempt.readingScore);
  }

  return carryForward(endOfDay, days, now);
}
