// What a key press means, and what it does to an attempt.
//
// This is the whole of the typing screen's behaviour. It lives here rather than
// in the component so it can be driven key by key in a test, and so the
// component is left with nothing but rendering. See CLAUDE.md 3.2.

import { toCodePoints } from "../japanese/text";
import { backspaceKey, pressKey, type Attempt } from "./attempt";

export type KeyAction =
  | { readonly kind: "type"; readonly key: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "ignore" };

/** The parts of a keyboard event this cares about. */
export interface KeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const IGNORED: KeyAction = { kind: "ignore" };

/**
 * Decides what a key press is for.
 *
 * A key held with a modifier belongs to the browser or the operating system, not
 * to the exercise: a reader pressing Ctrl+R wants to reload, not to type an r.
 * Everything else that is a single character is input, lowercased because the
 * spellings are, and caps lock should not be a wall of errors.
 */
export function classifyKey(event: KeyEvent): KeyAction {
  if (event.ctrlKey || event.metaKey || event.altKey) return IGNORED;
  if (event.key === "Backspace") return { kind: "backspace" };
  if (toCodePoints(event.key).length !== 1) return IGNORED;

  return { kind: "type", key: event.key.toLowerCase() };
}

export interface KeyOutcome {
  readonly attempt: Attempt;
  /** Whether this key was wrong, which the view shows and then clears. */
  readonly wasRejected: boolean;
}

/**
 * Restarts the clock at the first key.
 *
 * The attempt is created when the sentence appears, which may be long before the
 * reader looks at it. Measuring the first segment from then would record how long
 * they spent getting a coffee.
 */
function startClock(attempt: Attempt, at: number): Attempt {
  return { ...attempt, startedAt: at, availableAt: at };
}

export function applyKey(attempt: Attempt, action: KeyAction, at: number): KeyOutcome {
  if (action.kind === "ignore") return { attempt, wasRejected: false };
  if (action.kind === "backspace") {
    return { attempt: backspaceKey(attempt, at), wasRejected: false };
  }

  const started = attempt.keyCount === 0 ? startClock(attempt, at) : attempt;
  const next = pressKey(started, action.key, at);

  return { attempt: next, wasRejected: next.errors > started.errors };
}

/** Whether this key press is the exercise's rather than the browser's. */
export function shouldPreventDefault(action: KeyAction): boolean {
  return action.kind !== "ignore";
}
