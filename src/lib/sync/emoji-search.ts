// Searching the badge emoji by name, in the reader's language and in English.
//
// The names are CLDR's, written by scripts/badges/emoji-names.ts into
// static/emoji, and loaded only when a picker opens: nobody who never makes a
// badge downloads them.

import { katakanaToHiragana } from "../japanese/text";
import { BADGE_EMOJI } from "./badge-rules";

/** Each emoji's names in one language, lowercase, separated by `|`. */
export type EmojiNames = Readonly<Record<string, string>>;

/** Lowercase, width folded, katakana read as hiragana, so ネコ finds what ねこ finds. */
function fold(text: string): string {
  return katakanaToHiragana(text.normalize("NFKC").toLowerCase().trim());
}

/**
 * The badge emoji whose names contain what was typed, in the picker's order.
 * Every table is searched: someone on a German page may still type "cat".
 */
export function searchEmoji(query: string, tables: readonly EmojiNames[]): string[] {
  const wanted = fold(query);
  if (wanted === "") return BADGE_EMOJI.flatMap((group) => group.emoji);
  const matches = isSpaced(wanted) ? startsAWord(wanted) : (name: string) => name.includes(wanted);
  return BADGE_EMOJI.flatMap((group) =>
    group.emoji.filter((emoji) => tables.some((names) => matches(fold(names[emoji] ?? "")))),
  );
}

/** Whether text is in a script that puts spaces between its words. Japanese does not. */
function isSpaced(text: string): boolean {
  for (const character of text) {
    if ((character.codePointAt(0) ?? 0) > 0x24f) return false;
  }
  return true;
}

/**
 * Matches a name where one of its words begins with what was typed, so "cat"
 * finds the cat and not "education". A word can start after a space, a `|`
 * between names, or a hyphen.
 */
function startsAWord(wanted: string): (name: string) => boolean {
  return (name) => {
    let at = name.indexOf(wanted);
    while (at !== -1) {
      const before = at === 0 ? " " : name.charAt(at - 1);
      if (before === " " || before === "|" || before === "-") return true;
      at = name.indexOf(wanted, at + 1);
    }
    return false;
  };
}

const loaded = new Map<string, Promise<EmojiNames>>();

/** One language's names, fetched once. An empty table when it cannot be, so search just finds less. */
function namesIn(locale: string): Promise<EmojiNames> {
  let names = loaded.get(locale);
  if (names === undefined) {
    names = fetch(`/emoji/${locale}.json`)
      .then((response) => (response.ok ? (response.json() as Promise<EmojiNames>) : {}))
      .catch(() => ({}));
    loaded.set(locale, names);
  }
  return names;
}

/** The names to search: the reader's language, and English beside it. */
export async function loadEmojiNames(locale: string): Promise<EmojiNames[]> {
  const locales = locale === "en" ? ["en"] : [locale, "en"];
  return Promise.all(locales.map(namesIn));
}
