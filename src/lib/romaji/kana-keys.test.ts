import { describe, expect, test } from "bun:test";
import { keysForCharacter, keysForText } from "./kana-keys";
import { press, startTypingKana } from "./matcher";

/** Whether typing `text` on a Japanese keyboard reads the whole of `target`. */
function acceptsKana(target: string, text: string): boolean {
  const keys = keysForText(text);
  if (keys === null) return false;
  let state = startTypingKana(target);
  for (const key of keys) {
    const result = press(state, key);
    if (!result.isAccepted) return false;
    state = result.state;
  }
  return state.isComplete;
}

describe("keysForCharacter", () => {
  test("spells kana the way the matcher already takes it", () => {
    expect(keysForCharacter("ね")).toBe("ne");
    expect(keysForCharacter("ネ")).toBe("ne");
    expect(keysForCharacter("ん")).toBe("nn");
    expect(keysForCharacter("っ")).toBe("ltu");
    expect(keysForCharacter("ゃ")).toBe("lya");
    expect(keysForCharacter("ー")).toBe("-");
  });

  test("passes a romaji keyboard's letters through, one key each", () => {
    expect(keysForCharacter("K")).toBe("k");
  });

  test("gives nothing for punctuation, and null for a kanji", () => {
    expect(keysForCharacter("、")).toBe("");
    expect(keysForCharacter("猫")).toBeNull();
  });
});

describe("typing on a Japanese keyboard", () => {
  // Each pins one way the kana arrive that a romaji-only reading would reject.
  test("reads plain kana, and katakana typed as hiragana", () => {
    expect(acceptsKana("ねこ", "ねこ")).toBe(true);
    expect(acceptsKana("ネコ", "ねこ")).toBe(true);
  });

  test("reads a combination typed as its two characters", () => {
    expect(acceptsKana("きゃく", "きゃく")).toBe(true);
    expect(acceptsKana("しょうゆ", "しょうゆ")).toBe(true);
  });

  test("reads the small tsu, the moraic n before a vowel, and the long vowel", () => {
    expect(acceptsKana("がっこう", "がっこう")).toBe(true);
    expect(acceptsKana("たんい", "たんい")).toBe(true);
    expect(acceptsKana("コーヒー", "こーひー")).toBe(true);
  });

  test("still refuses the wrong kana", () => {
    expect(acceptsKana("ねこ", "ねご")).toBe(false);
  });
});
