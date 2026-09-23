// How a copy of progress from another device is folded into this one.
//
// The same rules the database enforces on its side (see
// drizzle/migrations/0001_merge_rules.sql), applied here to what comes down, so
// both ends agree on what the reader's progress is whichever direction it
// travels. Pure, so the rules can be pinned in tests.

import type { AttemptRecord, SessionRecord } from "../db";
import type { InputMethod, InputModel, ItemState, ReaderModel } from "../srs";

/** When an item was last reviewed, or zero if it never was. */
export function lastReviewOf(state: ItemState): number {
  return state.card.last_review?.getTime() ?? 0;
}

/**
 * Brings an item back from JSON.
 *
 * Dates travel as strings and FSRS needs them as dates. Only the card holds
 * any: when it is next due and when it was last seen.
 */
export function reviveItem(json: unknown): ItemState {
  const state = json as ItemState & {
    card: ItemState["card"] & { due: string | Date; last_review?: string | Date };
  };
  return {
    ...state,
    card: {
      ...state.card,
      due: new Date(state.card.due),
      last_review:
        state.card.last_review === undefined ? undefined : new Date(state.card.last_review),
    },
  };
}

/**
 * Of two copies of one item, the one reviewed most recently.
 *
 * Not a merge of the two. Each copy is a whole FSRS history folded into one
 * state, and there is no meaningful way to add half of one to half of another.
 * The copy that saw the latest review has seen the reader most recently, and
 * that is the one to keep.
 */
export function newerItem(local: ItemState | undefined, remote: ItemState): ItemState {
  if (local === undefined) return remote;
  return lastReviewOf(remote) > lastReviewOf(local) ? remote : local;
}

/** Each input kept from whichever copy has read more on it. */
export function mergeReaders(local: ReaderModel, remote: ReaderModel): ReaderModel {
  const pick = (method: InputMethod): InputModel =>
    remote[method].reviews > local[method].reviews ? remote[method] : local[method];
  return { keyboard: pick("keyboard"), touch: pick("touch") };
}

/**
 * The band and the recently read sentences, from both copies.
 *
 * The higher band, because reaching it on either device means the reader got
 * there. Streaks restart, since they described a run of sentences on one device.
 * A sentence counts as read at the latest time either device read it.
 */
export function mergeSessions(
  local: SessionRecord | null,
  remote: SessionRecord | null,
): SessionRecord | null {
  if (local === null) return remote;
  if (remote === null) return local;

  const seenAt = new Map<string, number>(local.seenAt);
  for (const [id, at] of remote.seenAt) seenAt.set(id, Math.max(at, seenAt.get(id) ?? 0));

  const band = Math.max(local.band, remote.band);
  return {
    band,
    easyStreak: band === local.band ? local.easyStreak : 0,
    hardStreak: band === local.band ? local.hardStreak : 0,
    seenAt: [...seenAt].sort((left, right) => left[1] - right[1]),
  };
}

/**
 * An attempt's name on the server.
 *
 * When it finished and which sentence it was is enough to tell two readings
 * apart, and the same on every device, so uploading one twice is harmless.
 */
export function attemptIdOf(record: AttemptRecord): string {
  return `${String(record.finishedAt)}:${record.sentenceId}`;
}
