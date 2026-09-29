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

// The keys of a Japanese phone keypad, one row of the gojuon each. Multitap
// cycles through a key's kana, な, に, ぬ, ね, and the ゛゜小 key turns the
// last one into its voiced, half-voiced or small form. Either way the reader
// passes through kana they did not mean on the way to the one they did.
const KEYPAD_ROWS: readonly string[] = [
  "あいうえお",
  "かきくけこ",
  "さしすせそ",
  "たちつてと",
  "なにぬねの",
  "はひふへほ",
  "まみむめも",
  "やゆよ",
  "らりるれろ",
  "わをんー",
];

const SMALL_FORMS: ReadonlyMap<string, string> = new Map([
  ["あ", "ぁ"],
  ["い", "ぃ"],
  ["う", "ぅ"],
  ["え", "ぇ"],
  ["お", "ぉ"],
  ["つ", "っ"],
  ["や", "ゃ"],
  ["ゆ", "ゅ"],
  ["よ", "ょ"],
  ["わ", "ゎ"],
]);

// Combining, so NFC folds them into the kana before: か plus this is が.
const DAKUTEN = String.fromCodePoint(0x3099);
const HANDAKUTEN = String.fromCodePoint(0x309a);

/** A kana with a combining mark, or nothing if the two do not make one character. */
function withMark(kana: string, mark: string): string[] {
  const combined = (kana + mark).normalize("NFC");
  return toCodePoints(combined).length === 1 ? [combined] : [];
}

/** Every kana each keypad key can produce, keyed by each of those kana. */
const KEYPAD_KEYS: ReadonlyMap<string, readonly string[]> = (() => {
  const keys = new Map<string, readonly string[]>();
  for (const row of KEYPAD_ROWS) {
    const kana = toCodePoints(row).flatMap((base) => [
      base,
      ...withMark(base, DAKUTEN),
      ...withMark(base, HANDAKUTEN),
      ...(SMALL_FORMS.has(base) ? [SMALL_FORMS.get(base) ?? base] : []),
    ]);
    for (const each of kana) keys.set(each, kana);
  }
  return keys;
})();

/**
 * The other kana on the same phone keypad key as this one, including what the
 * ゛゜小 key makes of them. Hiragana, whichever script `character` was in: the
 * two are spelled alike. Empty for anything that is not kana.
 */
export function keypadNeighbours(character: string): readonly string[] {
  const kana = katakanaToHiragana(character);
  return (KEYPAD_KEYS.get(kana) ?? []).filter((each) => each !== kana);
}
