// The kana chart, in the layout every learner has seen.
//
// Showing a reader their speed per character only helps if they can find the
// character. A sorted table cannot be scanned; the gojuon can, because they
// already know where か sits.

const GAP = null;

/** One row of the chart. `null` is a gap in the grid, not a missing character. */
export type ChartRow = readonly (string | null)[];

export const GOJUON: readonly ChartRow[] = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", GAP, "ゆ", GAP, "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", GAP, GAP, GAP, "を"],
  ["ん", GAP, GAP, GAP, GAP],
];

export const DAKUTEN: readonly ChartRow[] = [
  ["が", "ぎ", "ぐ", "げ", "ご"],
  ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ["だ", "ぢ", "づ", "で", "ど"],
  ["ば", "び", "ぶ", "べ", "ぼ"],
  ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
];

/**
 * The combinations: a consonant kana with a small ゃ, ゅ or ょ, read as one
 * sound and tracked as one item. The last row is the two marks that change the
 * sound around them, the small っ and the long vowel ー, which are items too.
 */
export const YOUON: readonly ChartRow[] = [
  ["きゃ", "きゅ", "きょ"],
  ["しゃ", "しゅ", "しょ"],
  ["ちゃ", "ちゅ", "ちょ"],
  ["にゃ", "にゅ", "にょ"],
  ["ひゃ", "ひゅ", "ひょ"],
  ["みゃ", "みゅ", "みょ"],
  ["りゃ", "りゅ", "りょ"],
  ["ぎゃ", "ぎゅ", "ぎょ"],
  ["じゃ", "じゅ", "じょ"],
  ["びゃ", "びゅ", "びょ"],
  ["ぴゃ", "ぴゅ", "ぴょ"],
  ["っ", "ー", GAP],
];

/**
 * Sounds only katakana writes, for loanwords: ファ in ファン, ティ in パーティー.
 * One family to a row rather than a vowel grid, because a grid of these is
 * mostly holes. Only the ones the corpus has, so no box is empty forever.
 */
export const EXTENDED_KATAKANA: readonly ChartRow[] = [
  ["ファ", "フィ", "フェ", "フォ", GAP],
  ["ウィ", "ウェ", "ウォ", GAP, GAP],
  ["ヴァ", "ヴィ", "ヴ", "ヴェ", GAP],
  ["ティ", "ディ", GAP, GAP, GAP],
  ["シェ", "ジェ", "チェ", GAP, GAP],
];

const KATAKANA_SHIFT = 0x60;
const HIRAGANA_FIRST = 0x3041;
const HIRAGANA_LAST = 0x3096;

/**
 * Every hiragana in the string as its katakana. Each character, not only the
 * first, or きゃ would come out as キゃ. ー is neither and stays as it is.
 */
function toKatakana(kana: string): string {
  let result = "";
  for (const character of kana) {
    const code = character.codePointAt(0) ?? 0;
    const isHiragana = code >= HIRAGANA_FIRST && code <= HIRAGANA_LAST;
    result += isHiragana ? String.fromCodePoint(code + KATAKANA_SHIFT) : character;
  }
  return result;
}

function toKatakanaRow(row: ChartRow): ChartRow {
  return row.map((kana) => (kana === null ? null : toKatakana(kana)));
}

export function toKatakanaChart(chart: readonly ChartRow[]): ChartRow[] {
  return chart.map(toKatakanaRow);
}

export const GOJUON_KATAKANA: readonly ChartRow[] = toKatakanaChart(GOJUON);
export const DAKUTEN_KATAKANA: readonly ChartRow[] = toKatakanaChart(DAKUTEN);
export const YOUON_KATAKANA: readonly ChartRow[] = toKatakanaChart(YOUON);
