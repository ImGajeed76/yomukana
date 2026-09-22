// Loads the shipped corpus, one difficulty band at a time.
//
// Bands are separate files so a reader downloads the few thousand sentences
// around their level rather than the whole corpus. They are cached in memory for
// the session; the browser's own HTTP cache handles the rest.

import { isKatakana, toCodePoints } from "../japanese/text";
import { segmentKana, type Segment } from "../romaji";
import type { Candidate } from "../selection";
import { itemsForSegments, kanjiItem, type Item } from "../srs";
import { readingOf, type CorpusIndex, type CorpusSentence } from "./types";

const BASE_PATH = "/corpus";

export type Fetcher = typeof globalThis.fetch;

export interface CandidateFilter {
  /** Whether sentences containing katakana may be shown. */
  readonly allowKatakana: boolean;
  /**
   * Whether words may appear in kanji yet.
   *
   * Until they can, a sentence tests only the kana it is read as, and offering
   * the selector kanji items it will never get a review for would leave every
   * sentence looking impossibly hard.
   */
  readonly allowKanji: boolean;
}

interface Entry {
  /** What the sentence tests while everything is still written in kana. */
  readonly kana: Candidate;
  /** And once kanji are showing, which is where the difficulty bands live. */
  readonly written: Candidate;
  readonly sentence: CorpusSentence;
  readonly hasKatakana: boolean;
}

function hasKatakana(sentence: CorpusSentence): boolean {
  for (const token of sentence.tokens) {
    if (toCodePoints(token.reading).some(isKatakana)) return true;
  }
  return false;
}

/**
 * Every word in the sentence that is written rather than spelled out.
 *
 * These are what a difficulty band actually is. Ranked on kanji rarity when the
 * corpus was built, so a selector that cannot see them cannot tell band 0 from
 * band 9: it sees the same hundred-odd kana in both and calls them equally
 * finished. See CLAUDE.md 2 on a kanji plus a reading being its own item.
 */
function writtenWords(sentence: CorpusSentence): Item[] {
  const words: Item[] = [];
  for (const token of sentence.tokens) {
    if (token.surface !== token.reading) words.push(kanjiItem(token.surface, token.reading));
  }
  return words;
}

function toEntry(sentence: CorpusSentence): Entry {
  const kana = itemsForSegments(segmentKana(readingOf(sentence)));
  return {
    kana: { id: sentence.id, band: sentence.band, items: kana },
    written: { id: sentence.id, band: sentence.band, items: [...kana, ...writtenWords(sentence)] },
    sentence,
    hasKatakana: hasKatakana(sentence),
  };
}

export class Corpus {
  #index: CorpusIndex | null = null;
  readonly #entries = new Map<number, Entry[]>();
  readonly #byId = new Map<string, CorpusSentence>();
  readonly #fetch: Fetcher;

  constructor(fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {
    this.#fetch = fetcher;
  }

  get isOpen(): boolean {
    return this.#index !== null;
  }

  get highestBand(): number {
    const bands = this.#index?.bands ?? [];
    return bands.length === 0 ? 0 : bands.length - 1;
  }

  /** Reads the index, which says which bands exist. */
  async open(): Promise<void> {
    const response = await this.#fetch(`${BASE_PATH}/index.json`);
    if (!response.ok) throw new Error(`corpus index responded ${String(response.status)}`);
    this.#index = (await response.json()) as CorpusIndex;
  }

  /** Downloads any of these bands that are not in memory yet. */
  async ensure(bands: readonly number[]): Promise<void> {
    const index = this.#index;
    if (index === null) return;

    await Promise.all(
      bands.map(async (band) => {
        if (this.#entries.has(band)) return;
        const descriptor = index.bands.find((candidate) => candidate.band === band);
        if (descriptor === undefined) return;

        const response = await this.#fetch(`${BASE_PATH}/${descriptor.file}`);
        if (!response.ok) return;

        const chunk = (await response.json()) as { sentences: CorpusSentence[] };
        const entries = chunk.sentences.map(toEntry);
        for (const entry of entries) this.#byId.set(entry.sentence.id, entry.sentence);
        this.#entries.set(band, entries);
      }),
    );
  }

  /** Every loaded candidate from these bands that the filter allows. */
  candidates(bands: readonly number[], filter: CandidateFilter): Candidate[] {
    const candidates: Candidate[] = [];

    for (const band of bands) {
      for (const entry of this.#entries.get(band) ?? []) {
        // Katakana is withheld until hiragana is solid, and the cheapest way to
        // withhold it is to not offer sentences that contain it.
        if (entry.hasKatakana && !filter.allowKatakana) continue;
        candidates.push(filter.allowKanji ? entry.written : entry.kana);
      }
    }
    return candidates;
  }

  sentence(id: string): CorpusSentence | null {
    return this.#byId.get(id) ?? null;
  }

  /** The typing segments for one sentence, computed on demand. */
  segmentsFor(id: string): readonly Segment[] {
    const sentence = this.#byId.get(id);
    return sentence === undefined ? [] : segmentKana(readingOf(sentence));
  }
}
