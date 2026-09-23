// One reader's pass over one sentence, with the timing that makes it a
// measurement rather than a game.
//
// Timestamps are passed in rather than read from a clock, so an attempt is a
// plain value a test can drive keystroke by keystroke. The caller takes the time
// at the DOM event, before any framework work has run. See CLAUDE.md 1.8.

import {
  backspace,
  press,
  startTyping,
  typedInCurrentSegment,
  type Segment,
  type TypingState,
} from "../romaji";

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
   * pause from, and the reader may have been looking away.
   *
   * It is also not when the key that settled the previous segment was already
   * part of this one. ん is the common case: it can be spelled `n` or `nn`, so
   * it does not settle until the next key rules one of those out, and that key
   * is the first key of the mora after it. The pause before that mora happened
   * inside ん's window and is already counted there; what is left is the gap
   * between two keystrokes, which is typing speed. Recording it as recognition
   * marked every mora after ん as instantly read.
   *
   * Grading drops all of these rather than scoring them as instant reads.
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
  /** Whether the current segment was already begun by the key that freed it. */
  readonly isCurrentCarried: boolean;

  /**
   * Wrong keys the reader has typed and not yet deleted.
   *
   * They land rather than being refused. A refused key is still typed in the
   * reader's head, so their next backspace reaches for it and deletes a key
   * they got right instead, and the input stops matching what they believe
   * they typed. Landing, shown in red, and deleted by hand, the screen and
   * their head agree. Nothing else is accepted until they are gone.
   */
  readonly stray: string;
  /** What the reader typed for each settled segment, by segment index. */
  readonly typedBySegment: readonly string[];
  /** Keystrokes already handed to settled segments. */
  readonly settledKeys: number;
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
    isCurrentCarried: false,
    stray: "",
    typedBySegment: [],
    settledKeys: 0,
  };
}

/**
 * Shares the keys that settled a run of segments out between them.
 *
 * Usually one segment settles and it gets every key. When several settle on the
 * same key, the spellings decide where each one's keys end: っ then た from
 * `tta` is `t` and `ta`. Only what is shown under each character depends on it,
 * so when no split fits, the first segment takes the lot rather than anything
 * being lost.
 */
function shareKeys(segments: readonly Segment[], keys: string): string[] {
  if (segments.length === 0) return [];

  const [first, ...rest] = segments;
  if (first === undefined) return [];
  if (first.spellings.length === 0) return ["", ...shareKeys(rest, keys)];
  if (rest.length === 0) return [keys];

  for (const spelling of first.spellings) {
    if (!keys.startsWith(spelling)) continue;
    const tail = shareKeys(rest, keys.slice(spelling.length));
    if (tail.join("") === keys.slice(spelling.length)) return [spelling, ...tail];
  }
  return [keys, ...rest.map(() => "")];
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

  const firstKeyAt = attempt.firstKeyAt ?? at;
  const keyCount = attempt.keyCount + 1;

  // Once something wrong is on the screen, everything after it is wrong too:
  // it is sitting after a mistake. It lands with the mistake and waits for the
  // reader to delete back to where they went off.
  const result = attempt.stray === "" ? press(attempt.typing, key) : null;

  if (result?.isAccepted !== true) {
    return {
      ...attempt,
      keyCount,
      firstKeyAt,
      errors: attempt.errors + 1,
      pendingErrors: attempt.pendingErrors + 1,
      stray: attempt.stray + key,
    };
  }

  const timings = [...attempt.timings];
  const isFirstSettle = attempt.timings.length === 0;
  for (const segment of result.settledSegments) {
    // Punctuation, and a っ with nothing after it to double, are shown and
    // stepped over, never typed, so they settle for free alongside the mora
    // before them. Counting them as characters read inflates reading speed, and
    // by more in sentences that happen to have more commas in them.
    // See CLAUDE.md 3.3.
    if (attempt.typing.segments[segment]?.spellings.length === 0) continue;

    timings.push({
      segment,
      availableAt: attempt.availableAt,
      firstKeyAt,
      settledAt: at,
      errors: attempt.pendingErrors,
      isReliable: !attempt.isCurrentCorrected && !isFirstSettle && !attempt.isCurrentCarried,
    });
  }

  const hasSettled = result.settledSegments.length > 0;
  const current = typedInCurrentSegment(result.state);
  // This key both finished the last segment and began the next one, so the next
  // one has no measurable pause of its own.
  const carried = hasSettled && current.length > 0;

  // The keys between the last settle and the start of whatever is in progress
  // belong to the segments that just settled.
  let typedBySegment = attempt.typedBySegment;
  let settledKeys = attempt.settledKeys;
  if (hasSettled) {
    const end = result.state.keystrokes.length - current.length;
    const keys = result.state.keystrokes.slice(settledKeys, end).join("");
    const settled = result.settledSegments.map((index) => result.state.segments[index]);
    typedBySegment = [
      ...typedBySegment,
      ...shareKeys(
        settled.filter((segment) => segment !== undefined),
        keys,
      ),
    ];
    settledKeys = end;
  }

  return {
    ...attempt,
    typing: result.state,
    keyCount,
    timings,
    typedBySegment,
    settledKeys,
    finishedAt: result.state.isComplete ? at : null,
    availableAt: hasSettled ? at : attempt.availableAt,
    firstKeyAt: hasSettled ? null : firstKeyAt,
    pendingErrors: hasSettled ? 0 : attempt.pendingErrors,
    isCurrentCorrected: hasSettled ? false : attempt.isCurrentCorrected,
    isCurrentCarried: hasSettled ? carried : attempt.isCurrentCarried,
  };
}

/**
 * Deletes one key.
 *
 * Wrong keys go first, since they are the last thing on the screen. Deleting
 * them is the ordinary way through a mistake and changes nothing else: the
 * mistake is already counted, and the segment is timed to when it finally came
 * out right.
 *
 * Past those, only keys in the character still being typed can be deleted. A
 * character that is finished and right stays finished. Going back into one
 * means the reader has seen it for longer than the timer says and may be
 * copying the spelling rather than reading it, and nothing about a finished,
 * correct character needs fixing.
 *
 * Deleting a key they got right does flag the current character, and grading
 * drops it rather than trusting it.
 */
export function backspaceKey(attempt: Attempt, at: number): Attempt {
  if (attempt.finishedAt !== null) return attempt;

  if (attempt.stray !== "") return { ...attempt, stray: attempt.stray.slice(0, -1) };
  if (typedInCurrentSegment(attempt.typing) === "") return attempt;

  const typing = backspace(attempt.typing);
  if (typing.keystrokes.length === attempt.typing.keystrokes.length) return attempt;

  // Deleting the key that began this character can reopen the one before it,
  // when that one was waiting on this key to settle: ん, finished by the `w`
  // of を, is open again once the `w` is gone. Its timing and its typed keys go
  // back with it.
  const timings = attempt.timings.filter((timing) => timing.segment < typing.settled);
  const typedBySegment = attempt.typedBySegment.slice(0, typing.settled);
  let settledKeys = 0;
  for (const keys of typedBySegment) settledKeys += keys.length;

  return {
    ...attempt,
    typing,
    timings,
    typedBySegment,
    settledKeys,
    // Not counted as a key. Accuracy is accepted keys over keys pressed, so
    // counting corrections as keys means the more a reader backspaces the more
    // accurate they look: five wrong keys plus enough retyping reads as 99%.
    availableAt: at,
    firstKeyAt: null,
    // Kept. The reader did get this character wrong, whatever they delete now.
    pendingErrors: attempt.pendingErrors,
    isCurrentCorrected: true,
    isCurrentCarried: false,
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
