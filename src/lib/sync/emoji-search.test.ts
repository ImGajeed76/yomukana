import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { searchEmoji, type EmojiNames } from "./emoji-search";

function names(locale: string): EmojiNames {
  return JSON.parse(readFileSync(`static/emoji/${locale}.json`, "utf8")) as EmojiNames;
}

const english = names("en");
const german = names("de");
const japanese = names("ja");

describe("searchEmoji", () => {
  test("finds an emoji by its name in the reader's language", () => {
    expect(searchEmoji("cat", [english])).toContain("🐱");
    expect(searchEmoji("katze", [german])).toContain("🐱");
    expect(searchEmoji("ねこ", [japanese])).toContain("🐱");
  });

  test("matches the start of a word, not the middle of one", () => {
    // "education" has "cat" in it, and the books are not cats.
    expect(searchEmoji("cat", [english])).not.toContain("📚");
    expect(searchEmoji("gradu", [english])).toContain("🎓");
  });

  test("reads katakana as hiragana and ignores case", () => {
    expect(searchEmoji("ネコ", [japanese])).toContain("🐱");
    expect(searchEmoji("CAT", [english])).toContain("🐱");
  });

  test("finds by English beside another language", () => {
    expect(searchEmoji("fox", [german, english])).toContain("🦊");
  });

  test("finds emoji CLDR keys without their variation selector", () => {
    expect(searchEmoji("pencil", [english])).toContain("✏️");
  });

  test("shows everything for an empty search, and nothing for nonsense", () => {
    expect(searchEmoji("  ", [english]).length).toBeGreaterThan(400);
    expect(searchEmoji("qqqqzz", [english])).toEqual([]);
  });
});
