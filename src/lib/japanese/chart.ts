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

const KATAKANA_SHIFT = 0x60;

function toKatakanaRow(row: ChartRow): ChartRow {
  return row.map((kana) => {
    if (kana === null) return null;
    const code = kana.codePointAt(0);
    return code === undefined ? kana : String.fromCodePoint(code + KATAKANA_SHIFT);
  });
}

export function toKatakanaChart(chart: readonly ChartRow[]): ChartRow[] {
  return chart.map(toKatakanaRow);
}

export const GOJUON_KATAKANA: readonly ChartRow[] = toKatakanaChart(GOJUON);
export const DAKUTEN_KATAKANA: readonly ChartRow[] = toKatakanaChart(DAKUTEN);
