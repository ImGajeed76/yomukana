import { describe, expect, test } from "bun:test";
import { BADGE_EMOJI, badgeTagFrom, isBadgeEmoji } from "./badge-rules";

describe("BADGE_EMOJI", () => {
  const all = BADGE_EMOJI.flatMap((group) => group.emoji);

  test("offers a picker's worth, with no emoji twice", () => {
    expect(all.length).toBeGreaterThan(400);
    expect(new Set(all).size).toBe(all.length);
  });

  test("keeps every emoji whole, variation selector and all", () => {
    // A stray selector on its own would be an invisible, unpickable cell.
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    for (const emoji of all) {
      expect(Array.from(segmenter.segment(emoji)).length).toBe(1);
      expect(emoji).not.toBe(String.fromCodePoint(0xfe0f));
    }
    expect(isBadgeEmoji("✏️")).toBe(true);
  });

  test("offers every country's flag, and none from after Unicode 13", () => {
    expect(isBadgeEmoji("🇯🇵")).toBe(true);
    expect(isBadgeEmoji("🇨🇭")).toBe(true);
    // Sark's flag is from 2024, and shows as two letters on older phones.
    expect(isBadgeEmoji("🇨🇶")).toBe(false);
  });

  test("accepts only what it offers", () => {
    expect(isBadgeEmoji("🦊")).toBe(true);
    expect(isBadgeEmoji("🖕")).toBe(false);
    expect(isBadgeEmoji("🦊🦊")).toBe(false);
    expect(isBadgeEmoji("a")).toBe(false);
  });
});

describe("badgeTagFrom", () => {
  test("keeps Latin in capitals", () => {
    expect(badgeTagFrom("kits")).toBe("KITS");
    expect(badgeTagFrom(" n5 ")).toBe("N5");
  });

  test("takes kana, and folds what a Japanese keyboard types", () => {
    expect(badgeTagFrom("ネコ")).toBe("ネコ");
    expect(badgeTagFrom("よむ")).toBe("よむ");
    expect(badgeTagFrom("ラーメン")).toBe("ラーメン");
    // Full-width Latin and half-width katakana, both common from an IME.
    expect(badgeTagFrom("ＫＩＴＳ")).toBe("KITS");
    expect(badgeTagFrom("ﾈｺ")).toBe("ネコ");
  });

  test("refuses the wrong length and anything else", () => {
    expect(badgeTagFrom("K")).toBeNull();
    expect(badgeTagFrom("KITSU")).toBeNull();
    expect(badgeTagFrom("猫猫")).toBeNull();
    expect(badgeTagFrom("K-TS")).toBeNull();
    expect(badgeTagFrom("🦊🦊")).toBeNull();
  });
});
