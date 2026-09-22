import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { itemForSegment, itemsForSegments, kanaItem, kanjiItem, parseItemId } from "./item";

describe("itemForSegment", () => {
  test("treats katakana as different knowledge from the same-sounding hiragana", () => {
    const [hiragana] = segmentKana("こ");
    const [katakana] = segmentKana("コ");
    expect(hiragana).toBeDefined();
    expect(katakana).toBeDefined();
    if (hiragana === undefined || katakana === undefined) return;

    expect(itemForSegment(hiragana)?.id).not.toBe(itemForSegment(katakana)?.id);
  });

  test("schedules nothing for punctuation or unreadable characters", () => {
    for (const segment of segmentKana("、学")) {
      expect(itemForSegment(segment)).toBeNull();
    }
  });

  test("keeps a youon as one item", () => {
    const [segment] = segmentKana("きゃ");
    expect(segment).toBeDefined();
    if (segment === undefined) return;
    expect(itemForSegment(segment)?.surface).toBe("きゃ");
  });
});

describe("itemsForSegments", () => {
  test("lists each item once, in the order they appear", () => {
    const items = itemsForSegments(segmentKana("かさか"));
    expect(items.map((item) => item.surface)).toEqual(["か", "さ"]);
  });

  test("hands out the same object for the same kana", () => {
    expect(kanaItem("か")).toBe(kanaItem("か"));
  });
});

describe("kanjiItem", () => {
  test("gives a kanji a different item per reading", () => {
    expect(kanjiItem("生", "い").id).not.toBe(kanjiItem("生", "せい").id);
  });
});

describe("parseItemId", () => {
  test("round-trips a kana item", () => {
    expect(parseItemId(kanaItem("か").id)).toEqual(kanaItem("か"));
    expect(parseItemId(kanaItem("きゃ").id)).toEqual(kanaItem("きゃ"));
    expect(parseItemId(kanaItem("カ").id)).toEqual(kanaItem("カ"));
  });

  test("round-trips a written word, reading and all", () => {
    const item = kanjiItem("学校", "がっこう");
    expect(parseItemId(item.id)).toEqual(item);
  });

  test("keeps the two readings of one kanji apart", () => {
    const alive = kanjiItem("生", "い");
    const student = kanjiItem("生", "せい");
    expect(parseItemId(alive.id)).toEqual(alive);
    expect(parseItemId(student.id)).toEqual(student);
  });

  test("returns null for an id it does not recognise", () => {
    expect(parseItemId("")).toBeNull();
    expect(parseItemId("kana:")).toBeNull();
    expect(parseItemId("kanji:学校")).toBeNull();
    expect(parseItemId("something:else")).toBeNull();
  });
});
