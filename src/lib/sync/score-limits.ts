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

/**
 * [minutes since starting, the most the fastest reader had by then], as the
 * simulation prints it. Copy it whole: the points are chosen so the lines
 * between them stay within minutes of the reader, and two points with the
 * same score are a break or a night, where a step starts (lastTimeAt).
 */
export const FASTEST_PATH: readonly (readonly [minutes: number, score: number])[] = [
  [0, 0],
  [0, 52],
  [0.05, 119],
  [0.2, 364],
  [0.36, 779],
  [0.98, 1765],
  [2.09, 2058],
  [3.65, 2193],
  [4.98, 2506],
  [9.07, 2690],
  [26.72, 3072],
  [49.9, 3348],
  [60.03, 3348],
  [68.38, 3811],
  [110.04, 4357],
  [120.15, 4357],
  [169.86, 4732],
  [180.04, 4732],
  [208.94, 4872],
  [218.02, 4875],
  [224.81, 4875],
  [224.82, 4876],
  [241.58, 4876],
  [241.59, 4877],
  [250.05, 4877],
  [250.06, 4878],
  [259.19, 4878],
  [259.2, 4879],
  [265.68, 4879],
  [265.69, 4880],
  [276.15, 4880],
  [276.16, 4881],
  [309.14, 4881],
  [309.15, 4882],
  [331.41, 4882],
  [331.42, 4883],
  [370.87, 4883],
  [370.88, 4884],
  [400.2, 4884],
  [400.21, 4885],
  [1470.25, 4885],
  [1470.5, 4889],
  [1500.02, 4889],
  [1500.45, 5052],
  [2881.52, 5052],
  [2898.11, 5238],
  [2940.1, 5238],
  [2940.65, 5284],
  [4380.53, 5284],
  [4409.51, 5397],
  [4429.87, 5461],
  [4440.28, 5461],
  [4464.16, 5522],
  [4489.98, 5572],
  [4500.81, 5572],
  [4528.74, 5620],
  [4532.35, 5621],
  [4537.47, 5621],
  [4537.64, 5623],
  [4543.2, 5623],
  [4543.21, 5624],
  [4560.08, 5624],
  [4564.21, 5626],
  [4569.72, 5626],
  [4577.88, 5630],
  [4585.98, 5630],
  [4591.68, 5634],
  [4598.57, 5634],
  [4601.31, 5637],
  [4610.01, 5637],
  [4610.02, 5638],
  [4622.34, 5638],
  [4630.49, 5645],
  [4639.46, 5645],
  [4649.29, 5651],
  [4654.37, 5651],
  [4669.8, 5660],
  [4680.96, 5660],
  [4689.1, 5665],
  [4694.98, 5665],
  [4703.37, 5670],
  [4725.47, 5680],
  [4742.62, 5680],
  [4788.45, 5726],
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
 * Steps up from scores accepted more recently than this are not held to the
 * path. The app sends a score after every sentence, and over a few sentences
 * how fast it grows depends on which sentences came up, not on the reader:
 * held to the path step by step, the fastest reader refused itself on most
 * syncs. An hour also leaves room for the few minutes the path may be off
 * (see scripts/simulate/fastest-reader.ts). The relearning limits cover
 * anything shorter.
 */
export const SHORTEST_STEP_MS = 60 * MINUTE_MS;

/** The relearning limits above, as the windows functions/api/score-check.ts reads. */
export const RELEARNING_WINDOWS = [
  { windowMs: 10 * MINUTE_MS, maxGain: RELEARN_MAX_PER_10_MIN },
  { windowMs: 60 * MINUTE_MS, maxGain: RELEARN_MAX_PER_HOUR },
  { windowMs: DAY_MS, maxGain: RELEARN_MAX_PER_DAY },
] as const;

type Path = readonly (readonly [minutes: number, score: number])[];

/**
 * The least time, in milliseconds, a real reader needs to reach `score` from
 * nothing: where the fastest path reaches it, shortened by the margin. Past
 * the end of the path, growth slows the way GAIN_PER_DAY_AFTER_PATH and
 * SLOWDOWN_DAYS say: a score of S there takes
 * SLOWDOWN_DAYS × (e^((S − end) / (gain × SLOWDOWN_DAYS)) − 1) days more.
 */
export function leastTimeTo(score: number): number {
  return leastTimeOn(FASTEST_PATH, score);
}

/**
 * The latest time, in milliseconds and shortened by the margin, the fastest
 * path still stands at `score`: the end of a stretch where it read nothing,
 * a break or a night, or else where it reached `score`. A step up from a
 * score is measured from here. Measured from where the path first reached
 * it, a reader who stopped at a score would be charged again for the
 * fastest reader's night.
 */
export function lastTimeAt(score: number): number {
  return lastTimeOn(FASTEST_PATH, score);
}

/** lastTimeAt along any path. */
export function lastTimeOn(path: Path, score: number): number {
  for (const [index, [toMinutes, toScore]] of path.entries()) {
    if (toScore <= score) continue;
    const [fromMinutes, fromScore] = path[index - 1] ?? [0, 0];
    const share = Math.max(0, (score - fromScore) / (toScore - fromScore));
    return ((fromMinutes + share * (toMinutes - fromMinutes)) * MINUTE_MS) / TIME_MARGIN;
  }
  // Past the path it never stands still, so the last time is the first.
  return leastTimeOn(path, score);
}

/** leastTimeTo along any path, so the simulation can check a path before it is written here. */
export function leastTimeOn(path: Path, score: number): number {
  let previous = path[0] ?? [0, 0];
  for (const point of path) {
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
