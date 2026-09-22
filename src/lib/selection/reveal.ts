// Chooses which words in a sentence appear as kanji.
//
// Once the kanji gate is open, a sentence should not turn into kanji all at
// once. Words the reader has met before stay written, and one unfamiliar word is
// added. That keeps a sentence readable while still putting something new in
// front of them, which is the same rule the sentence selector follows.

import type { CorpusToken } from "../corpus/types";
import { isWrittenDifferently } from "../corpus/display";
import { kanjiItem, type ItemStore } from "../srs";
import { bucketFor } from "./select";

export interface RevealOptions {
  /** Unfamiliar written words to introduce in one sentence. */
  readonly maxNew: number;
}

export const DEFAULT_REVEAL: RevealOptions = { maxNew: 1 };

/**
 * The indices of the tokens to show in their written form.
 *
 * Returns indices rather than the tokens themselves because a sentence can hold
 * the same word twice, and both occurrences should look the same.
 */
export function chooseRevealed(
  tokens: readonly CorpusToken[],
  store: ItemStore,
  now: Date,
  options: RevealOptions = DEFAULT_REVEAL,
): Set<number> {
  const revealed = new Set<number>();
  const introduced = new Set<string>();
  let newWords = 0;

  for (const [index, token] of tokens.entries()) {
    if (!isWrittenDifferently(token)) continue;

    const id = kanjiItem(token.surface, token.reading).id;
    const isNew = bucketFor(store.items.get(id), now) === "new";

    if (!isNew || introduced.has(id)) {
      revealed.add(index);
      continue;
    }
    if (newWords < options.maxNew) {
      revealed.add(index);
      introduced.add(id);
      newWords += 1;
    }
  }

  return revealed;
}
