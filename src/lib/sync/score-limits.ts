// How fast a score can honestly grow, and how high it can go at all.
//
// Measured, not guessed: scripts/simulate/fastest-reader.ts runs the fastest
// reader who is still plausible through the real practice loop. No wrong
// keys, no skips, every character read at the fastest pace the score gives
// credit for (40 ms reading, 120 ms to reach a key, 60 ms between keys), eight
// fifty-minute sittings a day. A fluent reader who never tires.
//
// Its path is the limit, not a rate: it climbs to 164,225 in four hours, adds
// about 11,000 on the second day, then stays put. See functions/api/score-check.ts
// for how the path is used. Pure, so the app and the API function share one copy.
//
// Rerun the simulation and update these when the corpus, the selector or the
// score changes: `bun scripts/simulate/fastest-reader.ts 4`.

/** [minutes since starting, the most the fastest reader had by then], from the simulation. */
export const FASTEST_PATH: readonly (readonly [minutes: number, score: number])[] = [
  [0, 0],
  [5, 4050],
  [10, 8913],
  [20, 17_450],
  [30, 26_350],
  [45, 40_188],
  [60, 45_775],
  [90, 73_600],
  [120, 92_925],
  [180, 139_913],
  [240, 164_225],
  [2880, 180_977],
];

/**
 * How much a day adds past the end of the path. The simulated reader stopped
 * growing there, because the selector offers nothing new, so this is the
 * second day's gain, the last real growth it had. Generous on purpose: if the
 * selector ever offers more, readers can still climb.
 */
export const FASTEST_DAILY_GAIN_AFTER = 11_398;

/**
 * How much faster than the simulated reader a real one is allowed to be.
 * On time, not on score: a margin on score would let a four-hour-old account
 * claim nearly everything there is, because the path is so steep early on.
 */
export const TIME_MARGIN = 1.5;

/**
 * The highest score the corpus allows at all, exactly: every item in it
 * (207 kana, 4,563 words), each remembered for certain and read at the fastest
 * pace. No margin: nothing can go past it. The simulation prints it again when
 * the corpus is rebuilt.
 */
export const SCORE_CEILING = 290_363;

// How fast a score may climb back to a best it has had before, as after a
// break: the largest gain the simulation saw in each window, times 1.5.

/** 9,925 simulated. */
export const RELEARN_MAX_PER_10_MIN = 15_000;
/** 47,400 simulated. */
export const RELEARN_MAX_PER_HOUR = 72_000;
/** 164,225 simulated. */
export const RELEARN_MAX_PER_DAY = 247_000;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * The least time, in milliseconds, a real reader needs to reach `score` from
 * nothing: where the fastest path reaches it, shortened by the margin.
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
  const beyond = ((score - lastScore) / FASTEST_DAILY_GAIN_AFTER) * DAY_MS;
  return (lastMinutes * MINUTE_MS + beyond) / TIME_MARGIN;
}
