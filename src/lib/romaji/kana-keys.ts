// Turning kana a Japanese keyboard produced back into the keys that spell it.
//
// A reader on a Japanese keyboard, a phone's flick keypad or a romaji keyboard
// that composes as it goes, does not hand the app keys. They hand it kana: ね,
// not n then e. The exercise is still the same, did they read the character,
// so the kana is turned into a spelling the matcher already accepts and fed
// through it as if typed. Grading, timing and the romaji engine never learn
// that a Japanese keyboard was involved.

import { katakanaToHiragana, toCodePoints } from "../japanese/text";
import {
  LONG_VOWEL,
  MORAIC_N,
  MORAIC_N_SPELLINGS,
  MORA_SPELLINGS,
  PUNCTUATION,
  SOKUON,
  SOKUON_SPELLINGS,
} from "./kana-table";

// The one plain spelling of each of these that means the same on its own,
// whatever comes next. `nn` rather than `n`, because a bare n before a vowel
// would be read as the start of the next mora.
const STANDALONE: ReadonlyMap<string, string> = new Map([
  [MORAIC_N, MORAIC_N_SPELLINGS[0] ?? "nn"],
  [SOKUON, SOKUON_SPELLINGS[0] ?? "ltu"],
  [LONG_VOWEL, "-"],
]);

function isTypedLatin(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  // What a romaji keyboard sends: printable ASCII, a key each.
  return code > 0x20 && code < 0x7f;
}

/**
 * The keys that spell one character, or null for a character no keys spell.
 *
 * - Latin, from a romaji keyboard: itself, lowercased. One key.
 * - Kana, hiragana or katakana: its plain spelling. ね is `ne`, っ is `ltu`,
 *   and a small ゃ on its own is `lya`, which is how the matcher already
 *   accepts き followed by ゃ as きゃ.
 * - Japanese punctuation: nothing. The exercise steps over it anyway.
 * - Anything else, most often a kanji the keyboard converted to: null. It says
 *   nothing about which keys were read, and the caller leaves it alone.
 */
export function keysForCharacter(character: string): string | null {
  if (isTypedLatin(character)) return character.toLowerCase();
  if (PUNCTUATION.has(character)) return "";

  const kana = katakanaToHiragana(character);
  const standalone = STANDALONE.get(kana);
  if (standalone !== undefined) return standalone;
  return MORA_SPELLINGS.get(kana)?.[0] ?? null;
}

/** Whether a character is kana this can spell, rather than a key or something else. */
export function isSpellableKana(character: string): boolean {
  return !isTypedLatin(character) && (keysForCharacter(character) ?? "") !== "";
}

/** The keys that spell a run of characters, or null if any of them cannot be spelled. */
export function keysForText(text: string): string | null {
  let keys = "";
  for (const character of toCodePoints(text)) {
    const spelled = keysForCharacter(character);
    if (spelled === null) return null;
    keys += spelled;
  }
  return keys;
}
