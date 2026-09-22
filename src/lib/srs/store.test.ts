import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { kanaItem } from "./item";
import { recallProbability } from "./schedule";
import { EMPTY_STORE, applyReviews, reviewsFor, type TimedSegment } from "./store";

const now = new Date("2026-01-01T00:00:00Z");

describe("reviewsFor", () => {
  test("pairs each measurement with the item it tested", () => {
    const segments = segmentKana("かさ");
    const timed: TimedSegment[] = [
      { segment: 0, latencyMs: 200, errors: 0 },
      { segment: 1, latencyMs: 900, errors: 1 },
    ];

    expect(reviewsFor(segments, timed).map((review) => review.item.id)).toEqual([
      kanaItem("か").id,
      kanaItem("さ").id,
    ]);
  });

  test("skips punctuation and characters with no spelling", () => {
    const segments = segmentKana("あ、学");
    const timed: TimedSegment[] = [
      { segment: 0, latencyMs: 200, errors: 0 },
      { segment: 1, latencyMs: 200, errors: 0 },
      { segment: 2, latencyMs: 200, errors: 0 },
    ];

    expect(reviewsFor(segments, timed)).toHaveLength(1);
  });

  test("keeps a repeated character as two separate reviews", () => {
    const segments = segmentKana("かか");
    const timed: TimedSegment[] = [
      { segment: 0, latencyMs: 900, errors: 0 },
      { segment: 1, latencyMs: 200, errors: 0 },
    ];

    const reviews = reviewsFor(segments, timed);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.latencyMs).toBe(900);
    expect(reviews[1]?.latencyMs).toBe(200);
  });
});

describe("applyReviews", () => {
  const segments = segmentKana("かさ");

  test("creates an item the first time the reader meets it", () => {
    const store = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 300, errors: 0 }]),
      now,
    );

    const state = store.items.get(kanaItem("か").id);
    expect(state).toBeDefined();
    expect(state?.reviews).toBe(1);
    expect(state?.meanLatencyMs).toBe(300);
  });

  test("schedules a failed item sooner than a comfortable one", () => {
    const store = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [
        { segment: 0, latencyMs: 300, errors: 0 },
        { segment: 1, latencyMs: 300, errors: 2 },
      ]),
      now,
    );

    const easy = store.items.get(kanaItem("か").id);
    const failed = store.items.get(kanaItem("さ").id);
    expect(easy).toBeDefined();
    expect(failed).toBeDefined();
    if (easy === undefined || failed === undefined) return;

    expect(failed.card.due.getTime()).toBeLessThan(easy.card.due.getTime());
    expect(failed.errors).toBe(2);
  });

  test("builds the baseline from clean reads only", () => {
    const clean = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 200, errors: 0 }]),
      now,
    );
    const failed = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 200, errors: 1 }]),
      now,
    );

    expect(clean.reader.reviews).toBe(1);
    expect(failed.reader.reviews).toBe(0);
    expect(failed.reader.baselineLatencyMs).toBe(EMPTY_STORE.reader.baselineLatencyMs);
  });

  test("leaves the store it was given untouched", () => {
    applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 300, errors: 0 }]),
      now,
    );
    expect(EMPTY_STORE.items.size).toBe(0);
  });

  test("reports a never-seen item as unrecallable", () => {
    const store = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 300, errors: 0 }]),
      now,
    );

    const seen = store.items.get(kanaItem("か").id);
    expect(seen).toBeDefined();
    if (seen === undefined) return;

    // Right after a review the reader still knows it.
    expect(recallProbability(seen, now)).toBeGreaterThan(0.9);
  });
});
