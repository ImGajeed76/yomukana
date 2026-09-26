// What a simulated reader can really do, which the score is trying to say.
//
// Measured on real text: a fixed set of corpus sentences, drawn once with a
// fixed seed, read the way Japanese is actually written, with every kanji
// word in kanji. Sentences are drawn uniformly from the whole corpus, so
// common words turn up often and rare ones rarely, which is how often a
// reader meets them. The score never sees this. It is what the score is
// graded against.

import { tokenSpans } from "../../src/lib/corpus/display";
import { segmentsOf } from "../../src/lib/corpus/load";
import type { CorpusSentence } from "../../src/lib/corpus/types";
import { itemForSegment, kanjiItem } from "../../src/lib/srs";
import type { Brain } from "./brain";
import { seeded } from "./random";

/** What one reader can do, on the evaluation text, at one moment. */
export interface Truth {
  /**
   * The share of sentences they could read right now without getting stuck
   * anywhere, 0 to 1. The main measure: reading a sentence means reading all
   * of it, and a sentence with one unknown word in it is not read.
   */
  readonly sentences: number;
  /** The share of the text's morae they would read correctly, 0 to 1. */
  readonly coverage: number;
  /**
   * Average reading time per mora of the text, in milliseconds, with an
   * unknown word costing a lookup. Reading only: the hand is not in it.
   */
  readonly msPerMora: number;
}

/**
 * What an unknown word costs someone reading real text: stopping, looking it
 * up, finding the place again.
 */
const LOOKUP_MS = 8000;

/** One thing read in a sentence: a kanji word whole, or one kana. */
interface Occurrence {
  readonly id: string;
  readonly morae: number;
}

type Occurrences = readonly Occurrence[];

/** A fixed sample of the corpus to measure every reader on. */
export class EvaluationText {
  readonly #sentences: readonly Occurrences[];

  private constructor(sentences: readonly Occurrences[]) {
    this.#sentences = sentences;
  }

  /** Draws `count` sentences from the whole corpus, the same ones every time. */
  static draw(everything: readonly CorpusSentence[], count: number): EvaluationText {
    const random = seeded(4_000_400);
    const chosen: Occurrences[] = [];
    for (let index = 0; index < count; index++) {
      const sentence = everything[Math.floor(random() * everything.length)];
      if (sentence !== undefined) chosen.push(occurrencesOf(sentence));
    }
    return new EvaluationText(chosen);
  }

  /** How much of the text this reader reads, and how fast, at `now`. */
  measure(brain: Brain, now: number): Truth {
    let readable = 0;
    let morae = 0;
    let recalledMorae = 0;
    let time = 0;
    for (const sentence of this.#sentences) {
      let whole = 1;
      for (const { id, morae: length } of sentence) {
        const chance = brain.recall(id, now);
        whole *= chance;
        morae += length;
        recalledMorae += chance * length;
        time += chance * brain.readMs(id) + (1 - chance) * LOOKUP_MS;
      }
      readable += whole;
    }
    const count = this.#sentences.length;
    return {
      sentences: count === 0 ? 0 : readable / count,
      coverage: morae === 0 ? 0 : recalledMorae / morae,
      msPerMora: morae === 0 ? 0 : time / morae,
    };
  }
}

/** A sentence as it is written: each kanji word one item, every other character one each. */
function occurrencesOf(sentence: CorpusSentence): Occurrences {
  const segments = segmentsOf(sentence);
  const occurrences: Occurrence[] = [];
  for (const span of tokenSpans(sentence.tokens, segments)) {
    if (span.token.surface !== span.token.reading) {
      const id = kanjiItem(span.token.surface, span.token.reading).id;
      occurrences.push({ id, morae: Math.max(1, span.to - span.from) });
      continue;
    }
    for (let index = span.from; index < span.to; index++) {
      const segment = segments[index];
      const item = segment === undefined ? null : itemForSegment(segment);
      if (item !== null) occurrences.push({ id: item.id, morae: 1 });
    }
  }
  return occurrences;
}
