// What a marathon is and may hold. A marathon is a reading race with a start
// and an end: everyone in it starts again from nothing on its own track, and
// whoever reads furthest by the end wins. Shared by the app and the API
// function, which has the final say. Pure, so both can import it and the
// rules can be pinned in tests.

/** A marathon's name is free text in any script, up to this many characters. */
export const MARATHON_NAME_MAX = 40;

/** The shortest a marathon may run. Less than a day is a sprint, not reading. */
export const MARATHON_MIN_MS = 86_400_000;

/** The longest a marathon may run: about a school term. */
export const MARATHON_MAX_MS = 92 * 86_400_000;

/** How far ahead a marathon may be set to start. */
export const MARATHON_LEAD_MAX_MS = 92 * 86_400_000;

/** The most people one marathon holds, runners and watchers together, as for a group. */
export const MARATHON_MEMBERS_MAX = 1000;

/** The most marathons one reader may be in at once, so the list stays a list. */
export const MARATHONS_PER_READER_MAX = 20;

/**
 * Runners a marathon needs for its places to earn seals. Fewer, and two
 * friends could hand each other first place.
 */
export const PODIUM_MIN_RUNNERS = 5;

/**
 * How long after the end the results wait before they are final, in minutes,
 * as the creator may choose. Until then a device may still send what was read
 * before the end: the last sentences of a marathon read on a train should
 * count once the train is out of the tunnel. Nothing read after the end
 * counts either way. Zero makes the results final the moment it ends.
 */
export const RESULTS_DELAY_MINUTES = [0, 15, 60, 360, 1440] as const;
export type ResultsDelay = (typeof RESULTS_DELAY_MINUTES)[number];

/**
 * An hour by default: long enough for a phone that was offline at the end to
 * come back and sync, short enough that the results are there the same
 * evening.
 */
export const DEFAULT_RESULTS_DELAY: ResultsDelay = 60;

export function isResultsDelay(value: unknown): value is ResultsDelay {
  return RESULTS_DELAY_MINUTES.includes(value as ResultsDelay);
}

/**
 * How early before the start a sentence may be dated, for a device whose
 * clock runs a little ahead.
 */
export const MARATHON_CLOCK_SLACK_MS = 5 * 60_000;

/**
 * Before the start, during it, after the end while the results wait for the
 * last syncs, and final.
 */
export type MarathonStatus = "upcoming" | "running" | "counting" | "finished";

export interface MarathonTimes {
  /** Epoch milliseconds. */
  readonly startsAt: number;
  /** Epoch milliseconds. */
  readonly endsAt: number;
}

/** When the results are final, in epoch milliseconds. */
export function resultsAt(times: MarathonTimes & { readonly resultsDelay: number }): number {
  return times.endsAt + times.resultsDelay * 60_000;
}

export function marathonStatus(
  times: MarathonTimes & { readonly resultsDelay: number },
  now: number,
): MarathonStatus {
  if (now < times.startsAt) return "upcoming";
  if (now < times.endsAt) return "running";
  return now < resultsAt(times) ? "counting" : "finished";
}

/**
 * Whether a start and an end make a marathon: in order, not too short or too
 * long, and not starting in the past or too far ahead. A start up to a
 * minute ago passes, so "start now" survives the trip to the server.
 */
export function isValidSchedule(times: MarathonTimes, now: number): boolean {
  const length = times.endsAt - times.startsAt;
  return (
    Number.isFinite(times.startsAt) &&
    Number.isFinite(times.endsAt) &&
    times.startsAt >= now - 60_000 &&
    times.startsAt <= now + MARATHON_LEAD_MAX_MS &&
    length >= MARATHON_MIN_MS &&
    length <= MARATHON_MAX_MS
  );
}

/**
 * Whether someone may still start running in it, rather than only watch:
 * before the end, and before the start unless the creator lets people join
 * late. A late runner starts from nothing like everyone else, just later.
 */
export function canEnter(
  marathon: MarathonTimes & { readonly allowsLateEntry: boolean },
  now: number,
): boolean {
  if (now >= marathon.endsAt) return false;
  return now < marathon.startsAt || marathon.allowsLateEntry;
}

/** One runner's line as the server last heard it. */
export interface RunnerScore {
  /** The score when they last synced. */
  readonly score: number;
  /** What it will be at the end if they read nothing more. Never above `score`. */
  readonly endScore: number;
  /** When they last synced, in epoch milliseconds, or null if they never have. */
  readonly scoredAt: number | null;
}

/**
 * A runner's score as of `now`, for the board.
 *
 * A score falls as a reader forgets, and only their own device can work out
 * by how much, so a runner who stopped would otherwise keep the score of
 * their last sync until the end. Each sync sends two numbers instead: the
 * score then, and what it will be at the end with nothing more read. The
 * board draws a straight line between them, and the next sync corrects it.
 * The real fall is a curve, steeper at first, so the line is a little off in
 * between and exact at both ends. Once the marathon is over, it is the
 * score at the end, which is what places are decided by.
 */
export function liveScore(runner: RunnerScore, endsAt: number, now: number): number {
  if (runner.scoredAt === null) return 0;
  if (now >= endsAt || runner.scoredAt >= endsAt) return runner.endScore;
  if (now <= runner.scoredAt) return runner.score;
  const share = (now - runner.scoredAt) / (endsAt - runner.scoredAt);
  return runner.score + (runner.endScore - runner.score) * share;
}

/** Where a runner's score starts from, for judging how fast it may grow: whichever came later. */
export function runStart(enteredAt: number, startsAt: number): number {
  return Math.max(enteredAt, startsAt);
}
