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

interface RawSegment {
  display: string;
  kana: string;
  kind: SegmentKind;
  spellings: readonly string[];
}

function lookUp(kana: string): readonly string[] | undefined {
  return MORA_SPELLINGS.get(kana);
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
    // mora, typed as a hyphen the way every IME expects.
    if (display === LONG_VOWEL) {
      segments.push({ display, kana: display, kind: "mora", spellings: ["-"] });
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
  }
  return [...initials];
}

/**
 * Whether a bare `n` is enough for the moraic nasal here.
 *
 * It is not when the next mora starts with a vowel or with `y`, because an IME
 * would read the reader's `n` as the start of that mora instead: `na` is な, not
 * ん + あ, and `nya` is にゃ, not ん + や. So きんようび has to be typed
 * `kinnyoubi`; `kinyoubi` is きにょうび everywhere else and should be here too.
 *
 * A following `n` is the case that looks like it belongs on that list and does
 * not. No mora begins `nn`, so an IME has nothing to wait for: it commits ん and
 * hands the second `n` to the next mora. That is why こんにちは is `konnichiha`,
 * the spelling everyone already knows, and あんない is `annai`. Both stay
 * typable as `konnnichiha` and `annnai` as well, because the matcher keeps every
 * live reading and whichever one finishes the sentence wins.
 */
function allowsBareN(next: RawSegment | undefined): boolean {
  if (next === undefined) return true;
  for (const spelling of next.spellings) {
    const initial = spelling[0];
    if (initial === undefined) continue;
    if (VOWELS.has(initial) || initial === "y") return false;
  }
  return true;
}

function resolveContextual(segments: RawSegment[]): Segment[] {
  return segments.map((segment, index) => {
    if (segment.kind === "sokuon") {
      const doubled = doubledConsonants(segments[index + 1]);
      return { ...segment, spellings: [...doubled, ...SOKUON_SPELLINGS] };
    }
    if (segment.kind === "moraic-n") {
      const bare = allowsBareN(segments[index + 1]) ? ["n"] : [];
      return { ...segment, spellings: [...bare, ...MORAIC_N_SPELLINGS] };
    }
    return segment;
  });
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
