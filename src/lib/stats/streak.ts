// The reading streak: days in a row with a few sentences read.
//
// Worked out from the finished sentences every time, never stored as a
// counter. So it holds across devices once sync has brought their sentences
// together, a reader who never signs in has one too, and a reader who used
// the app before streaks existed has theirs from their history at once. Pure,
// so the rules can be pinned in tests.
//
// The flip side: every rule here applies to the whole past. Change the goal or
// what earns a freeze and every reader's streak is recounted under the new
// rule, which can break a streak someone already had. Change them rarely.

/** Sentences finished in a day for it to count. A couple of minutes. */
export const DAY_GOAL = 5;

/**
 * Sentences in one day that earn a streak freeze: five times the goal, about
 * eight minutes. Well past an ordinary day, so a freeze means something, and
 * still one sitting. Chosen from real days read in September 2026.
 */
export const FREEZE_EARNED_AT = 25;

/**
 * Every this many days in a row also earns a freeze. So a reader who shows up
 * every day earns one a week without ever having a big day.
 */
export const FREEZE_EVERY_DAYS = 7;

/** Freezes held at most. More would make a missed week free. */
export const FREEZES_MAX = 2;

/** A new reader has one, so the first streak is not undone by the first missed day. */
export const FREEZES_AT_START = 1;

/**
 * A day runs from 4 am to 4 am local time, not midnight to midnight: reading
 * in bed at half past midnight still belongs to the day that has not ended
 * for the reader.
 */
const DAY_STARTS_AT_HOUR = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * What a day was for the streak.
 * - `done`: the goal was reached.
 * - `frozen`: missed, and a freeze kept the streak.
 * - `missed`: missed, and the streak ended (or there was none to lose).
 * - `today`: today, not done yet. It is not missed until it is over.
 */
export type DayStatus = "done" | "frozen" | "missed" | "today";

export interface StreakDay {
  /** The day, as a number: see `readingDay`. */
  readonly day: number;
  readonly sentences: number;
  readonly status: DayStatus;
}

export interface Streak {
  /** Days in the streak running now. Frozen days keep it, but do not add to it. */
  readonly current: number;
  readonly longest: number;
  /** Freezes held now. */
  readonly freezes: number;
  /** Sentences finished today. */
  readonly today: number;
  /** Whether today already counts. */
  readonly isTodayDone: boolean;
  /**
   * When the streak running now ends if nothing more is read, in epoch
   * milliseconds: the end of the last day the freezes can cover. Sent with the
   * profile, so a card shows a streak only while it is still alive.
   */
  readonly aliveUntil: number;
  /** Every day from the first one read to today, oldest first. */
  readonly days: readonly StreakDay[];
}

/**
 * The reading day a moment falls on, as a whole number that goes up by one a
 * day. In the reader's own time zone, shifted so the day turns at 4 am.
 */
export function readingDay(at: number): number {
  const shifted = new Date(at - DAY_STARTS_AT_HOUR * HOUR_MS);
  return Math.floor(
    Date.UTC(shifted.getFullYear(), shifted.getMonth(), shifted.getDate()) / DAY_MS,
  );
}

/** When a reading day begins, 4 am local time, in epoch milliseconds. */
export function dayStart(day: number): number {
  const date = new Date(day * DAY_MS);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    DAY_STARTS_AT_HOUR,
  ).getTime();
}

/** Where a quarter of an hour falls: every time zone's offset is a multiple of one. */
const QUARTER_HOUR_MS = 900_000;

/**
 * `readingDay` for a reader somewhere else, by their IANA time zone name. For
 * the API function, which runs in UTC and works streaks out for achievements.
 *
 * Asking Intl for every sentence of a long history is slow, and the answer is
 * the same for a whole quarter of an hour, so it is asked once per quarter.
 */
export function readingDayIn(timeZone: string): (at: number) => number {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const known = new Map<number, number>();
  return (at) => {
    const quarter = Math.floor((at - DAY_STARTS_AT_HOUR * HOUR_MS) / QUARTER_HOUR_MS);
    const cached = known.get(quarter);
    if (cached !== undefined) return cached;
    const parts = format.formatToParts(quarter * QUARTER_HOUR_MS);
    const part = (type: string): number => Number(parts.find((each) => each.type === type)?.value);
    const day = Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS);
    known.set(quarter, day);
    return day;
  };
}

/**
 * The streak as of `now`, from when every finished sentence was finished.
 * Days are the reader's own unless `dayOf` says whose they are.
 */
export function streakOf(
  finishedAt: readonly number[],
  now: number,
  dayOf: (at: number) => number = readingDay,
): Streak {
  const today = dayOf(now);
  const counts = new Map<number, number>();
  for (const at of finishedAt) {
    const day = dayOf(at);
    if (day > today) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return streakOfDays(counts, today, now);
}

/**
 * The streak from sentences already counted by day, as `readingDay` numbers.
 * For the API function, which has Postgres count them by the reader's day
 * rather than load every sentence of a long history.
 */
export function streakOfDays(
  counts: ReadonlyMap<number, number>,
  today: number,
  now: number,
): Streak {
  const days: StreakDay[] = [];
  let current = 0;
  let longest = 0;
  let freezes = FREEZES_AT_START;
  const first = counts.size === 0 ? today : Math.min(...counts.keys());

  for (let day = first; day <= today; day++) {
    const sentences = counts.get(day) ?? 0;
    let status: DayStatus;
    if (sentences >= DAY_GOAL) {
      current += 1;
      status = "done";
      // One freeze a day at most, whichever way it was earned.
      const isEarned = sentences >= FREEZE_EARNED_AT || current % FREEZE_EVERY_DAYS === 0;
      if (isEarned && freezes < FREEZES_MAX) freezes += 1;
    } else if (day === today) {
      status = "today";
    } else if (current > 0 && freezes > 0) {
      // A freeze is only spent to save a streak. A day off with no streak
      // running costs nothing.
      freezes -= 1;
      status = "frozen";
    } else {
      current = 0;
      status = "missed";
    }
    longest = Math.max(longest, current);
    days.push({ day, sentences, status });
  }

  const todaySentences = counts.get(today) ?? 0;
  const isTodayDone = todaySentences >= DAY_GOAL;
  // The first day that is not yet safe is today, or tomorrow once today is
  // done. Each freeze covers one more missed day after it. The last day that
  // can still be read to keep the streak is past both, and it ends with it.
  const lastChance = (isTodayDone ? today + 1 : today) + freezes;
  return {
    current,
    longest,
    freezes,
    today: todaySentences,
    isTodayDone,
    aliveUntil: current === 0 ? now : dayStart(lastChance + 1),
    days,
  };
}

/** What one finished sentence did to the streak, for the page to celebrate. */
export interface StreakMoment {
  /** Days in the streak now. */
  readonly streak: number;
  /** Whether this sentence reached today's goal. */
  readonly isGoalReached: boolean;
  /** Whether that began a new streak: day one. */
  readonly isStarted: boolean;
  /** Whether that made a whole number of weeks: day 7, 14, 21. */
  readonly isWeek: boolean;
  /** Whether this sentence earned a freeze. */
  readonly isFreezeEarned: boolean;
  /** Freezes held now. */
  readonly freezes: number;
}

/**
 * What happened between two streaks, the one before a sentence and the one
 * after it. Null when nothing did, which is most sentences.
 */
export function momentOf(before: Streak, after: Streak): StreakMoment | null {
  const isGoalReached = !before.isTodayDone && after.isTodayDone;
  const isFreezeEarned = after.freezes > before.freezes;
  if (!isGoalReached && !isFreezeEarned) return null;
  return {
    streak: after.current,
    isGoalReached,
    isStarted: isGoalReached && after.current === 1,
    isWeek: isGoalReached && after.current % FREEZE_EVERY_DAYS === 0,
    isFreezeEarned,
    freezes: after.freezes,
  };
}

/** Whether a moment deserves a popup, rather than only the summary's own celebration. */
export function isBigMoment(moment: StreakMoment): boolean {
  return moment.isStarted || moment.isWeek || moment.isFreezeEarned;
}

/**
 * The newest day a freeze saved the streak that is still running, if the
 * reader has not been told yet: the popup on their first visit after a missed
 * day. `toldUpTo` is the newest such day they were already shown.
 */
export function freezeSaveToTell(streak: Streak, toldUpTo: number | null): number | null {
  if (streak.current === 0) return null;
  for (let index = streak.days.length - 1; index >= 0; index--) {
    const day = streak.days[index];
    if (day === undefined) break;
    // Past the start of the running streak: an older save is old news.
    if (day.status === "missed") break;
    if (day.status === "frozen") return toldUpTo !== null && day.day <= toldUpTo ? null : day.day;
  }
  return null;
}

/** A day as a week row or the calendar draws it: `empty` is one with nothing to show. */
export type DayMark = DayStatus | "empty";

/** The weekday of a reading day, 0 for Monday to 6 for Sunday, the way a Japanese or European calendar runs. */
export function weekdayOf(day: number): number {
  return (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
}

/** A reading day as a date, for formatting its weekday or month. Read it in UTC. */
export function dateOf(day: number): Date {
  return new Date(day * DAY_MS);
}

/** How each day went, for looking days up by their number. */
export function marksOf(streak: Streak): (day: number) => DayMark {
  const byDay = new Map(streak.days.map((entry) => [entry.day, entry.status]));
  return (day) => byDay.get(day) ?? "empty";
}

/** This week, Monday to Sunday, as seven days and how each went. */
export function thisWeek(streak: Streak, today: number): { day: number; mark: DayMark }[] {
  const mark = marksOf(streak);
  const monday = today - weekdayOf(today);
  return Array.from({ length: 7 }, (_, index) => ({
    day: monday + index,
    mark: mark(monday + index),
  }));
}

/** What a streak popup is about: something a sentence did, or a freeze that saved the streak. */
export type StreakNews =
  | { readonly kind: "moment"; readonly moment: StreakMoment }
  | { readonly kind: "saved"; readonly days: number };
