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
 * A change that brings in something no keys spell is a conversion: the
 * keyboard turning ねこ into 猫, on its own or, with live conversion, in the
 * same step as the next kana, ねこ becoming 猫が. The kanji stand for the kana
 * they replaced, so they take over those keys, and deleting 猫 later takes
 * back ね and こ. Only what comes after the last kanji is new typing.
 */
export function readFieldChange(
  keyCounts: readonly number[],
  change: FieldChange,
  spell: (character: string) => string | null,
): FieldReading {
  const kept = keyCounts.slice(0, Math.max(0, keyCounts.length - change.deleted));
  const removed = keyCounts.slice(kept.length);
  const removedKeys = removed.reduce((total, count) => total + count, 0);

  const spelled = change.inserted.map(spell);
  const lastConverted = spelled.findLastIndex((keys) => keys === null);

  // What the keyboard converted: it replaces the deleted characters and keeps
  // their keys, all counted on its first character.
  const converted = lastConverted === -1 ? [] : spelled.slice(0, lastConverted + 1);
  const convertedCounts = converted.map((_, index) => (index === 0 ? removedKeys : 0));
  // What was typed after it, or the whole change when nothing was converted.
  const typed = spelled.slice(lastConverted + 1).map((keys) => keys ?? "");

  return {
    backspaces: lastConverted === -1 ? removedKeys : 0,
    keys: typed.flatMap((keys) => toCodePoints(keys)),
    keyCounts: [...kept, ...convertedCounts, ...typed.map((keys) => keys.length)],
  };
}
