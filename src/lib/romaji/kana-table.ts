// The kana to romaji data the whole engine is built on. Data only: no matching
// logic lives here.
//
// Every entry lists the spellings a reader may legitimately type for that mora,
// preferred spelling first. Hepburn, Kunrei and Nihon are all accepted, because
// which one a learner knows depends entirely on which textbook they started
// with, and rejecting a spelling they were taught is the fastest way to lose
// them. See CLAUDE.md 3.4.

import { toCodePoints } from "../japanese/text";

/** Small kana that combine with a preceding mora into one segment. */
export const SMALL_KANA: ReadonlySet<string> = new Set([
  "ぁ",
  "ぃ",
  "ぅ",
  "ぇ",
  "ぉ",
  "ゃ",
  "ゅ",
  "ょ",
  "ゎ",
]);

/** The sokuon. Doubles the consonant of the mora that follows it. */
export const SOKUON = "っ";

/** The moraic nasal. Its spelling depends on what follows, so it is special-cased. */
export const MORAIC_N = "ん";

/** The katakana long vowel mark, typed as a hyphen. */
export const LONG_VOWEL = "ー";

/** Spellings accepted for the moraic nasal regardless of context. */
export const MORAIC_N_SPELLINGS: readonly string[] = ["nn", "n'", "xn"];

/** Spellings accepted for a standalone sokuon, when not typed as a doubled consonant. */
export const SOKUON_SPELLINGS: readonly string[] = ["ltu", "xtu", "ltsu", "xtsu"];

const BASE: readonly (readonly [string, readonly string[]])[] = [
  ["あ", ["a"]],
  ["い", ["i"]],
  ["う", ["u"]],
  ["え", ["e"]],
  ["お", ["o"]],
  ["か", ["ka"]],
  ["き", ["ki"]],
  ["く", ["ku"]],
  ["け", ["ke"]],
  ["こ", ["ko"]],
  ["が", ["ga"]],
  ["ぎ", ["gi"]],
  ["ぐ", ["gu"]],
  ["げ", ["ge"]],
  ["ご", ["go"]],
  ["さ", ["sa"]],
  ["し", ["shi", "si", "ci"]],
  ["す", ["su"]],
  ["せ", ["se"]],
  ["そ", ["so"]],
  ["ざ", ["za"]],
  ["じ", ["ji", "zi"]],
  ["ず", ["zu"]],
  ["ぜ", ["ze"]],
  ["ぞ", ["zo"]],
  ["た", ["ta"]],
  ["ち", ["chi", "ti"]],
  ["つ", ["tsu", "tu"]],
  ["て", ["te"]],
  ["と", ["to"]],
  ["だ", ["da"]],
  ["ぢ", ["di"]],
  ["づ", ["du"]],
  ["で", ["de"]],
  ["ど", ["do"]],
  ["な", ["na"]],
  ["に", ["ni"]],
  ["ぬ", ["nu"]],
  ["ね", ["ne"]],
  ["の", ["no"]],
  ["は", ["ha"]],
  ["ひ", ["hi"]],
  ["ふ", ["fu", "hu"]],
  ["へ", ["he"]],
  ["ほ", ["ho"]],
  ["ば", ["ba"]],
  ["び", ["bi"]],
  ["ぶ", ["bu"]],
  ["べ", ["be"]],
  ["ぼ", ["bo"]],
  ["ぱ", ["pa"]],
  ["ぴ", ["pi"]],
  ["ぷ", ["pu"]],
  ["ぺ", ["pe"]],
  ["ぽ", ["po"]],
  ["ま", ["ma"]],
  ["み", ["mi"]],
  ["む", ["mu"]],
  ["め", ["me"]],
  ["も", ["mo"]],
  ["や", ["ya"]],
  ["ゆ", ["yu"]],
  ["よ", ["yo"]],
  ["ら", ["ra"]],
  ["り", ["ri"]],
  ["る", ["ru"]],
  ["れ", ["re"]],
  ["ろ", ["ro"]],
  ["わ", ["wa"]],
  ["ゐ", ["wi"]],
  ["ゑ", ["we"]],
  ["を", ["wo"]],
  ["ゔ", ["vu"]],
  // Small kana standing alone. The `l` and `x` prefixes are what every Japanese
  // IME accepts, so a reader who learned to type on one expects them here.
  ["ぁ", ["la", "xa"]],
  ["ぃ", ["li", "xi"]],
  ["ぅ", ["lu", "xu"]],
  ["ぇ", ["le", "xe"]],
  ["ぉ", ["lo", "xo"]],
  ["ゃ", ["lya", "xya"]],
  ["ゅ", ["lyu", "xyu"]],
  ["ょ", ["lyo", "xyo"]],
  ["ゎ", ["lwa", "xwa"]],
];

// Rows whose youon is regular: the consonant cluster plus the small vowel.
const REGULAR_YOUON: readonly (readonly [string, string])[] = [
  ["き", "ky"],
  ["ぎ", "gy"],
  ["に", "ny"],
  ["ひ", "hy"],
  ["び", "by"],
  ["ぴ", "py"],
  ["み", "my"],
  ["り", "ry"],
];

const YOUON_VOWELS: readonly (readonly [string, string])[] = [
  ["ゃ", "a"],
  ["ゅ", "u"],
  ["ょ", "o"],
];

// Youon and foreign-sound combinations whose romanisation does not follow from
// the base mora. Written out because guessing them is exactly how this gets wrong.
const IRREGULAR_PAIRS: readonly (readonly [string, readonly string[]])[] = [
  ["しゃ", ["sha", "sya"]],
  ["しゅ", ["shu", "syu"]],
  ["しょ", ["sho", "syo"]],
  ["しぇ", ["she"]],
  ["じゃ", ["ja", "jya", "zya"]],
  ["じゅ", ["ju", "jyu", "zyu"]],
  ["じょ", ["jo", "jyo", "zyo"]],
  ["じぇ", ["je"]],
  ["ちゃ", ["cha", "tya", "cya"]],
  ["ちゅ", ["chu", "tyu", "cyu"]],
  ["ちょ", ["cho", "tyo", "cyo"]],
  ["ちぇ", ["che"]],
  ["ぢゃ", ["dya"]],
  ["ぢゅ", ["dyu"]],
  ["ぢょ", ["dyo"]],
  ["てぃ", ["thi"]],
  ["てゅ", ["thu"]],
  ["でぃ", ["dhi"]],
  ["でゅ", ["dhu"]],
  ["とぅ", ["twu"]],
  ["どぅ", ["dwu"]],
  ["ふぁ", ["fa"]],
  ["ふぃ", ["fi"]],
  ["ふぇ", ["fe"]],
  ["ふぉ", ["fo"]],
  ["ふゅ", ["fyu"]],
  ["ゔぁ", ["va"]],
  ["ゔぃ", ["vi"]],
  ["ゔぇ", ["ve"]],
  ["ゔぉ", ["vo"]],
  ["つぁ", ["tsa"]],
  ["つぃ", ["tsi"]],
  ["つぇ", ["tse"]],
  ["つぉ", ["tso"]],
  ["うぃ", ["wi"]],
  ["うぇ", ["we"]],
  ["うぉ", ["who"]],
];

/**
 * Japanese punctuation, which the reader never types.
 *
 * Hunting for a comma key is a typing chore, not a reading skill, and it breaks
 * the rhythm of a sentence at exactly the points where a reader should be
 * flowing. These characters stay on screen and are stepped over.
 */
export const PUNCTUATION: ReadonlySet<string> = new Set([
  "、",
  "。",
  "，",
  "．",
  "・",
  "「",
  "」",
  "『",
  "』",
  "（",
  "）",
  "？",
  "！",
  "〜",
  "　",
  " ",
]);

function buildMoraSpellings(): Map<string, readonly string[]> {
  const table = new Map<string, readonly string[]>(BASE);

  for (const [base, cluster] of REGULAR_YOUON) {
    for (const [small, vowel] of YOUON_VOWELS) {
      table.set(base + small, [cluster + vowel]);
    }
  }
  for (const [kana, spellings] of IRREGULAR_PAIRS) {
    table.set(kana, spellings);
  }

  // Every two-kana segment can also be typed the long way, as the big kana
  // followed by the small one. IMEs allow it and some readers type that way
  // for combinations they do not know the contracted spelling of.
  for (const [kana, spellings] of [...table]) {
    const parts = toCodePoints(kana);
    if (parts.length !== 2) continue;
    const [big, small] = parts;
    if (big === undefined || small === undefined) continue;
    const bigSpellings = table.get(big);
    const smallSpellings = table.get(small);
    if (bigSpellings === undefined || smallSpellings === undefined) continue;

    const decomposed: string[] = [];
    for (const head of bigSpellings) {
      for (const tail of smallSpellings) {
        decomposed.push(head + tail);
      }
    }
    table.set(kana, [...spellings, ...decomposed]);
  }

  return table;
}

/** Every typeable mora, mapped to its accepted spellings, preferred spelling first. */
export const MORA_SPELLINGS: ReadonlyMap<string, readonly string[]> = buildMoraSpellings();
