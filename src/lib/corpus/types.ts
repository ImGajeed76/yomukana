// The shape of the shipped corpus. Shared by the build scripts and the app, so
// a change to the format breaks the build rather than the reader's session.

/** One word, as written and as read. */
export interface CorpusToken {
  /** The token as it appears in the sentence, kanji and all. */
  readonly surface: string;
  /** The same token in hiragana. Equal to the surface for tokens already in kana. */
  readonly reading: string;
}

export interface CorpusSentence {
  /** Tatoeba sentence id, prefixed so ids from other sources cannot collide. */
  readonly id: string;
  readonly tokens: readonly CorpusToken[];
  /** English translation, shown after the attempt. */
  readonly meaning: string;
  /** Which band this sentence belongs to. Also the name of the chunk it ships in. */
  readonly band: number;
}

/** One shipped chunk: every sentence in one difficulty band. */
export interface CorpusChunk {
  readonly version: number;
  readonly band: number;
  readonly sentences: readonly CorpusSentence[];
}

/** The index the app loads first, to know which chunks exist. */
export interface CorpusIndex {
  readonly version: number;
  /** When the corpus was built, so a stale cache is visible. */
  readonly builtAt: string;
  readonly bands: readonly {
    readonly band: number;
    readonly file: string;
    readonly sentences: number;
  }[];
  readonly attribution: string;
}

export const CORPUS_VERSION = 1;

/**
 * Where the sentences come from. Tatoeba is CC BY 2.0 FR, so crediting it is a
 * licence condition, not a courtesy: it has to be visible wherever the sentences
 * are, which is everywhere in this app.
 */
export const ATTRIBUTION = {
  source: "Tatoeba",
  sourceUrl: "https://tatoeba.org",
  licence: "CC BY 2.0 FR",
  licenceUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  readings: "kuromoji and IPADic",
} as const;

/** The text the reader types, which is the sentence read out in kana. */
export function readingOf(sentence: CorpusSentence): string {
  let reading = "";
  for (const token of sentence.tokens) reading += token.reading;
  return reading;
}
