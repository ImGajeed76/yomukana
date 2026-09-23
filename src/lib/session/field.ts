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
