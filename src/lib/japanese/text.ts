// Text handling for Japanese, below everything else in the dependency order.
// No framework, no storage, no knowledge of typing.

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;

// Kanji are spread across several blocks, plus two single characters that
// behave like kanji without living in any of them: 々 repeats the kanji before
// it, and 〇 is a zero. Missing one of these means a sentence containing it
// silently looks like it has no kanji at all.
const KANJI_RANGES: readonly (readonly [number, number])[] = [
  [0x3005, 0x3005], // 々 iteration mark
  [0x3007, 0x3007], // 〇 ideographic zero
  [0x3400, 0x4dbf], // extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xf900, 0xfaff], // compatibility ideographs
  [0x20000, 0x2a6df], // extension B
];

/**
 * Splits text into code points.
 *
 * Code points, not graphemes, are the right unit for kana: none of them carries
 * a combining mark, and a kanji outside the basic plane is one code point across
 * two UTF-16 units, which is exactly what this keeps together. `Intl.Segmenter`
 * would go further and merge sequences that have to stay apart here, such as a
 * mora and the small kana that follows it.
 */
export function toCodePoints(text: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- see above
  return [...text];
}

/**
 * Converts katakana to the equivalent hiragana and leaves everything else alone.
 * The two scripts are laid out identically in Unicode, so this is one
 * subtraction per code point rather than a table.
 */
export function katakanaToHiragana(text: string): string {
  let result = "";
  for (const character of toCodePoints(text)) {
    const code = character.codePointAt(0);
    if (code !== undefined && code >= KATAKANA_START && code <= KATAKANA_END) {
      result += String.fromCodePoint(code - KATAKANA_TO_HIRAGANA_OFFSET);
    } else {
      result += character;
    }
  }
  return result;
}

function isInRange(character: string, start: number, end: number): boolean {
  const code = character.codePointAt(0);
  return code !== undefined && code >= start && code <= end;
}

export function isHiragana(character: string): boolean {
  return isInRange(character, HIRAGANA_START, HIRAGANA_END);
}

export function isKatakana(character: string): boolean {
  return isInRange(character, KATAKANA_START, KATAKANA_END);
}

export function isKanji(character: string): boolean {
  for (const [start, end] of KANJI_RANGES) {
    if (isInRange(character, start, end)) return true;
  }
  return false;
}

export type Script = "hiragana" | "katakana" | "kanji" | "other";

/** Which script a single character belongs to. */
export function scriptOf(character: string): Script {
  if (isHiragana(character)) return "hiragana";
  if (isKatakana(character)) return "katakana";
  if (isKanji(character)) return "kanji";
  return "other";
}
