// Parses the Tatoeba Japanese indices, which carry hand-checked readings for the
// words a machine would get wrong.
//
// The analyser picks a reading from context and is usually right, but it has no
// way to know that 表 in 表に出ようか is おもて rather than ひょう. The indices
// annotate exactly those cases, so where they disagree with the analyser, they
// win. A reader taught the wrong reading learns it wrongly for good.
//
// Entry format, one token per space-separated group:
//   headword(reading)[sense]{surface}~
// Every part after the headword is optional. Parentheses holding a `#` are a
// cross-reference id, not a reading.

import type { CorpusToken } from "../../src/lib/corpus/types";

export interface IndexToken {
  /** The dictionary form. */
  readonly headword: string;
  /** The hand-checked reading, when the entry gives one. */
  readonly reading: string | null;
  /** The inflected form as it appears in the sentence, when it differs. */
  readonly surface: string | null;
}

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS: ReadonlyMap<string, string> = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);

function readBracket(text: string, start: number): { content: string; next: number } | null {
  const opener = text[start];
  if (opener === undefined) return null;
  const closer = CLOSERS.get(opener);
  if (closer === undefined) return null;

  const end = text.indexOf(closer, start + 1);
  if (end === -1) return null;
  return { content: text.slice(start + 1, end), next: end + 1 };
}

function parseToken(raw: string): IndexToken | null {
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character === undefined || OPENERS.has(character) || character === "~") break;
    index += 1;
  }

  const headword = raw.slice(0, index);
  if (headword.length === 0) return null;

  let reading: string | null = null;
  let surface: string | null = null;

  while (index < raw.length) {
    const character = raw[index];
    if (character === undefined) break;

    if (character === "~") {
      index += 1;
      continue;
    }
    if (!OPENERS.has(character)) break;

    const bracket = readBracket(raw, index);
    if (bracket === null) break;

    // A cross-reference id shares the parentheses with readings, so it has to be
    // told apart by its leading marker rather than by position.
    if (character === "(" && !bracket.content.startsWith("#")) reading = bracket.content;
    if (character === "{") surface = bracket.content;
    index = bracket.next;
  }

  return { headword, reading, surface };
}

/** Every annotated token of one indices line. */
export function parseIndexTokens(text: string): IndexToken[] {
  const tokens: IndexToken[] = [];
  for (const raw of text.split(" ")) {
    if (raw.length === 0) continue;
    const token = parseToken(raw);
    if (token !== null) tokens.push(token);
  }
  return tokens;
}

/**
 * Readings the indices vouch for, keyed by the written form they apply to.
 *
 * Only uninflected entries are usable: when the indices give 戻る(もどる) for a
 * sentence containing 戻ります, the reading belongs to the dictionary form and
 * says nothing about how to read what is on the page.
 */
export function checkedReadings(tokens: readonly IndexToken[]): Map<string, string> {
  const readings = new Map<string, string>();

  for (const token of tokens) {
    if (token.reading === null) continue;
    if (token.surface !== null && token.surface !== token.headword) continue;
    readings.set(token.headword, token.reading);
  }
  return readings;
}

export interface CorrectionResult {
  readonly tokens: readonly CorpusToken[];
  /** How many readings the indices overruled. */
  readonly corrections: number;
}

/** Replaces analyser readings with the hand-checked ones where they disagree. */
export function applyCheckedReadings(
  tokens: readonly CorpusToken[],
  checked: ReadonlyMap<string, string>,
): CorrectionResult {
  if (checked.size === 0) return { tokens, corrections: 0 };

  let corrections = 0;
  const corrected = tokens.map((token) => {
    const reading = checked.get(token.surface);
    if (reading === undefined || reading === token.reading) return token;

    corrections += 1;
    return { surface: token.surface, reading };
  });

  return { tokens: corrected, corrections };
}
