// Turns a measured keystroke into an FSRS grade.
//
// The reader never presses Again or Good. The grade comes from how long they
// took to start the segment and whether they got it right, which is the whole
// reason this app measures anything.
//
// Latency is judged against the reader's own recent latency, not a fixed number
// of milliseconds. A reader who types 40 words a minute and one who types 90
// both produce the same grades for characters they know equally well, which is
// what makes the model about reading rather than about typing.

import { Rating, type Grade } from "ts-fsrs";

export interface GradingThresholds {
  /** Latency above this multiple of the reader's baseline counts as Hard. */
  readonly hardRatio: number;
  /** Latency above this multiple counts as Good. Below it, Easy. */
  readonly goodRatio: number;
  /** Floor for the baseline, so an unusually fast run cannot make everything Hard. */
  readonly minBaselineMs: number;
}

/**
 * Easy is meant to be rare.
 *
 * The baseline is the reader's own mean, so a threshold above 1 hands out Easy
 * for roughly every second review, and FSRS takes that at its word: six of them
 * in a row pushes an interval past sixty years and the character never comes
 * back. Easy has to mean clearly faster than this reader usually manages, which
 * is what a ratio well under 1 says.
 */
export const DEFAULT_THRESHOLDS: GradingThresholds = {
  hardRatio: 2,
  goodRatio: 0.7,
  minBaselineMs: 120,
};

/** What the reader's typing looks like in general, used to normalise latency. */
export interface ReaderModel {
  /** Rolling mean recognition latency across clean reviews, in milliseconds. */
  readonly baselineLatencyMs: number;
  /** Clean reviews the baseline is built from. */
  readonly reviews: number;
}

/**
 * The starting baseline, used until the reader has enough reviews to have one of
 * their own. Deliberately generous: grading a beginner's first characters Hard
 * because they are slower than a fluent reader teaches the model nothing.
 */
export const INITIAL_BASELINE_MS = 800;

export const INITIAL_READER: ReaderModel = {
  baselineLatencyMs: INITIAL_BASELINE_MS,
  reviews: 0,
};

// How fast the baseline follows the reader. Low enough that one slow sentence,
// or one interruption, does not move it much.
const BASELINE_WEIGHT = 0.05;

// Latency above this is a break, not a read: the reader looked away, took a
// call, or left the tab. Folding it into the baseline would wreck it.
//
// Generous on purpose. At five seconds it was catching real reading: a beginner
// genuinely stuck on a character for six seconds had that character thrown out
// of the record, graded Good, scheduled further away, and then scored as if
// they had read it at the reference pace. Fifteen seconds is someone who has
// stopped, not someone who is working it out.
const OUTLIER_LATENCY_MS = 15_000;

/** Whether a latency is plausible as reading time rather than an interruption. */
export function isPlausibleLatency(latencyMs: number): boolean {
  return latencyMs >= 0 && latencyMs < OUTLIER_LATENCY_MS;
}

/**
 * How far above what a character currently costs a single read may count.
 *
 * Three is high enough that genuinely forgetting a character still registers as
 * a shock, and low enough that a sneeze does not.
 */
const SLOW_READ_MULTIPLE = 3;

/**
 * Trims one reading before it is folded into a character's estimate.
 *
 * Recognition times are not symmetric around their middle. They pile up near a
 * floor and trail off to the right, because everything that goes wrong makes a
 * read slower and nothing makes it faster than knowing the character. So the
 * occasional read is inflated by something that has nothing to do with reading:
 * a glance at the window, a hand off the keyboard, a thought about lunch.
 *
 * Those are capped rather than averaged in or thrown away. A read slower than
 * {@link SLOW_READ_MULTIPLE} times what this character currently costs is
 * recorded at that multiple. It still counts as slow, it just cannot count as
 * catastrophic, and a reader who has genuinely lost a character still gets there
 * within a few reads as the estimate climbs to meet them.
 *
 * The grade is worked out from the untrimmed reading, so the scheduler sees the
 * real thing and reacts to it. Only the number the reader is shown, and scored
 * on, is trimmed.
 */
export function trimReading(latencyMs: number, estimateMs: number | null): number {
  if (estimateMs === null) return latencyMs;
  return Math.min(latencyMs, estimateMs * SLOW_READ_MULTIPLE);
}

/** Folds one clean review into the reader's baseline. */
export function updateReader(reader: ReaderModel, latencyMs: number): ReaderModel {
  if (!isPlausibleLatency(latencyMs)) return reader;

  return {
    baselineLatencyMs:
      reader.baselineLatencyMs + BASELINE_WEIGHT * (latencyMs - reader.baselineLatencyMs),
    reviews: reader.reviews + 1,
  };
}

/**
 * Grades one review.
 *
 * Any wrong key is Again: the reader either misread the character or does not
 * know how to spell it, and both mean they need to see it again soon. Above that
 * it is latency alone, measured in multiples of the reader's baseline.
 */
export function gradeReview(
  latencyMs: number,
  errors: number,
  reader: ReaderModel,
  thresholds: GradingThresholds = DEFAULT_THRESHOLDS,
): Grade {
  if (errors > 0) return Rating.Again;

  // An interruption says nothing about whether the reader knows the character,
  // so it is graded as if it were ordinary rather than counted against them.
  if (!isPlausibleLatency(latencyMs)) return Rating.Good;

  const baseline = Math.max(reader.baselineLatencyMs, thresholds.minBaselineMs);
  const ratio = latencyMs / baseline;

  if (ratio > thresholds.hardRatio) return Rating.Hard;
  if (ratio > thresholds.goodRatio) return Rating.Good;
  return Rating.Easy;
}
