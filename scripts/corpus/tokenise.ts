// Turns a written sentence into tokens with readings.
//
// This is the only place Japanese is morphologically analysed, and it runs at
// build time. If a reading here is wrong, every reader sees it wrong, so the
// rules below reject a sentence rather than guess at it. See CLAUDE.md 3.5.

import { builder, type IpadicFeatures } from "@sglkc/kuromoji";
import { isKanji, isKatakana, katakanaToHiragana, toCodePoints } from "../../src/lib/japanese/text";
import type { CorpusToken } from "../../src/lib/corpus/types";

const DICTIONARY_PATH = "node_modules/@sglkc/kuromoji/dict";

export type Tokenize = (text: string) => IpadicFeatures[];

/** Loads the dictionary once. It takes a few seconds and about 17MB. */
export function createTokenizer(): Promise<Tokenize> {
  return new Promise((resolve, reject) => {
    builder({ dicPath: DICTIONARY_PATH }).build((error, tokenizer) => {
      if (error as Error | null) {
        reject(error);
        return;
      }
      resolve((text) => tokenizer.tokenize(text));
    });
  });
}

function hasKanji(text: string): boolean {
  return toCodePoints(text).some(isKanji);
}

function hasKatakana(text: string): boolean {
  return toCodePoints(text).some(isKatakana);
}

export type RejectionReason = "no-reading" | "mixed-scripts-in-token" | "no-kana" | "empty";

export interface TokenizeResult {
  readonly tokens: readonly CorpusToken[] | null;
  readonly rejection: RejectionReason | null;
}

/**
 * Pairs each token with the kana a reader would say.
 *
 * Tokens without kanji keep their surface as the reading, so katakana stays
 * katakana: the reader has to recognise the script they were given, and turning
 * コーヒー into こーひー would both look wrong and teach the wrong thing.
 */
export function readTokens(features: readonly IpadicFeatures[]): TokenizeResult {
  if (features.length === 0) return { tokens: null, rejection: "empty" };

  const tokens: CorpusToken[] = [];
  let sawKana = false;

  for (const feature of features) {
    const surface = feature.surface_form;

    if (!hasKanji(surface)) {
      tokens.push({ surface, reading: surface });
      sawKana = true;
      continue;
    }

    // A token holding both kanji and katakana would lose its katakana when the
    // reading is folded to hiragana. Rare enough to skip rather than special-case.
    if (hasKatakana(surface)) {
      return { tokens: null, rejection: "mixed-scripts-in-token" };
    }

    const reading = feature.reading;
    if (reading === undefined || reading === "*") {
      return { tokens: null, rejection: "no-reading" };
    }

    tokens.push({ surface, reading: katakanaToHiragana(reading) });
  }

  // A sentence of pure kanji and punctuation gives the reader nothing to type.
  if (!sawKana && !tokens.some((token) => token.reading !== token.surface)) {
    return { tokens: null, rejection: "no-kana" };
  }

  return { tokens, rejection: null };
}
