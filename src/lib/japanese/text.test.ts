import { describe, expect, test } from "bun:test";
import { isHiragana, isKanji, isKatakana, scriptOf, toCodePoints } from "./text";

describe("script detection", () => {
  test("recognises the three scripts", () => {
    expect(scriptOf("あ")).toBe("hiragana");
    expect(scriptOf("ア")).toBe("katakana");
    expect(scriptOf("漢")).toBe("kanji");
    expect(scriptOf("、")).toBe("other");
    expect(scriptOf("a")).toBe("other");
  });

  test("counts the characters that behave like kanji but sit outside the main block", () => {
    // 々 repeats the kanji before it, so a sentence with 人々 has kanji in it
    // whatever the code point ranges say.
    expect(isKanji("々")).toBe(true);
    expect(isKanji("〇")).toBe(true);
    // Extension B, which is a surrogate pair in UTF-16.
    expect(isKanji("𠮟")).toBe(true);
    expect(isKanji("あ")).toBe(false);
  });

  test("separates hiragana from katakana", () => {
    expect(isHiragana("ぱ")).toBe(true);
    expect(isHiragana("パ")).toBe(false);
    expect(isKatakana("パ")).toBe(true);
    expect(isKatakana("ぱ")).toBe(false);
  });
});

describe("toCodePoints", () => {
  test("keeps a supplementary-plane kanji as one character", () => {
    expect(toCodePoints("𠮟る")).toEqual(["𠮟", "る"]);
  });
});
