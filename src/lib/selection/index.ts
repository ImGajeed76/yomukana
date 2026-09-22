export { DEFAULT_OPTIONS, bucketFor, pickSentence, scoreSentence } from "./select";
export type { Bucket, Candidate, SelectionOptions, SentenceScore } from "./select";

export {
  CORE_HIRAGANA,
  CORE_KATAKANA,
  KANJI_HIRAGANA_THRESHOLD,
  KANJI_KATAKANA_THRESHOLD,
  KATAKANA_THRESHOLD,
  allowsKanji,
  allowsKatakana,
  hiraganaMastery,
  katakanaMastery,
} from "./gating";

export { DEFAULT_REVEAL, chooseRevealed } from "./reveal";
export type { RevealOptions } from "./reveal";

export { DEFAULT_PROGRESSION, START, advance, bandsAround } from "./progression";
export type { Outcome, Progression, ProgressionOptions } from "./progression";
