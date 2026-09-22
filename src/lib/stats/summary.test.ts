import { describe, expect, test } from "bun:test";
import type { AttemptRecord } from "../db";
import { segmentKana } from "../romaji";
import {
  EMPTY_STORE,
  applyReviews,
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type TimedSegment,
} from "../srs";
import { NO_TOTALS, characterStats, totalsOf } from "./summary";

const now = new Date("2026-01-01T00:00:00Z");

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    sentenceId: "t1",
    finishedAt: now.getTime(),
    durationMs: 6000,
    keyCount: 20,
    errors: 0,
    segments: 10,
    ...overrides,
  };
}

describe("totalsOf", () => {
  test("reports nothing for a reader who has not started", () => {
    expect(totalsOf([])).toEqual(NO_TOTALS);
  });

  test("adds up sentences, characters and time", () => {
    const totals = totalsOf([attempt(), attempt({ segments: 20, durationMs: 6000 })]);

    expect(totals.sentences).toBe(2);
    expect(totals.characters).toBe(30);
    expect(totals.durationMs).toBe(12_000);
    // 30 characters in 12 seconds is 150 a minute.
    expect(totals.charactersPerMinute).toBe(150);
  });

  test("measures accuracy over keys, not over sentences", () => {
    const totals = totalsOf([
      attempt({ keyCount: 10, errors: 1 }),
      attempt({ keyCount: 90, errors: 9 }),
    ]);
    expect(totals.accuracy).toBe(0.9);
  });
});

describe("characterStats", () => {
  test("lists only characters the reader has actually read", () => {
    const segments = segmentKana("かさ");
    const timed: TimedSegment[] = [{ segment: 0, latencyMs: 300, errors: 0 }];
    const store = applyReviews(EMPTY_STORE, reviewsFor(segments, timed), now);

    const stats = characterStats(store, now);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.item.surface).toBe("か");
  });

  test("puts the slowest character first, because that is what to work on", () => {
    const segments = segmentKana("かさた");
    const timed: TimedSegment[] = [
      { segment: 0, latencyMs: 200, errors: 0 },
      { segment: 1, latencyMs: 900, errors: 0 },
      { segment: 2, latencyMs: 500, errors: 0 },
    ];
    const store = applyReviews(EMPTY_STORE, reviewsFor(segments, timed), now);

    expect(characterStats(store, now).map((stat) => stat.item.surface)).toEqual(["さ", "た", "か"]);
  });

  test("lists a written word after one graded read, with its reading", () => {
    // The word is what the reader looked at, so 学校 is the item, not 学 and 校.
    const reviews = reviewsForWords(
      [{ item: kanjiItem("学校", "がっこう"), from: 2, to: 6 }],
      [
        { segment: 2, latencyMs: 700, errors: 0 },
        { segment: 3, latencyMs: 120, errors: 0 },
      ],
    );
    const store = applyReviews(EMPTY_STORE, reviews, now);

    const stats = characterStats(store, now);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.item.kind).toBe("kanji");
    expect(stats[0]?.item.surface).toBe("学校");
    expect(stats[0]?.item.reading).toBe("がっこう");
    expect(stats[0]?.meanLatencyMs).toBe(700);
  });

  test("lists characters and written words together, slowest first", () => {
    const segments = segmentKana("かさ");
    let store = applyReviews(
      EMPTY_STORE,
      reviewsFor(segments, [{ segment: 0, latencyMs: 200, errors: 0 }]),
      now,
    );
    store = applyReviews(
      store,
      reviewsForWords(
        [{ item: kanjiItem("学校", "がっこう"), from: 0, to: 4 }],
        [{ segment: 0, latencyMs: 900, errors: 0 }],
      ),
      now,
    );

    expect(characterStats(store, now).map((stat) => stat.item.surface)).toEqual(["学校", "か"]);
  });

  test("keeps katakana separate from the hiragana it sounds like", () => {
    const segments = segmentKana("かカ");
    const timed: TimedSegment[] = [
      { segment: 0, latencyMs: 200, errors: 0 },
      { segment: 1, latencyMs: 900, errors: 0 },
    ];
    const store = applyReviews(EMPTY_STORE, reviewsFor(segments, timed), now);

    expect(characterStats(store, now).map((stat) => stat.item.surface)).toEqual(["カ", "か"]);
  });
});
