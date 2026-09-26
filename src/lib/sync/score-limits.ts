// How fast a score can honestly grow.
//
// Measured, not guessed: scripts/simulate/fastest-reader.ts runs the fastest
// reader who is still plausible through the real practice loop. No wrong
// keys, no skips, every character read at the fastest pace the app believes
// (40 ms reading, 120 ms to reach a key, 60 ms between keys), eight
// fifty-minute sittings a day. A fluent reader who never tires.
//
// Its path is the limit, not a rate: it climbs to 4,876 in four hours, then
// by a few hundred a day as what it read sets in. See
// functions/api/score-check.ts for how the path is used. There is no ceiling:
// past the end of what was measured, a score may keep growing forever, but
// each day by less than the last. Pure, so the app and the API function share
// one copy.
//
// Rerun the simulation and update these whenever the corpus, the selector or
// the score changes: `bun scripts/simulate/fastest-reader.ts 4`.

/** [minutes since starting, the most the fastest reader had by then], from the simulation. */
export const FASTEST_PATH: readonly (readonly [minutes: number, score: number])[] = [
  [0, 0],
  [5, 2375],
  [10, 2690],
  [20, 2919],
  [30, 3101],
  [45, 3280],
  [60, 3348],
  [90, 4095],
  [120, 4357],
  [180, 4732],
  [240, 4876],
  [1440, 4885],
  [2880, 5052],
  [4320, 5284],
  [5760, 5726],
];

/**
 * How much a day may add at the end of the measured path: the fastest
 * reader's last measured day.
 */
export const GAIN_PER_DAY_AFTER_PATH = 442;

/**
 * How many days past the end of the path it takes for a day's allowance to
 * halve. It keeps halving, so growth never stops and never runs away: a
 * year past the path allows about 34,000 points more.
 */
export const SLOWDOWN_DAYS = 30;

/**
 * How much faster than the simulated reader a real one is allowed to be.
 * On time, not on score: a margin on score would hand out most of the path
 * at once, because it is so steep at the start.
 */
export const TIME_MARGIN = 1.5;

// How fast a score may climb back to a best it has had before, as after a
// break: the largest gain the simulation saw in each window, times 1.5.

/** 2,690 simulated. */
export const RELEARN_MAX_PER_10_MIN = 4000;
/** 3,348 simulated. */
export const RELEARN_MAX_PER_HOUR = 5100;
/** 4,885 simulated. */
export const RELEARN_MAX_PER_DAY = 7400;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * The least time, in milliseconds, a real reader needs to reach `score` from
 * nothing: where the fastest path reaches it, shortened by the margin. Past
 * the end of the path, growth slows the way GAIN_PER_DAY_AFTER_PATH and
 * SLOWDOWN_DAYS say: a score of S there takes
 * SLOWDOWN_DAYS × (e^((S − end) / (gain × SLOWDOWN_DAYS)) − 1) days more.
 */
export function leastTimeTo(score: number): number {
  let previous = FASTEST_PATH[0] ?? [0, 0];
  for (const point of FASTEST_PATH) {
    const [minutes, reached] = point;
    if (score <= reached) {
      const [fromMinutes, fromScore] = previous;
      const share = reached === fromScore ? 1 : (score - fromScore) / (reached - fromScore);
      return ((fromMinutes + share * (minutes - fromMinutes)) * MINUTE_MS) / TIME_MARGIN;
    }
    previous = point;
  }
  const [lastMinutes, lastScore] = previous;
  const beyondDays =
    SLOWDOWN_DAYS * (Math.exp((score - lastScore) / (GAIN_PER_DAY_AFTER_PATH * SLOWDOWN_DAYS)) - 1);
  return (lastMinutes * MINUTE_MS + beyondDays * DAY_MS) / TIME_MARGIN;
}
