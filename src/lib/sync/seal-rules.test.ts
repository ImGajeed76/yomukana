import { describe, expect, test } from "bun:test";
import { readingDayIn, streakOf } from "../stats/streak";
import { allSeals, fullYearsBetween, sealOf, sealsEarned, type SealFacts } from "./seal-rules";

const DAY_MS = 86_400_000;
const JOINED = Date.UTC(2026, 8, 30);

function facts(overrides: Partial<SealFacts>): SealFacts {
  return {
    longestStreak: 0,
    daysRead: 0,
    sentences: 0,
    perfectSentences: 0,
    marathonWins: 0,
    marathonPodiums: 0,
    marathonsFinished: 0,
    invited: 0,
    followers: 0,
    joinedAt: JOINED,
    now: JOINED,
    ...overrides,
  };
}

describe("seal ids", () => {
  test("every seal reads back from its own id", () => {
    for (const seal of allSeals()) expect(sealOf(seal.id)).toEqual(seal);
  });

  test("refuses what is not a seal", () => {
    expect(sealOf("streak-8")).toBeNull();
    expect(sealOf("streak")).toBeNull();
    expect(sealOf("joined-1")).toBeNull();
    expect(sealOf("nothing-10")).toBeNull();
    // A group id must never pass for one, since both share the wear slots.
    expect(sealOf("6587c518-5a43-4526-a7bc-71b50fb1894e")).toBeNull();
  });
});

describe("earning seals", () => {
  test("everyone has 始, and nothing else, on the first day", () => {
    expect(sealsEarned(facts({}))).toEqual(["joined"]);
  });

  test("a step is earned at its count, not one before", () => {
    expect(sealsEarned(facts({ longestStreak: 6 }))).not.toContain("streak-7");
    expect(sealsEarned(facts({ longestStreak: 7 }))).toContain("streak-7");
    expect(sealsEarned(facts({ longestStreak: 7 }))).toContain("streak-3");
  });

  test("counts years by the calendar", () => {
    const dayBefore = Date.UTC(2027, 8, 29);
    const anniversary = Date.UTC(2027, 8, 30);
    expect(fullYearsBetween(JOINED, dayBefore)).toBe(0);
    expect(fullYearsBetween(JOINED, anniversary)).toBe(1);
    expect(sealsEarned(facts({ now: anniversary }))).toContain("years-1");
  });
});

describe("reading days in another time zone", () => {
  test("turns at 4 am where the reader is, not where the server is", () => {
    const dayOf = readingDayIn("Asia/Tokyo");
    // 3 am and 5 am in Tokyo on 1 October 2026 (UTC+9).
    const threeAm = Date.UTC(2026, 8, 30, 18);
    const fiveAm = Date.UTC(2026, 8, 30, 20);
    expect(dayOf(fiveAm) - dayOf(threeAm)).toBe(1);
  });

  test("gives the same streak as the reader's own device", () => {
    const dayOf = readingDayIn("Asia/Kolkata");
    const noon = Date.UTC(2026, 8, 1, 6, 30);
    const times: number[] = [];
    for (let day = 0; day < 10; day++) {
      for (let sentence = 0; sentence < 5; sentence++) times.push(noon + day * DAY_MS + sentence);
    }
    expect(streakOf(times, noon + 9 * DAY_MS, dayOf).longest).toBe(10);
  });
});
