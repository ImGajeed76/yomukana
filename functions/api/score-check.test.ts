import { describe, expect, test } from "bun:test";
import { judgeScore, type AcceptedScore, type ScoreLimits } from "./score-check";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Round numbers, so each test reads as arithmetic. The real ones come from
// the simulation in scripts/simulate.
const LIMITS: ScoreLimits = {
  gains: [
    { windowMs: 10 * MINUTE, maxGain: 100 },
    { windowMs: HOUR, maxGain: 400 },
    { windowMs: DAY, maxGain: 2000 },
  ],
  ceiling: 1_000_000,
};

const SIGNED_UP = 1_000_000_000_000;
const start: AcceptedScore = { score: 0, at: SIGNED_UP };

describe("judgeScore", () => {
  test("accepts a first score a reader could reach in the minutes since signing up", () => {
    expect(judgeScore(90, SIGNED_UP + 10 * MINUTE, [start], LIMITS)).toBe("accept");
  });

  test("refuses a new account arriving with far more than its time allows", () => {
    expect(judgeScore(5000, SIGNED_UP + 10 * MINUTE, [start], LIMITS)).toBe("implausible");
  });

  test("always accepts a drop, because scores fall when people stop", () => {
    const history = [start, { score: 800, at: SIGNED_UP + DAY }];
    expect(judgeScore(300, SIGNED_UP + DAY + MINUTE, history, LIMITS)).toBe("accept");
  });

  test("lets three offline days go up at once, if three days could have produced them", () => {
    const history = [start, { score: 1000, at: SIGNED_UP + DAY }];
    const later = SIGNED_UP + 4 * DAY;
    expect(judgeScore(1000 + 5500, later, history, LIMITS)).toBe("accept");
    expect(judgeScore(1000 + 6500, later, history, LIMITS)).toBe("implausible");
  });

  test("refuses many small steps that each look fine but add up to too much in an hour", () => {
    // Every ten minutes a gain of 90, under the ten-minute limit each time,
    // but 540 in the hour, over its 400.
    const base = SIGNED_UP + 2 * DAY;
    const history: AcceptedScore[] = [start, { score: 1000, at: base }];
    for (let step = 1; step <= 5; step++) {
      history.push({ score: 1000 + step * 90, at: base + step * 10 * MINUTE });
    }
    expect(judgeScore(1000 + 6 * 90, base + 60 * MINUTE + 1, history, LIMITS)).toBe("implausible");
  });

  test("refuses anything above the ceiling, and anything that is not a score", () => {
    const history = [start, { score: 900_000, at: SIGNED_UP }];
    const later = SIGNED_UP + 1000 * DAY;
    expect(judgeScore(1_000_001, later, history, LIMITS)).toBe("implausible");
    expect(judgeScore(Number.NaN, later, history, LIMITS)).toBe("implausible");
    expect(judgeScore(-1, later, history, LIMITS)).toBe("implausible");
  });
});
