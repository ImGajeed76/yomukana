// Moves the reader between difficulty bands.
//
// The point is to notice quickly. A reader who is already past the material
// should not have to grind through a hundred sentences to get somewhere
// interesting, and a reader who is drowning should not have to ask for help.
// Three sentences in a row is enough evidence either way. See CLAUDE.md 0.

export interface Progression {
  readonly band: number;
  /** Sentences in a row with nothing left to learn in them. */
  readonly easyStreak: number;
  /** Sentences in a row the reader struggled through. */
  readonly hardStreak: number;
}

/** What one finished sentence says about whether the band still fits. */
export interface Outcome {
  /** Accepted keys over total keys. */
  readonly accuracy: number;
  /**
   * Mean recognition latency over this sentence, in multiples of the reader's
   * own baseline. Below 1 means they read this faster than they usually read.
   */
  readonly easeRatio: number;
  /**
   * How many items in the sentence the reader still needed to practise.
   *
   * The signal that actually says whether a band still fits. Ease is measured
   * against the reader's own baseline, and that baseline is a running mean of
   * the same latencies, so it follows them up and the ratio sits at 1 no matter
   * how much faster they get. A reader who tripled their speed over six hundred
   * sentences never once looked easy to it.
   *
   * This does not move with them. A band whose sentences have nothing left in
   * them to learn is a band they are done with, whatever the clock says.
   */
  readonly challenge: number;
}

export interface ProgressionOptions {
  readonly highestBand: number;
  /** Sentences in a row that must be easy before moving up. */
  readonly promoteAfter: number;
  /** Sentences in a row that must be hard before moving down. */
  readonly demoteAfter: number;
  /** Accuracy at or above this is clean enough to count as easy. */
  readonly easyAccuracy: number;
  /** Ease ratio at or below this is faster than the reader's norm. */
  readonly easyRatio: number;
  /** Accuracy below this counts the sentence as a struggle. */
  readonly strugglingAccuracy: number;
  /** Ease ratio above this counts the sentence as a struggle, however clean it was. */
  readonly strugglingRatio: number;
  /** At or below this many things left to practise, the band is done. */
  readonly easyChallenge: number;
  /** Above this many, the sentence was asking too much at once. */
  readonly hardChallenge: number;
}

export const DEFAULT_PROGRESSION: ProgressionOptions = {
  highestBand: 9,
  promoteAfter: 3,
  demoteAfter: 2,
  easyAccuracy: 0.98,
  easyRatio: 0.9,
  strugglingAccuracy: 0.9,
  strugglingRatio: 1.6,
  easyChallenge: 0,
  hardChallenge: 4,
};

export const START: Progression = { band: 0, easyStreak: 0, hardStreak: 0 };

function clamp(band: number, highest: number): number {
  return Math.min(Math.max(band, 0), highest);
}

/**
 * Folds one finished sentence into the reader's position.
 *
 * Readiness is measured, not counted. A sentence is easy when the reader typed
 * it cleanly and read it faster than they usually read, whatever the scheduler
 * thinks of the characters in it: meeting a character for the first time and
 * reading it instantly is exactly what being past the material looks like.
 *
 * This is what catches a reader who already knows Japanese. Their baseline
 * starts pessimistic, so their first sentences come in far under it and they are
 * promoted within a few sentences rather than a few hundred. Once the baseline
 * has caught up with them, ease stops saying anything and the count of things
 * left to learn takes over: they keep moving while the material keeps running
 * out, and settle where it stops running out.
 */
export function advance(
  progression: Progression,
  outcome: Outcome,
  options: ProgressionOptions = DEFAULT_PROGRESSION,
): Progression {
  const isStruggling =
    outcome.accuracy < options.strugglingAccuracy ||
    outcome.easeRatio > options.strugglingRatio ||
    outcome.challenge > options.hardChallenge;

  // Either kind of evidence is enough, as long as the reader read it cleanly.
  // Nothing left to learn is the one that keeps working once their baseline has
  // caught up with them.
  const isEasy =
    !isStruggling &&
    outcome.accuracy >= options.easyAccuracy &&
    (outcome.challenge <= options.easyChallenge || outcome.easeRatio <= options.easyRatio);

  if (isStruggling) {
    const hardStreak = progression.hardStreak + 1;
    if (hardStreak >= options.demoteAfter) {
      return {
        band: clamp(progression.band - 1, options.highestBand),
        easyStreak: 0,
        hardStreak: 0,
      };
    }
    return { band: progression.band, easyStreak: 0, hardStreak };
  }

  if (isEasy) {
    const easyStreak = progression.easyStreak + 1;
    if (easyStreak >= options.promoteAfter) {
      return {
        band: clamp(progression.band + 1, options.highestBand),
        easyStreak: 0,
        hardStreak: 0,
      };
    }
    return { band: progression.band, easyStreak, hardStreak: 0 };
  }

  // A sentence in the right range is the point. It resets both streaks: the
  // reader is where they should be.
  return { band: progression.band, easyStreak: 0, hardStreak: 0 };
}

/** The bands worth having loaded, so the selector always has room to move. */
export function bandsAround(band: number, highest: number): number[] {
  const bands: number[] = [];
  for (let candidate = band - 1; candidate <= band + 1; candidate++) {
    if (candidate >= 0 && candidate <= highest) bands.push(candidate);
  }
  return bands;
}
