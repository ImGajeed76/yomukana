import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import {
  EMPTY_STORE,
  applyReviews,
  kanaItem,
  reviewsFor,
  type InputMethod,
  type ItemStore,
} from "../srs";
import { dailyScores, readingShareOf, scoreOf, type ScoredAttempt } from "./score";
import type { TextShare } from "./text-share";

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

/** Text made of these kana, each used this many times. */
function textOf(uses: Readonly<Record<string, number>>): TextShare {
  const usesOf = new Map(Object.entries(uses).map(([kana, count]) => [kanaItem(kana).id, count]));
  let totalUses = 0;
  for (const count of usesOf.values()) totalUses += count;
  return { usesOf, totalUses };
}

const EVEN = textOf({
  か: 10,
  き: 10,
  く: 10,
  け: 10,
  こ: 10,
  さ: 10,
  し: 10,
  す: 10,
  せ: 10,
  そ: 10,
});

describe("scoreOf", () => {
  test("is zero for a reader who has not started", () => {
    expect(scoreOf(EMPTY_STORE, now, EVEN)).toBe(0);
  });

  test("grows with every character learned", () => {
    const few = scoreOf(afterReading("かきく", 400), now, EVEN);
    const more = scoreOf(afterReading("かきくけこさしすせそ", 400), now, EVEN);
    expect(more).toBeGreaterThan(few);
  });

  test("counts a character by how much of the text it is", () => {
    const text = textOf({ か: 90, き: 10 });
    const common = scoreOf(afterReading("か", 400), now, text);
    const rare = scoreOf(afterReading("き", 400), now, text);
    expect(common).toBeGreaterThan(rare);
  });

  test("gives nothing for a character the text never uses", () => {
    expect(scoreOf(afterReading("ぬ", 400), now, EVEN)).toBe(0);
  });

  test("is 1,000 points for each halving of the text the reader would stumble on", () => {
    const store = afterReading("かきくけこ", 400);
    const read = readingShareOf(store, now, EVEN);
    expect(scoreOf(store, now, EVEN)).toBe(Math.round(1000 * -Math.log2(1 - read)));
  });

  test("never reaches all of the text, so there is always more to gain", () => {
    expect(readingShareOf(afterReading("かきくけこさしすせそ", 400), now, EVEN)).toBeLessThan(1);
  });

  test("falls when the reader stops, because they forget", () => {
    // What someone can read today, not what they have ever learned.
    const store = afterReading("かきくけこ", 400);
    const later = new Date(now.getTime() + 365 * 86_400_000);
    expect(scoreOf(store, later, EVEN)).toBeLessThan(scoreOf(store, now, EVEN));
  });

  test("does not depend on how fast the reader's hands are, or what they type on", () => {
    // Two readers who read the same, one of whom takes longer to reach the keys.
    const segments = segmentKana("かきくけこ");
    const read = (method: InputMethod): ItemStore => {
      let store = EMPTY_STORE;
      for (let pass = 0; pass < 400; pass++) {
        const reach = method === "keyboard" ? 250 : 450;
        const timed = segments.map((_segment, segment) => ({
          segment,
          latencyMs: reach + (pass % 10 === 0 ? 0 : 300),
          errors: 0,
        }));
        store = applyReviews(store, reviewsFor(segments, timed), now, method);
      }
      return store;
    };
    const atDesk = scoreOf(read("keyboard"), now, EVEN);
    const onPhone = scoreOf(read("touch"), now, EVEN);
    expect(Math.abs(atDesk - onPhone) / atDesk).toBeLessThan(0.05);
  });
});

describe("dailyScores", () => {
  const today = new Date("2026-03-10T18:00:00");

  function at(date: string, readingScore: number): ScoredAttempt {
    return { finishedAt: new Date(`${date}T12:00:00`).getTime(), readingScore };
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
        { finishedAt: new Date("2026-03-10T09:00:00").getTime(), readingScore: 10 },
        { finishedAt: new Date("2026-03-10T17:00:00").getTime(), readingScore: 55 },
      ],
      1,
      today,
    );
    expect(series[0]?.value).toBe(55);
  });

  test("holds a score through a long gap rather than dropping it to the floor", () => {
    // Two months away does not undo what the reader knows, so the line holds.
    const series = dailyScores([at("2026-01-02", 40)], 60, new Date("2026-03-02T18:00:00"));
    expect(series[0]?.value).toBe(40);
    expect(series.at(-1)?.value).toBe(40);
  });

  test("draws nothing from attempts scored on the old scale, or not scored at all", () => {
    // A score on another scale beside today's would show a fall that never happened.
    const old = { finishedAt: today.getTime(), score: 20_000 } as ScoredAttempt;
    expect(dailyScores([old, { finishedAt: today.getTime() }], 1, today)[0]?.value).toBe(0);
  });
});
