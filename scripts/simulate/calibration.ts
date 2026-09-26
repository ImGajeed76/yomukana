// How far off FSRS's recall is for one reader, learned from their own reviews.
//
// FSRS assumes one forgetting curve for everybody. People forget faster or
// slower than that, so its "chance of recall" is too high for some and too
// low for others, and a score built on it ranks them wrongly. Every review is
// evidence: FSRS said 90%, and the reader got it right or did not. This keeps
// one number per reader, a shift in log-odds, nudged after every review toward
// what actually happened, and applies it to every recall the score uses.
//
// Pure and tiny, so the app can keep the same number in the reader model.

/** How far one review moves the shift. Small, so one unlucky day does not swing it. */
const LEARNING_RATE = 0.01;

/** Recall that close to 0 or 1 says nothing a shift could fix, and breaks the logarithm. */
const EDGE = 1e-4;

function logit(chance: number): number {
  const clamped = Math.min(1 - EDGE, Math.max(EDGE, chance));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/** Recall as FSRS says, corrected for this reader. */
export function calibrated(recall: number, shift: number): number {
  return sigmoid(logit(recall) + shift);
}

/**
 * The shift after one more review: `predicted` is what FSRS said before it,
 * `isRecalled` what happened.
 */
export function updatedShift(shift: number, predicted: number, isRecalled: boolean): number {
  const expected = calibrated(predicted, shift);
  return shift + LEARNING_RATE * ((isRecalled ? 1 : 0) - expected);
}
