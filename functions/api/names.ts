// Whether a name is one people should not have to see on a leaderboard.
//
// Usernames and display names are shown to other readers, and on the global
// board to strangers. This refuses the obvious offensive ones, in every
// language naughty-words lists, so there is little left to moderate by hand.
// It will never be perfect and does not try: a determined reader can always
// find a spelling no list has. It stops the casual and the accidental.
//
// Runs in the API function, never in the browser, so the list does not ship to
// every reader and nobody can skip the check by talking to the database.

import naughtyWords from "naughty-words";

/** Digits and symbols people use in place of letters to slip a word past a filter. */
const LOOKALIKES: ReadonlyMap<string, string> = new Map([
  ["0", "o"],
  ["1", "i"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["7", "t"],
  ["@", "a"],
  ["$", "s"],
]);

/**
 * Latin words this short are only matched as a whole word. As a part of a
 * longer word they are too often innocent: "ass" in "class", "tit" in
 * "title". Longer ones are matched anywhere, which is where someone hides them.
 */
const WHOLE_WORD_ONLY = 4;

/**
 * Latin entries shorter than this are too likely to be letters in a real
 * name. Only Latin: in Japanese or Chinese one character can be a whole word.
 */
const SHORTEST_LATIN_ENTRY = 3;

const segmenter = new Intl.Segmenter("und", { granularity: "word" });

function isLatin(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 0x24f) return false;
  }
  return true;
}

/** Lowercase, compatibility forms folded, lookalikes replaced. */
function normalise(text: string): string {
  let result = "";
  for (const character of text.normalize("NFKC").toLowerCase()) {
    result += LOOKALIKES.get(character) ?? character;
  }
  return result;
}

/** The words in a text, in any script, with spaces and punctuation left out. */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike === true) words.push(segment.segment);
  }
  return words;
}

interface BlockedWords {
  /** Latin words matched only as a whole word. */
  readonly whole: ReadonlySet<string>;
  /** Everything else, matched anywhere in the name with the gaps taken out. */
  readonly anywhere: readonly string[];
}

function buildList(): BlockedWords {
  const whole = new Set<string>();
  const anywhere = new Set<string>();
  for (const words of Object.values(naughtyWords)) {
    for (const entry of words) {
      const compact = wordsOf(normalise(entry)).join("");
      if (compact === "") continue;
      if (!isLatin(compact)) anywhere.add(compact);
      else if (compact.length < SHORTEST_LATIN_ENTRY) continue;
      else if (compact.length <= WHOLE_WORD_ONLY) whole.add(compact);
      else anywhere.add(compact);
    }
  }
  return { whole, anywhere: [...anywhere] };
}

const BLOCKED = buildList();

/** Whether a username or display name contains something on the list. */
export function isOffensiveName(name: string): boolean {
  const words = wordsOf(normalise(name));
  if (words.some((word) => BLOCKED.whole.has(word))) return true;
  const compact = words.join("");
  return BLOCKED.anywhere.some((entry) => compact.includes(entry));
}
