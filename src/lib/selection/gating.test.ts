import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { EMPTY_STORE, applyReviews, reviewsFor, type ItemStore, type TimedSegment } from "../srs";
import { CORE_HIRAGANA, allowsKatakana, hiraganaMastery } from "./gating";

const now = new Date("2026-01-01T00:00:00Z");

/** A store where the reader has read these characters cleanly, several times. */
function storeKnowing(text: string): ItemStore {
  const segments = segmentKana(text);
  const timed: TimedSegment[] = segments.map((_, index) => ({
    segment: index,
    latencyMs: 150,
    errors: 0,
  }));

  let store = EMPTY_STORE;
  for (let pass = 0; pass < 6; pass++) {
    store = applyReviews(
      store,
      reviewsFor(segments, timed),
      new Date(now.getTime() + pass * 86_400_000),
    );
  }
  return store;
}

describe("CORE_HIRAGANA", () => {
  test("covers the gojuon with its voiced forms and nothing else", () => {
    // 46 basic, 20 dakuten, 5 handakuten.
    expect(CORE_HIRAGANA).toHaveLength(71);
    expect(CORE_HIRAGANA).toContain("あ");
    expect(CORE_HIRAGANA).toContain("ぱ");
    expect(CORE_HIRAGANA).toContain("を");
    // Archaic and borrowed-sound kana would keep the gate shut forever.
    expect(CORE_HIRAGANA).not.toContain("ゐ");
    expect(CORE_HIRAGANA).not.toContain("ゔ");
    // Small kana are learned inside a youon, not on their own.
    expect(CORE_HIRAGANA).not.toContain("ゃ");
    expect(CORE_HIRAGANA).not.toContain("っ");
    // Youon are pairs, not core single kana.
    expect(CORE_HIRAGANA).not.toContain("きゃ");
  });
});

describe("hiraganaMastery", () => {
  test("is zero for a reader who has never typed", () => {
    expect(hiraganaMastery(EMPTY_STORE, now)).toBe(0);
  });

  test("rises as the reader learns characters", () => {
    const some = hiraganaMastery(storeKnowing("あいうえおかきくけこ"), now);
    const more = hiraganaMastery(storeKnowing("あいうえおかきくけこさしすせそたちつてと"), now);

    expect(some).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(some);
  });

  test("ignores katakana practice", () => {
    // Reading アイウエオ says nothing about whether あいうえお is readable.
    expect(hiraganaMastery(storeKnowing("アイウエオカキクケコ"), now)).toBe(0);
  });

  test("reaches one when every core kana is known", () => {
    expect(hiraganaMastery(storeKnowing(CORE_HIRAGANA.join("")), now)).toBe(1);
  });
});

describe("allowsKatakana", () => {
  test("keeps katakana away from a beginner", () => {
    expect(allowsKatakana(EMPTY_STORE, now)).toBe(false);
  });

  test("opens once hiragana is solid", () => {
    expect(allowsKatakana(storeKnowing(CORE_HIRAGANA.join("")), now)).toBe(true);
  });

  test("stays shut partway through", () => {
    const half = CORE_HIRAGANA.slice(0, 30).join("");
    expect(allowsKatakana(storeKnowing(half), now)).toBe(false);
  });
});
