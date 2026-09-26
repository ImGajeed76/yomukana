import { describe, expect, test } from "bun:test";
import { FASTEST_PATH, TIME_MARGIN, leastTimeTo } from "./score-limits";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("leastTimeTo", () => {
  test("is the path's own time at each measured point, shortened by the margin", () => {
    for (const [minutes, score] of FASTEST_PATH) {
      if (score === 0) continue;
      // The earliest point that reached this score, since the path has flat stretches.
      const first = FASTEST_PATH.find(([, reached]) => reached >= score);
      expect(leastTimeTo(score)).toBeCloseTo(((first?.[0] ?? minutes) * MINUTE) / TIME_MARGIN);
    }
  });

  test("never falls as the score rises", () => {
    let last = 0;
    for (let score = 0; score <= 60_000; score += 100) {
      const needed = leastTimeTo(score);
      expect(needed).toBeGreaterThanOrEqual(last);
      last = needed;
    }
  });

  test("keeps growing past the measured path, with no ceiling, but slower every day", () => {
    const end = FASTEST_PATH.at(-1)?.[1] ?? 0;
    // Every further thousand points takes longer than the thousand before.
    let previousStep = 0;
    for (let score = end + 1000; score <= end + 30_000; score += 1000) {
      const step = leastTimeTo(score) - leastTimeTo(score - 1000);
      expect(Number.isFinite(step)).toBe(true);
      expect(step).toBeGreaterThan(previousStep);
      previousStep = step;
    }
  });

  test("keeps a fresh account far from where a year of practice can go", () => {
    expect(leastTimeTo(4876)).toBeLessThanOrEqual(4 * HOUR);
    expect(leastTimeTo(20_000)).toBeGreaterThan(30 * DAY);
  });
});
