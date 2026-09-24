// Reading keys back out of a text field, for phone keyboards.
//
// A physical keyboard says which key was pressed. A phone keyboard often does
// not: Gboard and most Android keyboards compose text as it is typed and report
// nearly every keydown as "Unidentified". What they do reliably is change the
// contents of the field they are typing into. So the field is read instead of
// the keys, and the difference between what it held and what it holds now is
// the keys the reader pressed.
//
// Pure, so the tricky part, a keyboard that rewrites a word it was composing,
// can be pinned in a test.

import { toCodePoints } from "../japanese/text";

export interface FieldChange {
  /** Characters removed from the end, each one a backspace. */
  readonly deleted: number;
  /** Characters added after that, each one a key. */
  readonly inserted: readonly string[];
}

/**
 * What changed between two values of the field.
 *
 * Anything after the first difference counts as deleted and retyped. That is
 * how a composing keyboard reports a word it is still building, `k` then `ka`
 * with the whole word replaced each time, and reading it as the shared prefix
 * plus a change at the end gets `k`, then `a`, which is what the reader typed.
 */
export function fieldChange(before: string, after: string): FieldChange {
  const was = toCodePoints(before);
  const now = toCodePoints(after);

  let shared = 0;
  while (shared < was.length && shared < now.length && was[shared] === now[shared]) shared += 1;

  return { deleted: was.length - shared, inserted: now.slice(shared) };
}

/** What one change to the field means for the exercise. */
export interface FieldReading {
  /** Backspaces to apply, enough to take back every key the deleted characters were. */
  readonly backspaces: number;
  /** Keys to apply after that, one character each. */
  readonly keys: readonly string[];
  /**
   * How many keys each character now in the field stands for, in order. Kept
   * between changes, because deleting ね has to take back two keys, not one.
   */
  readonly keyCounts: readonly number[];
}

/**
 * Reads a change to the field as backspaces and keys.
 *
 * A romaji keyboard puts one letter in per key, and nothing changes from how it
 * always worked. A Japanese keyboard puts in kana, one character for several
 * keys, and a flick keypad cycling な, に, ぬ replaces the last character each
 * time, which here takes back the keys of the one before and types the new one.
 *
 * A change that brings in something no keys spell, most often the keyboard
 * turning ねこ into 猫, is not read at all: the reader already typed the kana,
 * and converting them is the keyboard's business, not a correction.
 */
export function readFieldChange(
  keyCounts: readonly number[],
  change: FieldChange,
  spell: (character: string) => string | null,
): FieldReading {
  const kept = keyCounts.slice(0, Math.max(0, keyCounts.length - change.deleted));
  const removed = keyCounts.slice(kept.length);

  const spelled = change.inserted.map(spell);
  if (spelled.some((keys) => keys === null)) {
    return { backspaces: 0, keys: [], keyCounts: [...kept, ...change.inserted.map(() => 0)] };
  }

  const inserted = spelled.map((keys) => keys ?? "");
  return {
    backspaces: removed.reduce((total, count) => total + count, 0),
    keys: inserted.flatMap((keys) => toCodePoints(keys)),
    keyCounts: [...kept, ...inserted.map((keys) => keys.length)],
  };
}
