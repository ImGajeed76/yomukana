import { describe, expect, test } from "bun:test";
import type { CorpusToken } from "../corpus/types";
import { EMPTY_STORE, applyReviews, kanjiItem, type ItemStore, type Review } from "../srs";
import { chooseRevealed } from "./reveal";

const now = new Date("2026-01-01T00:00:00Z");

const tokens: readonly CorpusToken[] = [
  { surface: "昨日", reading: "きのう" },
  { surface: "は", reading: "は" },
  { surface: "学校", reading: "がっこう" },
  { surface: "に", reading: "に" },
  { surface: "行っ", reading: "いっ" },
  { surface: "た", reading: "た" },
];

/** A store where these written words have been read cleanly, several times. */
function storeKnowing(words: readonly [string, string][]): ItemStore {
  const reviews: Review[] = words.map(([surface, reading]) => ({
    item: kanjiItem(surface, reading),
    latencyMs: 150,
    errors: 0,
  }));

  let store = EMPTY_STORE;
  for (let pass = 0; pass < 6; pass++) {
    store = applyReviews(store, reviews, new Date(now.getTime() + pass * 86_400_000));
  }
  return store;
}

describe("chooseRevealed", () => {
  test("introduces one unfamiliar word at a time", () => {
    const revealed = chooseRevealed(tokens, EMPTY_STORE, now);
    expect(revealed.size).toBe(1);
    // The first written word in the sentence is the one that gets introduced.
    expect(revealed.has(0)).toBe(true);
  });

  test("keeps words the reader already knows written", () => {
    const store = storeKnowing([
      ["昨日", "きのう"],
      ["学校", "がっこう"],
    ]);
    const revealed = chooseRevealed(tokens, store, now);

    expect(revealed.has(0)).toBe(true);
    expect(revealed.has(2)).toBe(true);
    // Plus the one new word it is allowed to add.
    expect(revealed.has(4)).toBe(true);
  });

  test("never writes a word that is read the way it is written", () => {
    const revealed = chooseRevealed(tokens, storeKnowing([]), now);
    expect(revealed.has(1)).toBe(false);
    expect(revealed.has(3)).toBe(false);
    expect(revealed.has(5)).toBe(false);
  });

  test("shows both occurrences of the same word the same way", () => {
    const repeated: CorpusToken[] = [
      { surface: "学校", reading: "がっこう" },
      { surface: "と", reading: "と" },
      { surface: "学校", reading: "がっこう" },
    ];
    const revealed = chooseRevealed(repeated, EMPTY_STORE, now);

    expect(revealed.has(0)).toBe(true);
    expect(revealed.has(2)).toBe(true);
  });

  test("respects a larger introduction budget", () => {
    const revealed = chooseRevealed(tokens, EMPTY_STORE, now, { maxNew: 2 });
    expect(revealed.size).toBe(2);
  });

  test("shows nothing new when the budget is zero", () => {
    expect(chooseRevealed(tokens, EMPTY_STORE, now, { maxNew: 0 }).size).toBe(0);
  });
});
