// What a key press means, and what it does to an attempt.
//
// This is the whole of the typing screen's behaviour. It lives here rather than
// in the component so it can be driven key by key in a test, and so the
// component is left with nothing but rendering. See CLAUDE.md 3.2.

import { toCodePoints } from "../japanese/text";
import { keypadNeighbours, keysForCharacter } from "../romaji/kana-keys";
import type { InputMethod } from "../srs";
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
function startClock(attempt: Attempt, at: number, method: InputMethod): Attempt {
  return { ...attempt, startedAt: at, availableAt: at, input: method };
}

/**
 * Applies one key to an attempt.
 *
 * `method` is where the key came from. The first key of a sentence decides it
 * for the whole sentence, since nobody changes device halfway through one.
 */
export function applyKey(
  attempt: Attempt,
  action: KeyAction,
  at: number,
  method: InputMethod = "keyboard",
): KeyOutcome {
  if (action.kind === "ignore") return { attempt, wasRejected: false };
  if (action.kind === "backspace") {
    return { attempt: backspaceKey(attempt, at), wasRejected: false };
  }

  const started = attempt.keyCount === 0 ? startClock(attempt, at, method) : attempt;
  const next = pressKey(started, action.key, at);

  return { attempt: next, wasRejected: next.errors > started.errors };
}

/** Whether this key press is the exercise's rather than the browser's. */
export function shouldPreventDefault(action: KeyAction): boolean {
  return action.kind !== "ignore";
}

/** Whether every key of `keys` would be taken, starting from `attempt`. */
function takesAll(attempt: Attempt, keys: string, at: number): boolean {
  let state = attempt;
  for (const key of keys) {
    const outcome = applyKey(state, { kind: "type", key }, at);
    if (outcome.wasRejected) return false;
    state = outcome.attempt;
  }
  return true;
}

/**
 * Whether a phone keypad's kana should be held rather than typed: it would be
 * a mistake here, and another kana on the same keypad key would not. The
 * reader is most likely still on their way to that one. See Keypad in field.ts.
 *
 * `before` is what the same field change does first, so the kana is judged
 * where it will land.
 */
export function shouldHoldKana(
  attempt: Attempt,
  character: string,
  before: { readonly backspaces: number; readonly keys: readonly string[] },
  at: number,
): boolean {
  const own = keysForCharacter(character);
  if (own === null || own === "") return false;

  let state = attempt;
  for (let count = 0; count < before.backspaces; count++) {
    state = applyKey(state, { kind: "backspace" }, at).attempt;
  }
  for (const key of before.keys) state = applyKey(state, { kind: "type", key }, at).attempt;

  if (takesAll(state, own, at)) return false;
  return keypadNeighbours(character).some((neighbour) => {
    const keys = keysForCharacter(neighbour) ?? "";
    return keys !== "" && takesAll(state, keys, at);
  });
}
