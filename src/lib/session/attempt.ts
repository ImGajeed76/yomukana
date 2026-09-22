// One reader's pass over one sentence, with the timing that makes it a
// measurement rather than a game.
//
// Timestamps are passed in rather than read from a clock, so an attempt is a
// plain value a test can drive keystroke by keystroke. The caller takes the time
// at the DOM event, before any framework work has run. See CLAUDE.md 1.8.

import { backspace, press, startTyping, type Segment, type TypingState } from "../romaji";

export interface SegmentTiming {
  readonly segment: number;
  /** When the reader could first have started this segment. */
  readonly availableAt: number;
  /** The first key aimed at this segment, right or wrong. */
  readonly firstKeyAt: number;
  /** When no reading of the input could change this segment any more. */
  readonly settledAt: number;
  /** Wrong keys pressed while this segment was the current one. */
  readonly errors: number;
  /**
   * Whether this timing is a real measurement.
   *
   * It is not when a backspace disturbed the segment, and it is not for the
   * first segment of a sentence: there is no earlier segment to measure the
   * pause from, and the reader may have been looking away. Grading drops these
   * rather than scoring them as instant reads.
   */
  readonly isReliable: boolean;
}

export interface Attempt {
  readonly typing: TypingState;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  /** Settled segments, in the order they settled. */
  readonly timings: readonly SegmentTiming[];
  /** Wrong keys over the whole attempt. */
  readonly errors: number;
  /** Keys pressed over the whole attempt, right and wrong. */
  readonly keyCount: number;

  /** When the current segment became available. */
  readonly availableAt: number;
  /** The first key aimed at the current segment, or null if none yet. */
  readonly firstKeyAt: number | null;
  /** Wrong keys against the current segment. */
  readonly pendingErrors: number;
  /** Whether a backspace has disturbed the current segment. */
  readonly isCurrentCorrected: boolean;
}

export function startAttempt(segments: readonly Segment[], at: number): Attempt {
  return {
    typing: startTyping(segments),
    startedAt: at,
    finishedAt: null,
    timings: [],
    errors: 0,
    keyCount: 0,
    availableAt: at,
    firstKeyAt: null,
    pendingErrors: 0,
    isCurrentCorrected: false,
  };
}

/**
 * Records one key.
 *
 * A wrong key still counts as the reader having acted, so it starts the clock on
 * the current segment. Recognition is the gap between seeing a character and
 * reaching for a key, and reaching for the wrong one does not undo that.
 */
export function pressKey(attempt: Attempt, key: string, at: number): Attempt {
  if (attempt.finishedAt !== null) return attempt;

  const result = press(attempt.typing, key);
  const firstKeyAt = attempt.firstKeyAt ?? at;
  const keyCount = attempt.keyCount + 1;

  if (!result.isAccepted) {
    return {
      ...attempt,
      keyCount,
      firstKeyAt,
      errors: attempt.errors + 1,
      pendingErrors: attempt.pendingErrors + 1,
    };
  }

  const timings = [...attempt.timings];
  const isFirstSettle = attempt.timings.length === 0;
  for (const segment of result.settledSegments) {
    timings.push({
      segment,
      availableAt: attempt.availableAt,
      firstKeyAt,
      settledAt: at,
      errors: attempt.pendingErrors,
      isReliable: !attempt.isCurrentCorrected && !isFirstSettle,
    });
  }

  const hasSettled = result.settledSegments.length > 0;
  return {
    ...attempt,
    typing: result.state,
    keyCount,
    timings,
    finishedAt: result.state.isComplete ? at : null,
    availableAt: hasSettled ? at : attempt.availableAt,
    firstKeyAt: hasSettled ? null : firstKeyAt,
    pendingErrors: hasSettled ? 0 : attempt.pendingErrors,
    isCurrentCorrected: hasSettled ? false : attempt.isCurrentCorrected,
  };
}

/**
 * Undoes the last accepted key.
 *
 * Everything a backspace touches stops being a clean measurement: the reader has
 * now seen the character for longer than the timer says, and may be copying the
 * spelling rather than reading it. So the affected segments lose their timing and
 * the current one is flagged, and grading drops them rather than trusting them.
 */
export function backspaceKey(attempt: Attempt, at: number): Attempt {
  if (attempt.finishedAt !== null) return attempt;

  const typing = backspace(attempt.typing);
  if (typing.keystrokes.length === attempt.typing.keystrokes.length) return attempt;

  const timings = attempt.timings.filter((timing) => timing.segment < typing.settled);

  return {
    ...attempt,
    typing,
    timings,
    keyCount: attempt.keyCount + 1,
    availableAt: at,
    firstKeyAt: null,
    pendingErrors: 0,
    isCurrentCorrected: true,
  };
}

/** How long the reader took to reach for the first key of a segment. */
export function recognitionLatency(timing: SegmentTiming): number {
  return timing.firstKeyAt - timing.availableAt;
}

/**
 * What a segment is scored on.
 *
 * A clean read is measured to the first key, because that is recognition and
 * nothing else: it compares fairly between あ, which is one keystroke, and きゃ,
 * which is three, where measuring to the end would mark the longer mora slow for
 * being longer rather than for being harder.
 *
 * The moment a wrong key lands, that reading stops being available. Reaching for
 * a key is not knowing which one, and a reader who hammers a key the instant a
 * character appears would otherwise post a perfect recognition time on every
 * character in the sentence while getting all of them wrong. So an errored
 * segment is measured to the point it was finally typed correctly, which is the
 * honest answer to "how long did that character cost you".
 */
export function measuredLatency(timing: SegmentTiming): number {
  return timing.errors === 0 ? recognitionLatency(timing) : timing.settledAt - timing.availableAt;
}

/** Timings clean enough to feed the memory model. */
export function usableTimings(attempt: Attempt): SegmentTiming[] {
  return attempt.timings.filter((timing) => timing.isReliable);
}

export interface AttemptSummary {
  readonly durationMs: number;
  readonly errors: number;
  readonly keyCount: number;
  /** Accepted keys over total keys, 1 when nothing was typed. */
  readonly accuracy: number;
  /** Settled segments per minute, the reading-speed headline. */
  readonly segmentsPerMinute: number;
}

const MS_PER_MINUTE = 60_000;

export function summarise(attempt: Attempt): AttemptSummary {
  const end = attempt.finishedAt ?? attempt.startedAt;
  const durationMs = end - attempt.startedAt;
  const accepted = attempt.keyCount - attempt.errors;

  return {
    durationMs,
    errors: attempt.errors,
    keyCount: attempt.keyCount,
    accuracy: attempt.keyCount === 0 ? 1 : accepted / attempt.keyCount,
    segmentsPerMinute: durationMs === 0 ? 0 : (attempt.timings.length / durationMs) * MS_PER_MINUTE,
  };
}
