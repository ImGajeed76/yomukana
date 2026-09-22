// Decides which scripts the reader is ready to meet.
//
// A beginner shown katakana and kanji at once learns none of the three scripts.
// The gates open on measured knowledge rather than on a sentence count, so a
// reader who arrives already knowing hiragana passes straight through.

import { toCodePoints } from "../japanese/text";
import { MORAIC_N, MORA_SPELLINGS } from "../romaji/kana-table";
import { kanaItem, type ItemStore } from "../srs";

function isCoreHiragana(mora: string): boolean {
  const characters = toCodePoints(mora);
  if (characters.length !== 1) return false;

  const [character] = characters;
  if (character === undefined) return false;

  // Archaic and borrowed-sound kana are not part of learning hiragana, and
  // holding the gate shut until a reader has met ゐ would never open it.
  if (character === "ゐ" || character === "ゑ" || character === "ゔ") return false;

  const code = character.codePointAt(0);
  if (code === undefined) return false;
  // Small kana carry no reading of their own; they are learned inside a youon.
  const isSmall = "ぁぃぅぇぉゃゅょゎっ".includes(character);
  return code >= 0x3041 && code <= 0x3096 && !isSmall;
}

/**
 * The hiragana a reader is expected to know before anything else opens up: the
 * 46 of the gojuon plus their 25 voiced and half-voiced forms.
 *
 * ん is added by hand because the spelling table does not hold it. Its spelling
 * depends on what follows, so the matcher works it out per sentence, but it is
 * still one of the first characters anyone learns.
 */
export const CORE_HIRAGANA: readonly string[] = [
  ...[...MORA_SPELLINGS.keys()].filter(isCoreHiragana),
  MORAIC_N,
];

/** How much of the core hiragana the reader can currently read, from 0 to 1. */
export function hiraganaMastery(store: ItemStore): number {
  return masteryOf(CORE_HIRAGANA, store);
}

/**
 * The katakana counterpart of every core hiragana. Built by shifting the code
 * point, the same relationship the two scripts have in Unicode.
 */
export const CORE_KATAKANA: readonly string[] = CORE_HIRAGANA.map((mora) => {
  const code = mora.codePointAt(0);
  return code === undefined ? mora : String.fromCodePoint(code + 0x60);
});

/**
 * Days of FSRS stability at which a character counts as learned.
 *
 * Learned, not currently fresh. The gates used to ask whether the reader would
 * recall a character right now, which is the same question FSRS asks to decide
 * whether it is due. So every character a reader had not seen this week counted
 * as unknown, their mastery fell below the thresholds, and katakana and kanji
 * silently disappeared from their sentences for taking a week off. Learning a
 * character is not something a holiday undoes.
 */
const LEARNED_STABILITY_DAYS = 1;

function isLearned(store: ItemStore, mora: string): boolean {
  const state = store.items.get(kanaItem(mora).id);
  return state !== undefined && state.reviews > 0 && state.card.stability >= LEARNED_STABILITY_DAYS;
}

function masteryOf(moras: readonly string[], store: ItemStore): number {
  if (moras.length === 0) return 1;

  let known = 0;
  for (const mora of moras) {
    if (isLearned(store, mora)) known += 1;
  }
  return known / moras.length;
}

/** How much of the core katakana the reader can currently read, from 0 to 1. */
export function katakanaMastery(store: ItemStore): number {
  return masteryOf(CORE_KATAKANA, store);
}

/** Hiragana mastery at which katakana starts appearing. */
export const KATAKANA_THRESHOLD = 0.7;

/** Hiragana mastery at which kanji start appearing. */
export const KANJI_HIRAGANA_THRESHOLD = 0.9;

/** Katakana mastery at which kanji start appearing. */
export const KANJI_KATAKANA_THRESHOLD = 0.5;

/**
 * Whether katakana sentences may be offered yet.
 *
 * Katakana is gated by filtering the corpus rather than by rewriting katakana
 * into hiragana: コーヒー written as こーひー is not Japanese, and practising it
 * would teach a shape the reader will never see again.
 */
export function allowsKatakana(store: ItemStore, threshold: number = KATAKANA_THRESHOLD): boolean {
  return hiraganaMastery(store) >= threshold;
}

/**
 * Whether written forms may start replacing readings.
 *
 * Kanji wait for both kana scripts, hiragana nearly complete and katakana well
 * under way. A reader still working out か has no attention left for 学校, and
 * showing it early turns the sentence into a wall rather than a lesson.
 */
export function allowsKanji(store: ItemStore): boolean {
  return (
    hiraganaMastery(store) >= KANJI_HIRAGANA_THRESHOLD &&
    katakanaMastery(store) >= KANJI_KATAKANA_THRESHOLD
  );
}
