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
    for (let score = 0; score <= 290_000; score += 500) {
      const needed = leastTimeTo(score);
      expect(needed).toBeGreaterThanOrEqual(last);
      last = needed;
    }
  });

  test("keeps a fresh account well short of the top on its first day", () => {
    // Everything the fastest reader has after four hours, and not much more for a while.
    expect(leastTimeTo(164_225)).toBeLessThanOrEqual(4 * HOUR);
    expect(leastTimeTo(250_000)).toBeGreaterThan(4 * DAY);
  });
});
