import { describe, expect, test } from "bun:test";
import { dayStart, freezeSaveToTell, isBigMoment, momentOf, readingDay, streakOf } from "./streak";

const HOUR = 3_600_000;
/** A day far from any edge of the calendar, to count from. */
const START = readingDay(new Date(2026, 8, 7, 12).getTime());

/** `count` sentences finished on the day `offset` days after START, at noon. */
function read(offset: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => dayStart(START + offset) + 8 * HOUR + index);
}

/** Sentences on every day from `from` to `to`, as many each day as `count` says. */
function days(from: number, to: number, count: (day: number) => number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) =>
    read(from + index, count(from + index)),
  ).flat();
}

/** Noon on the day `offset` days after START. */
function noon(offset: number): number {
  return dayStart(START + offset) + 8 * HOUR;
}

describe("readingDay", () => {
  test("turns at 4 am, not midnight", () => {
    const monday = new Date(2026, 8, 7, 12).getTime();
    const lateMonday = new Date(2026, 8, 8, 1).getTime();
    const tuesday = new Date(2026, 8, 8, 5).getTime();
    expect(readingDay(lateMonday)).toBe(readingDay(monday));
    expect(readingDay(tuesday)).toBe(readingDay(monday) + 1);
  });
});

describe("streakOf", () => {
  test("counts days in a row that reach the goal", () => {
    const streak = streakOf([...read(0, 5), ...read(1, 5), ...read(2, 6)], noon(2));
    expect(streak.current).toBe(3);
    expect(streak.isTodayDone).toBe(true);
  });

  test("does not count a day short of the goal, and waits for today", () => {
    const streak = streakOf([...read(0, 5), ...read(1, 4)], noon(1));
    // Today has 4, so the streak is still 1 and still alive: today is not over.
    expect(streak.current).toBe(1);
    expect(streak.today).toBe(4);
    expect(streak.isTodayDone).toBe(false);
    expect(streak.days.at(-1)?.status).toBe("today");
  });

  test("spends the starting freeze on the first missed day, then ends", () => {
    const one = streakOf([...read(0, 5), ...read(2, 5)], noon(2));
    expect(one.current).toBe(2);
    expect(one.freezes).toBe(0);
    expect(one.days.map((day) => day.status)).toEqual(["done", "frozen", "done"]);

    const two = streakOf([...read(0, 5), ...read(3, 5)], noon(3));
    expect(two.current).toBe(1);
    expect(two.days.map((day) => day.status)).toEqual(["done", "frozen", "missed", "done"]);
  });

  test("earns a freeze on a big day, up to two", () => {
    const streak = streakOf([...read(0, 25), ...read(1, 30), ...read(2, 25)], noon(2));
    expect(streak.freezes).toBe(2);
  });

  test("earns a freeze every seventh day in a row", () => {
    // Day 1 is missed, which spends the starting freeze and leaves room.
    const history = [...read(0, 5), ...days(2, 7, () => 5)];
    const sixth = streakOf(history, noon(6));
    expect(sixth.current).toBe(6);
    expect(sixth.freezes).toBe(0);
    const seventh = streakOf(history, noon(7));
    expect(seventh.current).toBe(7);
    expect(seventh.freezes).toBe(1);
  });

  test("earns one freeze a day at most", () => {
    // The seventh day is also a 25-sentence day: still one freeze.
    const history = [...read(0, 5), ...days(2, 7, (day) => (day === 7 ? 25 : 5))];
    expect(streakOf(history, noon(7)).freezes).toBe(1);
  });

  test("spends no freeze on a day off with no streak to save", () => {
    const streak = streakOf([...read(0, 2), ...read(3, 5)], noon(3));
    expect(streak.freezes).toBe(1);
    expect(streak.current).toBe(1);
  });

  test("keeps the longest streak after a break", () => {
    const history = [...read(0, 5), ...read(1, 5), ...read(2, 5), ...read(10, 5)];
    const streak = streakOf(history, noon(10));
    expect(streak.longest).toBe(3);
    expect(streak.current).toBe(1);
  });

  test("says how long the streak lives without more reading", () => {
    // Done today, still holding the starting freeze: tomorrow can be missed,
    // so the day after is the last chance.
    const done = streakOf([...read(0, 5), ...read(1, 5), ...read(2, 5)], noon(2));
    expect(done.freezes).toBe(1);
    expect(done.aliveUntil).toBe(dayStart(START + 5));
    // Done today with the freeze spent: tomorrow is the last chance.
    const spent = streakOf([...read(0, 5), ...read(2, 5)], noon(2));
    expect(spent.freezes).toBe(0);
    expect(spent.aliveUntil).toBe(dayStart(START + 4));
    // Not done today, one freeze: today and tomorrow can both still save it.
    const waiting = streakOf(read(0, 5), noon(1));
    expect(waiting.freezes).toBe(1);
    expect(waiting.aliveUntil).toBe(dayStart(START + 3));
  });

  test("has nothing to say about a reader with no sentences", () => {
    const streak = streakOf([], noon(0));
    expect(streak.current).toBe(0);
    expect(streak.freezes).toBe(1);
  });
});

describe("momentOf", () => {
  test("says nothing for an ordinary sentence", () => {
    const before = streakOf(read(0, 2), noon(0));
    const after = streakOf(read(0, 3), noon(0));
    expect(momentOf(before, after)).toBeNull();
  });

  test("marks the day a streak starts", () => {
    const moment = momentOf(streakOf(read(0, 4), noon(0)), streakOf(read(0, 5), noon(0)));
    expect(moment?.isStarted).toBe(true);
    expect(moment !== null && isBigMoment(moment)).toBe(true);
  });

  test("keeps an ordinary goal day to the summary", () => {
    const history = days(0, 2, () => 5);
    const moment = momentOf(
      streakOf([...history, ...read(3, 4)], noon(3)),
      streakOf([...history, ...read(3, 5)], noon(3)),
    );
    expect(moment?.isGoalReached).toBe(true);
    expect(moment?.streak).toBe(4);
    expect(moment !== null && isBigMoment(moment)).toBe(false);
  });

  test("marks every seventh day, and a freeze earned by a big day", () => {
    const six = days(0, 5, () => 5);
    const week = momentOf(
      streakOf([...six, ...read(6, 4)], noon(6)),
      streakOf([...six, ...read(6, 5)], noon(6)),
    );
    expect(week?.isWeek).toBe(true);

    // A freeze spent on day 1 leaves room for the one day 2's 25th sentence earns.
    const history = [...read(0, 5), ...read(2, 24)];
    const big = momentOf(
      streakOf(history, noon(2)),
      streakOf([...history, ...read(2, 1)], noon(2)),
    );
    expect(big?.isFreezeEarned).toBe(true);
    expect(big?.freezes).toBe(1);
  });
});

describe("freezeSaveToTell", () => {
  test("tells about a save once, and not about one before a break", () => {
    const saved = streakOf([...read(0, 5), ...read(2, 5)], noon(2));
    const day = freezeSaveToTell(saved, null);
    expect(day).toBe(START + 1);
    expect(freezeSaveToTell(saved, day)).toBeNull();

    // The save is older than a missed day that ended that streak.
    const broken = streakOf([...read(0, 5), ...read(4, 5)], noon(4));
    expect(freezeSaveToTell(broken, null)).toBeNull();
  });
});
