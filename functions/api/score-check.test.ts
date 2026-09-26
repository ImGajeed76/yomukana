import { describe, expect, test } from "bun:test";
import { judgeScore, type ScoreLimits, type ScoreRecord } from "./score-check";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A made-up fastest path with the real one's shape, in round numbers: 1,000
 * points in the first hour, 5,000 by the end of the first day, then 500 a day.
 */
function leastTimeTo(score: number): number {
  if (score <= 1000) return (score / 1000) * HOUR;
  if (score <= 5000) return HOUR + ((score - 1000) / 4000) * (DAY - HOUR);
  return DAY + ((score - 5000) / 500) * DAY;
}

const LIMITS: ScoreLimits = {
  relearning: [
    { windowMs: 10 * MINUTE, maxGain: 400 },
    { windowMs: HOUR, maxGain: 2000 },
    { windowMs: DAY, maxGain: 6000 },
  ],
  leastTimeTo,
};

const SIGNED_UP = 1_000_000_000_000;
const fresh: ScoreRecord = { createdAt: SIGNED_UP, peak: null, recent: [] };

describe("judgeScore", () => {
  test("accepts a new account's first score when the fastest reader could have got there", () => {
    expect(judgeScore(900, SIGNED_UP + HOUR, fresh, LIMITS)).toBe("accept");
  });

  test("refuses a new account arriving with more than its age allows", () => {
    expect(judgeScore(4000, SIGNED_UP + HOUR, fresh, LIMITS)).toBe("implausible");
  });

  test("holds an old account to the flat part of the path, not to its steep start", () => {
    // Ten days old, best of 5,000 reached on day one. A day later the fastest
    // reader adds 500, not the 4,000 a first day brings.
    const record: ScoreRecord = {
      createdAt: SIGNED_UP,
      peak: { score: 5000, at: SIGNED_UP + DAY },
      recent: [{ score: 5000, at: SIGNED_UP + 9 * DAY }],
    };
    const now = SIGNED_UP + 10 * DAY;
    expect(judgeScore(5400, now, record, LIMITS)).toBe("accept");
    expect(judgeScore(9000, now, record, LIMITS)).toBe("implausible");
  });

  test("counts days offline, as long as the path fits inside them", () => {
    const record: ScoreRecord = {
      createdAt: SIGNED_UP,
      peak: { score: 5000, at: SIGNED_UP + DAY },
      recent: [{ score: 5000, at: SIGNED_UP + DAY }],
    };
    // Four days on, the fastest reader could be 2,000 further.
    const now = SIGNED_UP + 5 * DAY;
    expect(judgeScore(6900, now, record, LIMITS)).toBe("accept");
    expect(judgeScore(7200, now, record, LIMITS)).toBe("implausible");
  });

  test("lets a reader climb back to their old best quickly after a break", () => {
    // Best of 8,000, fallen to 3,000 over a month away, back to 5,000 in an hour.
    const record: ScoreRecord = {
      createdAt: SIGNED_UP,
      peak: { score: 8000, at: SIGNED_UP + 10 * DAY },
      recent: [{ score: 3000, at: SIGNED_UP + 40 * DAY }],
    };
    expect(judgeScore(5000, SIGNED_UP + 40 * DAY + HOUR, record, LIMITS)).toBe("accept");
  });

  test("still limits how fast climbing back can go", () => {
    const record: ScoreRecord = {
      createdAt: SIGNED_UP,
      peak: { score: 8000, at: SIGNED_UP + 10 * DAY },
      recent: [{ score: 3000, at: SIGNED_UP + 40 * DAY }],
    };
    expect(judgeScore(7900, SIGNED_UP + 40 * DAY + 10 * MINUTE, record, LIMITS)).toBe(
      "implausible",
    );
  });

  test("always accepts a drop, because scores fall when people stop", () => {
    const record: ScoreRecord = {
      createdAt: SIGNED_UP,
      peak: { score: 8000, at: SIGNED_UP + DAY },
      recent: [{ score: 8000, at: SIGNED_UP + DAY }],
    };
    expect(judgeScore(2000, SIGNED_UP + DAY + MINUTE, record, LIMITS)).toBe("accept");
  });

  test("refuses anything that is not a score", () => {
    const later = SIGNED_UP + 1000 * DAY;
    expect(judgeScore(Number.NaN, later, fresh, LIMITS)).toBe("implausible");
    expect(judgeScore(-1, later, fresh, LIMITS)).toBe("implausible");
    expect(judgeScore(Number.POSITIVE_INFINITY, later, fresh, LIMITS)).toBe("implausible");
  });
});
