// The FSRS wrapper. Everything that knows about cards, intervals and due dates
// lives here, so the rest of the app deals in items and latency.

import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import { dayKey } from "../time";
import { trimReading } from "./grade";
import type { ItemId } from "./item";

/** One day of reads of one item, kept so the reader can see themselves improve. */
export interface DailyLatency {
  /** The local calendar day, as YYYY-MM-DD. */
  readonly day: string;
  /** Mean recognition across that day's reads. */
  readonly latencyMs: number;
  readonly reads: number;
}

export interface ItemState {
  readonly id: ItemId;
  readonly card: Card;
  /** Clean reviews of this item. */
  readonly reviews: number;
  /** Rolling mean recognition latency for this item, in milliseconds. */
  readonly meanLatencyMs: number | null;
  /** Wrong keys against this item, over its whole history. */
  readonly errors: number;
  /**
   * Recognition by day, oldest first.
   *
   * The rolling mean above says where the reader is. This says whether they are
   * getting there. Kept a day at a time rather than a read at a time: the chart
   * that draws it is daily, a day of reads is a steadier number than any one of
   * them, and a year of days costs less to store than a fortnight of keystrokes
   * for someone who reads a lot.
   */
  readonly history: readonly DailyLatency[];
}

// One scheduler for the whole app. The parameters are FSRS defaults for now;
// tuning them needs review history this project does not have yet.
const scheduler = fsrs();

// How fast an item's own latency mean follows the latest review. Higher than the
// reader baseline because an item has far fewer reviews to average over.
const LATENCY_WEIGHT = 0.3;

/** Days of history kept per item. A year, which is the longest span on offer. */
export const HISTORY_DAYS = 365;

export function newItemState(id: ItemId, now: Date): ItemState {
  return {
    id,
    card: createEmptyCard(now),
    reviews: 0,
    meanLatencyMs: null,
    errors: 0,
    history: [],
  };
}

/** Applies one graded review to an item. */
export function reviewItem(
  state: ItemState,
  grade: Grade,
  latencyMs: number | null,
  now: Date,
): ItemState {
  const { card } = scheduler.next(state.card, now, grade);

  // Trimmed against what this character already costs, so one interrupted read
  // cannot redraw it. The grade above was worked out from the raw reading.
  const reading = latencyMs === null ? null : trimReading(latencyMs, state.meanLatencyMs);
  const meanLatencyMs =
    reading === null
      ? state.meanLatencyMs
      : (state.meanLatencyMs ?? reading) +
        LATENCY_WEIGHT * (reading - (state.meanLatencyMs ?? reading));

  return {
    id: state.id,
    card,
    reviews: state.reviews + 1,
    meanLatencyMs,
    errors: state.errors,
    history: reading === null ? state.history : withRead(state.history, reading, now),
  };
}

/**
 * Folds one read into the day it happened on.
 *
 * The day carries a running mean rather than the latest read, so one lucky
 * keystroke cannot redraw a day, and one bad one cannot either.
 */
function withRead(
  history: readonly DailyLatency[],
  latencyMs: number,
  now: Date,
): readonly DailyLatency[] {
  const day = dayKey(now);
  const last = history.at(-1);

  if (last?.day === day) {
    const reads = last.reads + 1;
    return [
      ...history.slice(0, -1),
      { day, reads, latencyMs: Math.round(last.latencyMs + (latencyMs - last.latencyMs) / reads) },
    ];
  }

  return [...history, { day, latencyMs: Math.round(latencyMs), reads: 1 }].slice(-HISTORY_DAYS);
}

/**
 * The chance the reader still knows this item right now, between 0 and 1. FSRS
 * calls this retrievability. The sentence selector uses it to find items that
 * are slipping without waiting for them to fall due.
 */
export function recallProbability(state: ItemState, now: Date): number {
  if (state.reviews === 0) return 0;
  return scheduler.get_retrievability(state.card, now, false);
}
