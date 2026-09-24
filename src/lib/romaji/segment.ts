// Splits a kana string into the units a reader types one at a time.
//
// A segment is the unit timing is attributed to, so the split matters beyond
// correctness: きゃ is one segment because a reader recognises it as one thing,
// while っ is its own segment because the pause before a doubled consonant is
// real reading time.

import { katakanaToHiragana, toCodePoints } from "../japanese/text";
import {
  LONG_VOWEL,
  MORAIC_N,
  MORAIC_N_SPELLINGS,
  MORA_SPELLINGS,
  PUNCTUATION,
  SMALL_KANA,
  SOKUON,
  SOKUON_SPELLINGS,
} from "./kana-table";

export type SegmentKind = "mora" | "sokuon" | "moraic-n" | "punctuation" | "untypeable";

export interface Segment {
  /** The characters as they appear in the source text. */
  readonly display: string;
  /** The same characters normalised to hiragana, for table lookup. */
  readonly kana: string;
  readonly kind: SegmentKind;
  /** Spellings the reader may type, preferred spelling first. */
  readonly spellings: readonly string[];
}

const VOWELS: ReadonlySet<string> = new Set(["a", "i", "u", "e", "o"]);

/** The vowel each small vowel kana stands for when it stands alone. */
const STRETCHED_VOWELS: ReadonlyMap<string, string> = new Map([
  ["ぁ", "a"],
  ["ぃ", "i"],
  ["ぅ", "u"],
  ["ぇ", "e"],
  ["ぉ", "o"],
]);

interface RawSegment {
  display: string;
  kana: string;
  kind: SegmentKind;
  spellings: readonly string[];
}

function lookUp(kana: string): readonly string[] | undefined {
  return MORA_SPELLINGS.get(kana);
}

/**
 * The vowel a mora ends on, which is the one a following ー holds.
 *
 * Undefined after anything that does not end on a vowel: ん, a sokuon, a
 * punctuation mark, or nothing at all. There ー can only be typed as `-`.
 */
function heldVowel(previous: RawSegment | undefined): string | undefined {
  const last = previous?.spellings[0]?.at(-1);
  return last !== undefined && VOWELS.has(last) ? last : undefined;
}

function split(text: string): RawSegment[] {
  const characters = toCodePoints(text);
  const normalised = toCodePoints(katakanaToHiragana(text));
  const segments: RawSegment[] = [];

  let index = 0;
  while (index < characters.length) {
    const display = characters[index];
    const kana = normalised[index];
    if (display === undefined || kana === undefined) break;

    // The long vowel mark belongs to no script, but it is read: it holds the
    // vowel before it, and a reader who misses it misreads the word. So it is a
    // mora. It takes a hyphen, the way every IME expects, and the held vowel
    // itself, because that is what is read, `koohii` is what people type when
    // they type fast, and the hyphen key is a reach off the home row.
    if (display === LONG_VOWEL) {
      const held = heldVowel(segments.at(-1));
      const spellings = held === undefined ? ["-"] : ["-", held];
      segments.push({ display, kana: display, kind: "mora", spellings });
      index += 1;
      continue;
    }

    // Punctuation is shown and stepped over. No spellings means the matcher
    // skips it, so the reader types straight through a comma.
    if (PUNCTUATION.has(kana)) {
      segments.push({ display, kana, kind: "punctuation", spellings: [] });
      index += 1;
      continue;
    }

    if (kana === SOKUON) {
      // Filled in by resolveContextual once the next segment is known.
      segments.push({ display, kana, kind: "sokuon", spellings: [] });
      index += 1;
      continue;
    }

    if (kana === MORAIC_N) {
      segments.push({ display, kana, kind: "moraic-n", spellings: [] });
      index += 1;
      continue;
    }

    const nextDisplay = characters[index + 1];
    const nextKana = normalised[index + 1];
    if (nextDisplay !== undefined && nextKana !== undefined && SMALL_KANA.has(nextKana)) {
      const pairSpellings = MORA_SPELLINGS.get(kana + nextKana);
      if (pairSpellings !== undefined) {
        segments.push({
          display: display + nextDisplay,
          kana: kana + nextKana,
          kind: "mora",
          spellings: pairSpellings,
        });
        index += 2;
        continue;
      }
    }

    // A small vowel nothing combines with, as in なぁ, やぁ and ねぇ, is not a
    // mora of its own. It draws out the vowel before it, and it is read as that
    // vowel, so the reader types the vowel. `la` and `xa` still work: they are
    // how an IME spells it exactly, and some readers will reach for that.
    const stretched = STRETCHED_VOWELS.get(kana);
    if (stretched !== undefined) {
      segments.push({
        display,
        kana,
        kind: "mora",
        spellings: [stretched, ...(lookUp(kana) ?? [])],
      });
      index += 1;
      continue;
    }

    const spellings = lookUp(kana);
    if (spellings === undefined) {
      // Kanji, latin, or a kana combination nobody has a spelling for. The
      // caller decides what to do; the engine will not ask the reader to type it.
      segments.push({ display, kana, kind: "untypeable", spellings: [] });
    } else {
      segments.push({ display, kana, kind: "mora", spellings });
    }
    index += 1;
  }

  return segments;
}

/** The single letters a sokuon may be typed as, given what follows it. */
function doubledConsonants(next: RawSegment | undefined): string[] {
  if (next === undefined) return [];
  const initials = new Set<string>();
  for (const spelling of next.spellings) {
    const initial = spelling[0];
    // A doubled vowel is a different mora, not a sokuon, and っん is not a sound.
    if (initial === undefined || VOWELS.has(initial) || initial === "n") continue;
    initials.add(initial);
    // Hepburn doubles ち and ちゃ with a t, not a c: 抹茶 is matcha, not maccha.
    // It is the spelling anyone taught Hepburn reaches for, and っち turns up in
    // a hundred or so corpus sentences.
    if (spelling.startsWith("ch")) initials.add("t");
  }
  return [...initials];
}

/**
 * Whether a bare `n` is ever right for the moraic nasal here.
 *
 * Not when every spelling of the next mora starts with a vowel or with `y`,
 * because an IME would read the reader's `n` as the start of that mora instead:
 * `na` is な, not ん + あ, and `nya` is にゃ, not ん + や. So きんようび has to be
 * typed `kinnyoubi`; `kinyoubi` is きにょうび everywhere else and is here too.
 *
 * When only some of them do, `n` stays, and the matcher rules out the vowel
 * ones on the path that took it. That is the particle へ after ん: `nihonhe` is
 * right and `nihone` is にほね. See `followOf` in matcher.ts.
 *
 * A following `n` is the case that looks like it belongs on the list and does
 * not. No mora begins `nn`, so an IME has nothing to wait for: it commits ん and
 * hands the second `n` to the next mora. That is why こんにちは is `konnichiha`,
 * the spelling everyone already knows, and あんない is `annai`. Both stay
 * typable as `konnnichiha` and `annnai` as well, because the matcher keeps every
 * live reading and whichever one finishes the sentence wins.
 */
function allowsBareN(next: RawSegment | undefined): boolean {
  if (next === undefined || next.spellings.length === 0) return true;
  for (const spelling of next.spellings) {
    const initial = spelling[0];
    if (initial !== undefined && !VOWELS.has(initial) && initial !== "y") return true;
  }
  return false;
}

function resolveContextual(segments: RawSegment[]): Segment[] {
  return segments.map((segment, index) => {
    if (segment.kind === "sokuon") {
      const doubled = doubledConsonants(segments[index + 1]);
      // Nothing after it to double: the end of the sentence, punctuation, or a
      // vowel, as in あっ、 and くそっ。 It is a glottal stop, and the only way
      // to type one alone is `xtu`, which is IME trivia and not reading. So it
      // is shown and stepped over, like the punctuation it sits against.
      if (doubled.length === 0) return { ...segment, spellings: [] };
      return { ...segment, spellings: [...doubled, ...SOKUON_SPELLINGS] };
    }
    if (segment.kind === "moraic-n") {
      const bare = allowsBareN(segments[index + 1]) ? ["n"] : [];
      return { ...segment, spellings: [...bare, ...MORAIC_N_SPELLINGS] };
    }
    return segment;
  });
}

/** One word of a sentence, as the reader types it. */
export interface SpelledWord {
  readonly kana: string;
  /**
   * Further ways to type the word, when it is a single mora.
   *
   * For the particles, which are read differently from how they are written:
   * は as `wa` and へ as `e`. Added before the spellings around them are
   * resolved, so a ん or っ in front of them sees every way they can be typed.
   */
  readonly alsoTyped?: readonly string[];
}

/**
 * Splits a sentence into typing segments, with each word's extra spellings.
 *
 * The sentence is split as one reading, not word by word. The analyser now and
 * then cuts a word through the middle of a mora, handing back もち and ゃ as two
 * words, and splitting those separately would ask the reader for `chi` then
 * `lya` where they read ちゃ. The words are used only to find which segment each
 * one landed on.
 */
export function segmentWords(words: readonly SpelledWord[]): Segment[] {
  const raw = split(words.map((word) => word.kana).join(""));

  let segment = 0;
  let consumed = 0;
  for (const word of words) {
    const from = segment;
    const length = toCodePoints(word.kana).length;
    while (segment < raw.length && consumed < length) {
      consumed += toCodePoints(raw[segment]?.display ?? "").length;
      segment += 1;
    }
    consumed -= length;

    // Only a word that is exactly one mora, start to end. One that shares a
    // mora with its neighbour is not a particle standing on its own.
    const only = segment - from === 1 && consumed === 0 ? raw[from] : undefined;
    if (only?.kind === "mora" && word.alsoTyped !== undefined) {
      raw[from] = { ...only, spellings: [...only.spellings, ...word.alsoTyped] };
    }
  }
  return resolveContextual(raw);
}

/**
 * Splits kana text into typing segments. Katakana and hiragana both work, and
 * mixing them in one string is fine.
 */
export function segmentKana(text: string): Segment[] {
  return resolveContextual(split(text));
}

/**
 * The preferred spelling of each segment joined together: what the reader would
 * type if they always chose the first option. Used for hints, never for matching.
 */
export function preferredRomaji(segments: readonly Segment[]): string {
  let result = "";
  for (const segment of segments) {
    result += segment.spellings[0] ?? "";
  }
  return result;
}
