import { describe, expect, test } from "bun:test";
import {
  MARATHON_MAX_MS,
  MARATHON_MIN_MS,
  canEnter,
  isValidSchedule,
  liveScore,
  marathonStatus,
} from "./marathon-rules";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);

describe("isValidSchedule", () => {
  test("takes a month starting now, or next week", () => {
    expect(isValidSchedule({ startsAt: NOW, endsAt: NOW + 30 * DAY }, NOW)).toBe(true);
    expect(isValidSchedule({ startsAt: NOW + 7 * DAY, endsAt: NOW + 37 * DAY }, NOW)).toBe(true);
  });

  test("lets 'start now' arrive a few seconds late", () => {
    expect(isValidSchedule({ startsAt: NOW - 5000, endsAt: NOW + DAY }, NOW)).toBe(true);
  });

  test("refuses a start in the past, an end before the start, and lengths out of range", () => {
    expect(isValidSchedule({ startsAt: NOW - DAY, endsAt: NOW + DAY }, NOW)).toBe(false);
    expect(isValidSchedule({ startsAt: NOW + DAY, endsAt: NOW }, NOW)).toBe(false);
    expect(isValidSchedule({ startsAt: NOW, endsAt: NOW + MARATHON_MIN_MS - 1 }, NOW)).toBe(false);
    expect(isValidSchedule({ startsAt: NOW, endsAt: NOW + MARATHON_MAX_MS + 1 }, NOW)).toBe(false);
  });
});

describe("canEnter", () => {
  const marathon = { startsAt: NOW, endsAt: NOW + 30 * DAY, allowsLateEntry: false };

  test("anyone may enter before the start", () => {
    expect(canEnter(marathon, NOW - DAY)).toBe(true);
  });

  test("after the start only when the creator allows it, and never after the end", () => {
    expect(canEnter(marathon, NOW + DAY)).toBe(false);
    expect(canEnter({ ...marathon, allowsLateEntry: true }, NOW + DAY)).toBe(true);
    expect(canEnter({ ...marathon, allowsLateEntry: true }, NOW + 30 * DAY)).toBe(false);
  });
});

describe("marathonStatus", () => {
  test("upcoming, running, counting while the results wait, then finished", () => {
    const times = { startsAt: NOW, endsAt: NOW + DAY, resultsDelay: 60 };
    expect(marathonStatus(times, NOW - 1)).toBe("upcoming");
    expect(marathonStatus(times, NOW)).toBe("running");
    expect(marathonStatus(times, NOW + DAY)).toBe("counting");
    expect(marathonStatus(times, NOW + DAY + 3_600_000)).toBe("finished");
  });

  test("with no wait, final the moment it ends", () => {
    const times = { startsAt: NOW, endsAt: NOW + DAY, resultsDelay: 0 };
    expect(marathonStatus(times, NOW + DAY)).toBe("finished");
  });
});

describe("liveScore", () => {
  const endsAt = NOW + 10 * DAY;
  const runner = { score: 2000, endScore: 1500, scoredAt: NOW };

  test("falls in a straight line from the last sync to the score at the end", () => {
    expect(liveScore(runner, endsAt, NOW)).toBe(2000);
    expect(liveScore(runner, endsAt, NOW + 5 * DAY)).toBe(1750);
    expect(liveScore(runner, endsAt, endsAt)).toBe(1500);
  });

  test("is the score at the end once it is over, however long ago they synced", () => {
    expect(liveScore(runner, endsAt, endsAt + 3 * DAY)).toBe(1500);
  });

  test("is nothing for a runner who never synced", () => {
    expect(liveScore({ score: 0, endScore: 0, scoredAt: null }, endsAt, NOW)).toBe(0);
  });
});
