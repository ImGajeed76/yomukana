import { describe, expect, test } from "bun:test";
import type { IpadicFeatures } from "@sglkc/kuromoji";
import { readTokens } from "./tokenise";

/** A kuromoji token with only the fields the reading rules look at. */
function token(surface: string, reading?: string): IpadicFeatures {
  return {
    word_id: 0,
    word_type: "KNOWN",
    word_position: 0,
    surface_form: surface,
    pos: "名詞",
    pos_detail_1: "*",
    pos_detail_2: "*",
    pos_detail_3: "*",
    conjugated_type: "*",
    conjugated_form: "*",
    basic_form: surface,
    ...(reading === undefined ? {} : { reading }),
  };
}

describe("readTokens", () => {
  test("gives a kanji token its reading in hiragana", () => {
    const result = readTokens([token("学校", "ガッコウ"), token("に", "ニ")]);
    expect(result.tokens).toEqual([
      { surface: "学校", reading: "がっこう" },
      { surface: "に", reading: "に" },
    ]);
  });

  test("leaves katakana as katakana", () => {
    // The reader has to recognise the script they were shown, so コーヒー must
    // not become こーひー on the way through.
    const result = readTokens([token("コーヒー", "コーヒー"), token("を", "ヲ")]);
    expect(result.tokens).toEqual([
      { surface: "コーヒー", reading: "コーヒー" },
      { surface: "を", reading: "を" },
    ]);
  });

  test("keeps the inflected reading rather than the dictionary form", () => {
    const result = readTokens([token("行っ", "イッ"), token("た", "タ")]);
    expect(result.tokens?.[0]).toEqual({ surface: "行っ", reading: "いっ" });
  });

  test("rejects a sentence with a kanji it has no reading for", () => {
    const result = readTokens([token("鬱", undefined), token("だ", "ダ")]);
    expect(result.tokens).toBeNull();
    expect(result.rejection).toBe("no-reading");
  });

  test("rejects a sentence whose reading is a placeholder", () => {
    expect(readTokens([token("々", "*")]).rejection).toBe("no-reading");
  });

  test("rejects a token mixing kanji and katakana", () => {
    // Folding the reading to hiragana would silently rewrite the katakana half.
    expect(readTokens([token("缶ビール", "カンビール")]).rejection).toBe("mixed-scripts-in-token");
  });

  test("rejects an empty sentence", () => {
    expect(readTokens([]).rejection).toBe("empty");
  });
});
