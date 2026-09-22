import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import {
  EMPTY_STORE,
  applyReviews,
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type ItemStore,
} from "../srs";
import { dailyScores, scoreOf, type ScoredAttempt } from "./score";

const now = new Date("2026-01-01T00:00:00Z");

/** A store where the reader has read `text` once, at `latencyMs` a character. */
function afterReading(text: string, latencyMs: number): ItemStore {
  const segments = segmentKana(text);
  return applyReviews(
    EMPTY_STORE,
    reviewsFor(
      segments,
      segments.map((_segment, segment) => ({ segment, latencyMs, errors: 0 })),
    ),
    now,
  );
}

describe("scoreOf", () => {
  test("is zero for a reader who has not started", () => {
    expect(scoreOf(EMPTY_STORE)).toBe(0);
  });

  test("grows with every character learned, so it has no ceiling", () => {
    const few = scoreOf(afterReading("かきく", 400));
    const more = scoreOf(afterReading("かきくけこさしすせそ", 400));
    expect(more).toBeGreaterThan(few);
  });

  test("pays more for reading the same characters faster", () => {
    const slow = scoreOf(afterReading("かきくけこ", 1200));
    const fast = scoreOf(afterReading("かきくけこ", 250));
    expect(fast).toBeGreaterThan(slow);
  });

  test("pays more for a kanji reading than for a kana", () => {
    const kana = scoreOf(afterReading("か", 500));

    const word = scoreOf(
      applyReviews(
        EMPTY_STORE,
        reviewsForWords(
          [{ item: kanjiItem("学校", "がっこう"), from: 0, to: 4 }],
          [{ segment: 0, latencyMs: 500, errors: 0 }],
        ),
        now,
      ),
    );

    expect(word).toBeGreaterThan(kana);
  });
});

describe("dailyScores", () => {
  const today = new Date("2026-03-10T18:00:00");

  function at(date: string, score: number): ScoredAttempt {
    return { finishedAt: new Date(`${date}T12:00:00`).getTime(), score };
  }

  test("gives every day in the span a point, read or not", () => {
    expect(dailyScores([at("2026-03-10", 40)], 7, today)).toHaveLength(7);
  });

  test("is zero before the reader's first scored sentence", () => {
    const series = dailyScores([at("2026-03-10", 40)], 3, today);
    expect(series.map((day) => day.value)).toEqual([0, 0, 40]);
  });

  test("holds the last score through a quiet day rather than dropping to the floor", () => {
    const series = dailyScores([at("2026-03-08", 40)], 3, today);
    expect(series.map((day) => day.value)).toEqual([40, 40, 40]);
  });

  test("takes the last reading of a day, since that is where the day ended", () => {
    const series = dailyScores(
      [
        { finishedAt: new Date("2026-03-10T09:00:00").getTime(), score: 10 },
        { finishedAt: new Date("2026-03-10T17:00:00").getTime(), score: 55 },
      ],
      1,
      today,
    );
    expect(series[0]?.value).toBe(55);
  });

  test("holds a score through a long gap rather than dropping it to the floor", () => {
    // Two months away does not undo what the reader knows, so the line holds.
    // It used to fall to zero, which read as having lost everything.
    const series = dailyScores([at("2026-01-02", 40)], 60, new Date("2026-03-02T18:00:00"));
    expect(series[0]?.value).toBe(40);
    expect(series.at(-1)?.value).toBe(40);
  });

  test("ignores attempts recorded before scores existed", () => {
    expect(dailyScores([{ finishedAt: today.getTime() }], 1, today)[0]?.value).toBe(0);
  });
});
