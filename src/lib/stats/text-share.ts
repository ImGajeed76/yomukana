// How much of real Japanese text each item is, which is what the score weighs
// an item by.
//
// Counted once over the whole corpus, as the text is written: a kanji word is
// one use each time it appears, and every kana outside a kanji word is one use
// of that kana. So a word on every page counts for far more than one that
// turns up once, the way it does for someone reading. The corpus build writes
// the counts to static/corpus/text-share.json; the app fetches that once.

import { tokenSpans } from "../corpus/display";
import { segmentsOf } from "../corpus/load";
import type { CorpusSentence } from "../corpus/types";
import { itemForSegment, kanjiItem } from "../srs";

export interface TextShare {
  /** How many times each item turns up in the corpus. */
  readonly usesOf: ReadonlyMap<string, number>;
  /** Every use of every item, together. */
  readonly totalUses: number;
}

/** The file the corpus build writes: item id to uses, and their total. */
export interface TextShareFile {
  readonly totalUses: number;
  readonly uses: Readonly<Record<string, number>>;
}

/** Counts every item's uses across `sentences`, as the text is written. */
export function countUses(sentences: Iterable<CorpusSentence>): TextShareFile {
  const uses: Record<string, number> = {};
  let totalUses = 0;
  const use = (id: string): void => {
    uses[id] = (uses[id] ?? 0) + 1;
    totalUses += 1;
  };
  for (const sentence of sentences) {
    const segments = segmentsOf(sentence);
    for (const span of tokenSpans(sentence.tokens, segments)) {
      if (span.token.surface !== span.token.reading) {
        use(kanjiItem(span.token.surface, span.token.reading).id);
        continue;
      }
      for (let index = span.from; index < span.to; index++) {
        const segment = segments[index];
        const item = segment === undefined ? null : itemForSegment(segment);
        if (item !== null) use(item.id);
      }
    }
  }
  return { totalUses, uses };
}

export function textShareFrom(file: TextShareFile): TextShare {
  return { usesOf: new Map(Object.entries(file.uses)), totalUses: file.totalUses };
}

let loading: Promise<TextShare> | null = null;

/**
 * The counts, fetched the first time something asks and kept for the rest of
 * the visit. Cached offline with the corpus by the service worker.
 */
export function loadTextShare(): Promise<TextShare> {
  loading ??= fetch("/corpus/text-share.json")
    .then((response) => response.json() as Promise<TextShareFile>)
    .then(textShareFrom);
  return loading;
}
