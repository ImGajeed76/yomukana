// The input state machine. Given a segmented sentence and the keys pressed so
// far, it says which keys are still acceptable and how much of the sentence is
// settled.
//
// Several spellings of a segment often share a prefix, and some spellings of one
// segment are a prefix of a spelling plus the start of the next. So the matcher
// keeps every reading of the input alive at once and lets later keys rule them
// out, the same way an IME does. A key is wrong only when it kills every
// remaining reading.

import { segmentKana, type Segment } from "./segment";

/** One live reading of the input: a chosen spelling of one segment, partly typed. */
interface Path {
  readonly segment: number;
  readonly spelling: string;
  readonly position: number;
}

export interface TypingState {
  readonly segments: readonly Segment[];
  /** Every key accepted so far, in order. */
  readonly keystrokes: readonly string[];
  readonly paths: readonly Path[];
  /** How many segments are settled. Segments below this index will not change. */
  readonly settled: number;
  readonly isComplete: boolean;
}

export interface PressResult {
  readonly state: TypingState;
  /** Whether the key belonged to at least one reading of the sentence. */
  readonly isAccepted: boolean;
  /** Segments settled by this key, as indices into `segments`. */
  readonly settledSegments: readonly number[];
}

interface Expansion {
  readonly paths: Path[];
  readonly isComplete: boolean;
}

/**
 * Opens every spelling of the next typeable segment at or after `index`.
 * `requiredInitial` carries a sokuon's chosen consonant forward: once the reader
 * has typed the `t` of `った`, only spellings of た starting with `t` remain.
 */
function expand(
  segments: readonly Segment[],
  index: number,
  requiredInitial: string | null,
): Expansion {
  let cursor = index;
  while (cursor < segments.length && segments[cursor]?.spellings.length === 0) {
    cursor += 1;
  }

  const segment = segments[cursor];
  if (segment === undefined) return { paths: [], isComplete: true };

  const paths: Path[] = [];
  for (const spelling of segment.spellings) {
    if (requiredInitial !== null && !spelling.startsWith(requiredInitial)) continue;
    paths.push({ segment: cursor, spelling, position: 0 });
  }
  return { paths, isComplete: false };
}

function settledCount(segments: readonly Segment[], paths: readonly Path[]): number {
  if (paths.length === 0) return segments.length;
  let lowest = segments.length;
  for (const path of paths) {
    if (path.segment < lowest) lowest = path.segment;
  }
  return lowest;
}

/** Starts a fresh attempt at the given segments. */
export function startTyping(segments: readonly Segment[]): TypingState {
  const opening = expand(segments, 0, null);
  return {
    segments,
    keystrokes: [],
    paths: opening.paths,
    settled: opening.isComplete ? segments.length : settledCount(segments, opening.paths),
    isComplete: opening.isComplete,
  };
}

/** Starts a fresh attempt at a kana string. */
export function startTypingKana(text: string): TypingState {
  return startTyping(segmentKana(text));
}

/**
 * Applies one key. A rejected key leaves the state untouched, so the caller can
 * count it as an error and carry on from where the reader was.
 */
export function press(state: TypingState, key: string): PressResult {
  const paths: Path[] = [];
  let hasCompleted = false;

  for (const path of state.paths) {
    if (path.spelling[path.position] !== key) continue;

    const position = path.position + 1;
    if (position < path.spelling.length) {
      paths.push({ ...path, position });
      continue;
    }

    // A one-letter sokuon spelling is the doubled consonant, so the following
    // segment has to start with that same letter.
    const segment = state.segments[path.segment];
    const requiredInitial =
      segment?.kind === "sokuon" && path.spelling.length === 1 ? path.spelling : null;

    const expansion = expand(state.segments, path.segment + 1, requiredInitial);
    if (expansion.isComplete) hasCompleted = true;
    paths.push(...expansion.paths);
  }

  if (paths.length === 0 && !hasCompleted) {
    return { state, isAccepted: false, settledSegments: [] };
  }

  // A shorter spelling can finish the sentence while a longer one is still being
  // typed: `hon` already spells ほん, but the reader may be on their way to
  // `honn`. Both are right, so completion sticks and the longer spelling stays
  // open. Every path still live at this point is on the final segment, so
  // whatever the reader does next either finishes it again or is rejected.
  const isComplete = hasCompleted || state.isComplete;

  // The reader is done, so everything behind them is settled.
  const settled = isComplete ? state.segments.length : settledCount(state.segments, paths);
  const settledSegments: number[] = [];
  for (let index = state.settled; index < settled; index++) {
    settledSegments.push(index);
  }

  return {
    state: {
      segments: state.segments,
      keystrokes: [...state.keystrokes, key],
      paths,
      settled,
      isComplete,
    },
    isAccepted: true,
    settledSegments,
  };
}

/**
 * Removes the last accepted key by replaying the rest. Replaying costs one pass
 * over the keystrokes, which is fine because backspace is rare. Trying to undo
 * an ambiguous match in place is not.
 */
export function backspace(state: TypingState): TypingState {
  if (state.keystrokes.length === 0) return state;
  const remaining = state.keystrokes.slice(0, -1);

  let replayed = startTyping(state.segments);
  for (const key of remaining) {
    replayed = press(replayed, key).state;
  }
  return replayed;
}

/** The keys that would be accepted next, given every live reading. */
export function acceptableKeys(state: TypingState): Set<string> {
  const keys = new Set<string>();
  for (const path of state.paths) {
    const key = path.spelling[path.position];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

/**
 * What the reader has typed towards the segment they are on. Ambiguous readings
 * always agree on this, because a key is only accepted if some reading consumed
 * it, and every reading of the current segment has consumed the same keys.
 */
export function typedInCurrentSegment(state: TypingState): string {
  for (const path of state.paths) {
    if (path.segment === state.settled) return path.spelling.slice(0, path.position);
  }
  return "";
}
