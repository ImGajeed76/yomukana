// Turns stored progress into the few numbers worth showing a reader.
//
// The point of the stats page is to answer "what am I slow at", so the per
// character view is the important one and the totals are context for it.

import type { AttemptRecord } from "../db";
import { bucketFor, type Bucket } from "../selection";
import { parseItemId, type Item, type ItemStore } from "../srs";

export interface CharacterStat {
  readonly item: Item;
  readonly reviews: number;
  /** Rolling mean recognition latency, or null before the first clean read. */
  readonly meanLatencyMs: number | null;
  readonly errors: number;
  readonly bucket: Bucket;
}

/** Everything the reader has met, characters and written words, slowest first. */
export function characterStats(store: ItemStore, now: Date): CharacterStat[] {
  const stats: CharacterStat[] = [];

  for (const state of store.items.values()) {
    if (state.reviews === 0) continue;

    // An id this cannot parse comes from a version of the app that stored
    // something else. Skipping it beats showing the reader a mangled row.
    const item = parseItemId(state.id);
    if (item === null) continue;

    stats.push({
      item,
      reviews: state.reviews,
      meanLatencyMs: state.meanLatencyMs,
      errors: state.errors,
      bucket: bucketFor(state, now),
    });
  }

  // Slowest first: a reader looking at this page wants to know what to work on,
  // not to read an alphabet.
  return stats.sort((left, right) => (right.meanLatencyMs ?? 0) - (left.meanLatencyMs ?? 0));
}

export interface Totals {
  readonly sentences: number;
  readonly characters: number;
  readonly errors: number;
  /** Accepted keys over total keys across every attempt. */
  readonly accuracy: number;
  /** Characters settled per minute of typing. */
  readonly charactersPerMinute: number;
  /** Milliseconds of typing, not of sitting with the page open. */
  readonly durationMs: number;
}

export const NO_TOTALS: Totals = {
  sentences: 0,
  characters: 0,
  errors: 0,
  accuracy: 1,
  charactersPerMinute: 0,
  durationMs: 0,
};

const MS_PER_MINUTE = 60_000;

export function totalsOf(attempts: readonly AttemptRecord[]): Totals {
  if (attempts.length === 0) return NO_TOTALS;

  let characters = 0;
  let errors = 0;
  let keys = 0;
  let durationMs = 0;

  for (const attempt of attempts) {
    characters += attempt.segments;
    errors += attempt.errors;
    keys += attempt.keyCount;
    durationMs += attempt.durationMs;
  }

  return {
    sentences: attempts.length,
    characters,
    errors,
    accuracy: keys === 0 ? 1 : (keys - errors) / keys,
    charactersPerMinute: durationMs === 0 ? 0 : (characters / durationMs) * MS_PER_MINUTE,
    durationMs,
  };
}
