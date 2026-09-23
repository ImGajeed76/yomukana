// Everything the app knows about one reader: their per-item schedules and the
// typing baseline their grades are measured against.
//
// A plain value with no storage in it. `db/` persists it and hands it back.

import type { Segment } from "../romaji";
import {
  INITIAL_READER,
  gradeReview,
  isPlausibleLatency,
  updateReader,
  type InputMethod,
  type ReaderModel,
} from "./grade";
import { itemForSegment, type Item, type ItemId } from "./item";
import { newItemState, reviewItem, type ItemState } from "./schedule";

export interface ItemStore {
  readonly items: ReadonlyMap<ItemId, ItemState>;
  readonly reader: ReaderModel;
}

export const EMPTY_STORE: ItemStore = {
  items: new Map<ItemId, ItemState>(),
  reader: INITIAL_READER,
};

/** One segment's measurement, already stripped of anything a backspace touched. */
export interface TimedSegment {
  /** Index into the sentence's segments. */
  readonly segment: number;
  readonly latencyMs: number;
  readonly errors: number;
}

export interface Review {
  readonly item: Item;
  readonly latencyMs: number;
  readonly errors: number;
}

/**
 * Pairs each measurement with the item it tested.
 *
 * A sentence can test the same item more than once. Each occurrence is its own
 * review, because reading か twice in one sentence is two reads, and the second
 * one being faster is exactly the signal worth keeping.
 */
export function reviewsFor(segments: readonly Segment[], timed: readonly TimedSegment[]): Review[] {
  const reviews: Review[] = [];

  for (const timing of timed) {
    const segment = segments[timing.segment];
    if (segment === undefined) continue;
    const item = itemForSegment(segment);
    if (item === null) continue;

    reviews.push({ item, latencyMs: timing.latencyMs, errors: timing.errors });
  }
  return reviews;
}

/** One written word and the stretch of segments the reader typed for it. */
export interface WordSpan {
  readonly item: Item;
  /** First segment of the word. */
  readonly from: number;
  /** One past the last segment of the word. */
  readonly to: number;
}

/**
 * Reviews for the words shown in their written form.
 *
 * The recognition time for 学校 is the pause before its first keystroke: that is
 * where the reader worked out what the kanji said. Everything after is them
 * spelling out a reading they had already recovered. Errors anywhere in the word
 * count against it, because a wrong key halfway through means the reading was
 * not as recovered as it looked.
 *
 * A word whose first segment was not cleanly measured is skipped rather than
 * guessed at.
 */
export function reviewsForWords(
  words: readonly WordSpan[],
  timed: readonly TimedSegment[],
): Review[] {
  const bySegment = new Map<number, TimedSegment>();
  for (const timing of timed) bySegment.set(timing.segment, timing);

  const reviews: Review[] = [];
  for (const word of words) {
    // The first segment of a sentence is never a measurement, so a word that
    // starts one used to be skipped entirely: 私は, 今日は and 彼は stayed
    // unread forever, permanently new to the selector and burning the reveal
    // budget in every sentence they turned up in. Any timed segment inside the
    // word is enough to say the reader read it.
    let first: TimedSegment | undefined;
    let wasWrong = false;
    for (let segment = word.from; segment < word.to; segment++) {
      const timing = bySegment.get(segment);
      if (timing === undefined) continue;
      first ??= timing;
      if (timing.errors > 0) wasWrong = true;
    }
    if (first === undefined) continue;

    // One, not one per mora. Summed, a five-mora word collected five times the
    // errors of a kana for the same mistake, and scored worse for being longer.
    reviews.push({ item: word.item, latencyMs: first.latencyMs, errors: wasWrong ? 1 : 0 });
  }
  return reviews;
}

/** Applies a sentence's worth of reviews, in order. */
/**
 * Folds one attempt's reviews into the store.
 *
 * `method` is how the reader typed it. It picks which baseline each review is
 * graded against and which motor floor comes off before the reading time is
 * kept.
 */
export function applyReviews(
  store: ItemStore,
  reviews: readonly Review[],
  now: Date,
  method: InputMethod = "keyboard",
): ItemStore {
  const items = new Map(store.items);
  let reader = store.reader;

  for (const review of reviews) {
    const existing = items.get(review.item.id) ?? newItemState(review.item.id, now);
    const grade = gradeReview(review.latencyMs, review.errors, reader, method);
    const latency = isPlausibleLatency(review.latencyMs) ? review.latencyMs : null;

    items.set(review.item.id, {
      ...reviewItem(existing, grade, latency, reader[method].floorMs, now),
      // One per read that went wrong, however many keys went wrong in it. Once
      // a reader has slipped, every key after the slip lands as a mistake
      // until they delete back to it, so counting keys would let one bad moment
      // outweigh a dozen clean reads of the same character.
      errors: existing.errors + Math.min(review.errors, 1),
    });

    // Only clean reads shape the baseline, and only single characters. A word
    // review reuses the latency of the first mora in it, so letting words in
    // too would weigh that one measurement twice, and it is always one of the
    // slowest in the sentence. The baseline every other grade is normalised
    // against would drift upward for no reason but kanji being present.
    if (review.errors === 0 && review.item.kind === "kana") {
      reader = updateReader(reader, review.latencyMs, method);
    }
  }

  return { items, reader };
}

/** The state of one item, or a fresh one if the reader has never seen it. */
export function itemState(store: ItemStore, id: ItemId, now: Date): ItemState {
  return store.items.get(id) ?? newItemState(id, now);
}
