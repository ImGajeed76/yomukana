// Usernames: the name friends type to find each other.
//
// A small alphabet on purpose. A name someone reads out, or copies from a chat,
// should be the name that finds them, so there is no case, no space and
// nothing that looks like something else. The database enforces the same rule
// with a check constraint; this copy is here so the reader hears about a bad
// name before sending it rather than after.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789-_";

/** Lowercases and trims, the way the database stores a name. */
export function normaliseUsername(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether a name, once normalised, is one the database will take. */
export function isValidUsername(name: string): boolean {
  const normalised = normaliseUsername(name);
  if (normalised.length < USERNAME_MIN_LENGTH || normalised.length > USERNAME_MAX_LENGTH) {
    return false;
  }
  for (const character of normalised) {
    if (!ALLOWED.includes(character)) return false;
  }
  return true;
}

// Two short lists, so a random name reads like a name and not like an id. The
// animals are ones from Japanese folklore and daily life, which suits the app
// and makes a clash between two readers less likely than "happy-cat" would.
const ADJECTIVES = [
  "quiet",
  "brave",
  "sleepy",
  "swift",
  "gentle",
  "clever",
  "bright",
  "calm",
  "curious",
  "lucky",
  "merry",
  "nimble",
  "patient",
  "quick",
  "shy",
  "steady",
  "sunny",
  "tidy",
  "warm",
  "witty",
] as const;

const ANIMALS = [
  "tanuki",
  "kitsune",
  "neko",
  "tori",
  "kame",
  "usagi",
  "kuma",
  "saru",
  "shika",
  "fukurou",
  "koi",
  "tsuru",
  "kaeru",
  "inu",
  "risu",
  "tako",
] as const;

/** A number from 0 below `count`. Handed in so tests can pin the result. */
export type Pick = (count: number) => number;

const randomPick: Pick = (count) => Math.floor(Math.random() * count);

/**
 * A fresh name like `quiet-tanuki-42`. Always valid: the longest one it can
 * make is `curious-fukurou-99`, which is within the limit.
 */
export function randomUsername(pick: Pick = randomPick): string {
  const adjective = ADJECTIVES[pick(ADJECTIVES.length)] ?? ADJECTIVES[0];
  const animal = ANIMALS[pick(ANIMALS.length)] ?? ANIMALS[0];
  const number = String(pick(90) + 10);
  return `${adjective}-${animal}-${number}`;
}

function longest(words: readonly string[]): string {
  return words.reduce((best, word) => (word.length > best.length ? word : best), "");
}

/** The longest name `randomUsername` can make, for the test that pins it as valid. */
export const LONGEST_RANDOM_USERNAME = `${longest(ADJECTIVES)}-${longest(ANIMALS)}-99`;
