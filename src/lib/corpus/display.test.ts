import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { READING_ONLY, expandKana, planDisplay, tokenSpans } from "./display";
import { readingOf, type CorpusSentence, type CorpusToken } from "./types";

function sentence(tokens: readonly [string, string][]): CorpusSentence {
  return {
    id: "test",
    tokens: tokens.map(([surface, reading]) => ({ surface, reading })),
    meaning: "",
    band: 0,
  };
}

function spansOf(entry: CorpusSentence): ReturnType<typeof tokenSpans> {
  return tokenSpans(entry.tokens, segmentKana(readingOf(entry)));
}

describe("tokenSpans", () => {
  test("gives each token the segments the reader types for it", () => {
    // がっこう is four segments: が っ こ う.
    const entry = sentence([
      ["学校", "がっこう"],
      ["に", "に"],
    ]);

    expect(spansOf(entry)).toEqual([
      { token: { surface: "学校", reading: "がっこう" }, from: 0, to: 4 },
      { token: { surface: "に", reading: "に" }, from: 4, to: 5 },
    ]);
  });

  test("counts a youon as the single segment it is typed as", () => {
    // しゃしん is three segments: しゃ し ん.
    const entry = sentence([["写真", "しゃしん"]]);
    expect(spansOf(entry)).toEqual([
      { token: { surface: "写真", reading: "しゃしん" }, from: 0, to: 3 },
    ]);
  });

  test("covers every segment exactly once", () => {
    const entry = sentence([
      ["昨日", "きのう"],
      ["は", "は"],
      ["学校", "がっこう"],
      ["に", "に"],
      ["行っ", "いっ"],
      ["た", "た"],
      ["。", "。"],
    ]);

    const spans = spansOf(entry);
    const total = segmentKana(readingOf(entry)).length;

    expect(spans[0]?.from).toBe(0);
    expect(spans[spans.length - 1]?.to).toBe(total);
    for (const [index, span] of spans.entries()) {
      if (index === 0) continue;
      expect(span.from).toBe(spans[index - 1]?.to ?? -1);
    }
  });
});

describe("planDisplay", () => {
  const entry = sentence([
    ["学校", "がっこう"],
    ["に", "に"],
  ]);

  test("shows the reading when nothing is revealed", () => {
    const plan = planDisplay(spansOf(entry), READING_ONLY);
    expect(plan.map((token) => token.text)).toEqual(["がっこう", "に"]);
    expect(plan.every((token) => !token.isWritten)).toBe(true);
  });

  test("shows the written form for a revealed token", () => {
    const plan = planDisplay(spansOf(entry), () => true);
    expect(plan.map((token) => token.text)).toEqual(["学校", "に"]);
    expect(plan[0]?.isWritten).toBe(true);
  });

  test("leaves a kana token alone even when everything is revealed", () => {
    // に is written the way it is read, so revealing it changes nothing.
    const plan = planDisplay(spansOf(entry), () => true);
    expect(plan[1]?.isWritten).toBe(false);
  });

  test("reveals only the tokens the decision picks", () => {
    const mixed = sentence([
      ["学校", "がっこう"],
      ["に", "に"],
      ["行く", "いく"],
    ]);
    const reveal = (token: CorpusToken): boolean => token.surface === "行く";
    const plan = planDisplay(spansOf(mixed), reveal);

    expect(plan.map((token) => token.text)).toEqual(["がっこう", "に", "行く"]);
  });
});

describe("expandKana", () => {
  test("splits kana words into characters and leaves written words whole", () => {
    const entry = sentence([
      ["学校", "がっこう"],
      ["には", "には"],
    ]);
    const segments = segmentKana(readingOf(entry));
    const plan = planDisplay(spansOf(entry), (token) => token.surface === "学校");

    const expanded = expandKana(plan, segments);
    expect(expanded.map((token) => token.text)).toEqual(["学校", "に", "は"]);
    expect(expanded[0]).toEqual({ ...plan[0] } as (typeof expanded)[number]);
    expect(expanded[1]?.from).toBe(4);
    expect(expanded[1]?.to).toBe(5);
  });

  test("splits a kana-only sentence character by character", () => {
    const entry = sentence([["きょうは", "きょうは"]]);
    const segments = segmentKana(readingOf(entry));
    const expanded = expandKana(planDisplay(spansOf(entry), READING_ONLY), segments);

    // きょ is one segment, so it stays one unit.
    expect(expanded.map((token) => token.text)).toEqual(["きょ", "う", "は"]);
  });
});
