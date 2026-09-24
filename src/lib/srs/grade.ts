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

/**
 * How the reader's keys reached the page.
 *
 * Told apart by where the key came from, not by guessing at the device: a
 * tablet with a keyboard attached types through the keyboard path and is a
 * keyboard reader.
 */
export type InputMethod = "keyboard" | "touch" | "kana";

/**
 * Every input, in one list, for anything that goes through them all.
 *
 * `kana` is a Japanese keyboard, on a phone or a desk: it sends kana, one
 * press or flick per character, where the other two send romaji, a key per
 * letter. Different enough to get its own motor floor, so a reader who flicks
 * on the train and types romaji at home is measured fairly on both.
 */
export const INPUT_METHODS: readonly InputMethod[] = ["keyboard", "touch", "kana"];

/** What the reader's typing looks like on one kind of input. */
export interface InputModel {
  /** Rolling mean recognition latency across clean reviews, in milliseconds. */
  readonly baselineMs: number;
  /**
   * The fastest the reader reliably gets a first key down, in milliseconds.
   *
   * Everything a reader does before their first key is reading plus reaching
   * for the key. This is the reaching part: how long it takes this reader, on
   * this input, to press a key for a character they know cold. Taken away from
   * a latency, what is left is reading. It is why a fast typist and a slow one
   * with the same reading score the same, and why reading on the train does
   * not cost points against reading at a desk.
   */
  readonly floorMs: number;
  /** Clean reviews the baseline is built from. */
  readonly reviews: number;
}

/** What the reader's typing looks like, per input, used to normalise latency. */
export interface ReaderModel {
  readonly keyboard: InputModel;
  readonly touch: InputModel;
  readonly kana: InputModel;
}

/**
 * The starting baseline, used until the reader has enough reviews to have one of
 * their own. Deliberately generous: grading a beginner's first characters Hard
 * because they are slower than a fluent reader teaches the model nothing.
 */
export const INITIAL_BASELINE_MS = 800;

/**
 * Where the motor floor starts on each input, before the reader has shown theirs.
 *
 * A phone is slower to hit than a keyboard: the key is smaller, the thumb
 * travels further, and there is no home row to rest on.
 */
const INITIAL_FLOOR_MS: Readonly<Record<InputMethod, number>> = {
  keyboard: 250,
  touch: 350,
  // One press per character rather than two, but a flick is a small aimed
  // gesture, so it starts where a phone does and learns from there.
  kana: 350,
};

function initialInput(method: InputMethod): InputModel {
  return { baselineMs: INITIAL_BASELINE_MS, floorMs: INITIAL_FLOOR_MS[method], reviews: 0 };
}

export const INITIAL_READER: ReaderModel = {
  keyboard: initialInput("keyboard"),
  touch: initialInput("touch"),
  kana: initialInput("kana"),
};

/**
 * Reads a reader model as it was stored, whatever version wrote it.
 *
 * The first version kept one baseline with no idea which input it came from.
 * Every reader then was at a keyboard, because the app could not be typed on
 * anything else, so that baseline is their keyboard one.
 */
export function readerFrom(stored: unknown): ReaderModel {
  if (typeof stored !== "object" || stored === null) return INITIAL_READER;

  // Written before Japanese keyboards were read: no kana input yet, so it
  // starts fresh and the other two carry on as they were.
  if ("keyboard" in stored && "touch" in stored) {
    const model = stored as Omit<ReaderModel, "kana"> & { kana?: InputModel | null };
    return {
      keyboard: model.keyboard,
      touch: model.touch,
      kana: model.kana ?? initialInput("kana"),
    };
  }

  if ("baselineLatencyMs" in stored && typeof stored.baselineLatencyMs === "number") {
    const reviews = "reviews" in stored && typeof stored.reviews === "number" ? stored.reviews : 0;
    return {
      keyboard: { ...initialInput("keyboard"), baselineMs: stored.baselineLatencyMs, reviews },
      touch: initialInput("touch"),
      kana: initialInput("kana"),
    };
  }
  return INITIAL_READER;
}

/** The input the reader mostly reads on, for anything that needs one yardstick. */
export function primaryInput(reader: ReaderModel): InputModel {
  return INPUT_METHODS.map((method) => reader[method]).reduce((most, input) =>
    input.reviews > most.reviews ? input : most,
  );
}

// How fast the baseline follows the reader. Low enough that one slow sentence,
// or one interruption, does not move it much.
const BASELINE_WEIGHT = 0.05;

/**
 * How the motor floor moves. It tracks a low percentile of the reader's clean
 * latencies without keeping any of them: a read under the floor pulls it down
 * hard, a read over it nudges it up a little, and it settles where one read in
 * ten comes in under it.
 */
const FLOOR_PERCENTILE = 0.1;
const FLOOR_STEP_MS = 20;
const FLOOR_MINIMUM_MS = 80;

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

/** Folds one clean review into the reader's model for the input it came from. */
export function updateReader(
  reader: ReaderModel,
  latencyMs: number,
  method: InputMethod,
): ReaderModel {
  if (!isPlausibleLatency(latencyMs)) return reader;

  const input = reader[method];
  // Down 18ms for a read under the floor, up 2ms for one over it, which comes
  // to rest where one read in ten is under.
  const below = latencyMs < input.floorMs ? 1 : 0;
  const floorMs = Math.max(
    FLOOR_MINIMUM_MS,
    input.floorMs + FLOOR_STEP_MS * (FLOOR_PERCENTILE - below),
  );

  return {
    ...reader,
    [method]: {
      baselineMs: input.baselineMs + BASELINE_WEIGHT * (latencyMs - input.baselineMs),
      floorMs,
      reviews: input.reviews + 1,
    },
  };
}

/** How much of a latency was reading, with the reach for the key taken off. */
export function readingTime(latencyMs: number, reader: ReaderModel, method: InputMethod): number {
  return Math.max(0, latencyMs - reader[method].floorMs);
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
  method: InputMethod,
  thresholds: GradingThresholds = DEFAULT_THRESHOLDS,
): Grade {
  if (errors > 0) return Rating.Again;

  // An interruption says nothing about whether the reader knows the character,
  // so it is graded as if it were ordinary rather than counted against them.
  if (!isPlausibleLatency(latencyMs)) return Rating.Good;

  // Against this reader on this input. A phone is slower than a keyboard for
  // everyone, and measured against a keyboard baseline every read on the train
  // would grade Hard.
  const baseline = Math.max(reader[method].baselineMs, thresholds.minBaselineMs);
  const ratio = latencyMs / baseline;

  if (ratio > thresholds.hardRatio) return Rating.Hard;
  if (ratio > thresholds.goodRatio) return Rating.Good;
  return Rating.Easy;
}
