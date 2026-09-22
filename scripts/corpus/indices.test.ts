import { describe, expect, test } from "bun:test";
import { applyCheckedReadings, checkedReadings, parseIndexTokens } from "./indices";

describe("parseIndexTokens", () => {
  test("reads a plain headword", () => {
    expect(parseIndexTokens("は 元気")).toEqual([
      { headword: "は", reading: null, surface: null },
      { headword: "元気", reading: null, surface: null },
    ]);
  });

  test("reads a headword with a checked reading", () => {
    expect(parseIndexTokens("表(おもて)[04]")).toEqual([
      { headword: "表", reading: "おもて", surface: null },
    ]);
  });

  test("reads an inflected form", () => {
    expect(parseIndexTokens("出る{出よう}")).toEqual([
      { headword: "出る", reading: null, surface: "出よう" },
    ]);
  });

  test("reads reading, sense and surface together", () => {
    expect(parseIndexTokens("之(の)[03]{の}")).toEqual([
      { headword: "之", reading: "の", surface: "の" },
    ]);
  });

  test("does not mistake a cross-reference id for a reading", () => {
    expect(parseIndexTokens("が(#2028930)")).toEqual([
      { headword: "が", reading: null, surface: null },
    ]);
  });

  test("ignores the checked marker", () => {
    expect(parseIndexTokens("差す[03]~ ほお紅~")).toEqual([
      { headword: "差す", reading: null, surface: null },
      { headword: "ほお紅", reading: null, surface: null },
    ]);
  });

  test("handles a real line end to end", () => {
    const tokens = parseIndexTokens("は 二十歳(はたち){２０歳} になる[01]{になりました}");
    expect(tokens).toEqual([
      { headword: "は", reading: null, surface: null },
      { headword: "二十歳", reading: "はたち", surface: "２０歳" },
      { headword: "になる", reading: null, surface: "になりました" },
    ]);
  });
});

describe("checkedReadings", () => {
  test("keeps a reading for a word that appears uninflected", () => {
    const readings = checkedReadings(parseIndexTokens("表(おもて)[04] に 出る{出よう} か"));
    expect(readings.get("表")).toBe("おもて");
  });

  test("drops a reading that belongs to the dictionary form, not the page", () => {
    // はたち is how 二十歳 is read, but the sentence says ２０歳.
    const readings = checkedReadings(parseIndexTokens("二十歳(はたち){２０歳}"));
    expect(readings.size).toBe(0);
  });
});

describe("applyCheckedReadings", () => {
  test("overrules the analyser where the indices disagree", () => {
    const tokens = [
      { surface: "表", reading: "ひょう" },
      { surface: "に", reading: "に" },
    ];
    const result = applyCheckedReadings(tokens, new Map([["表", "おもて"]]));

    expect(result.corrections).toBe(1);
    expect(result.tokens[0]).toEqual({ surface: "表", reading: "おもて" });
    expect(result.tokens[1]).toEqual({ surface: "に", reading: "に" });
  });

  test("leaves agreeing readings alone", () => {
    const tokens = [{ surface: "表", reading: "おもて" }];
    const result = applyCheckedReadings(tokens, new Map([["表", "おもて"]]));

    expect(result.corrections).toBe(0);
    expect(result.tokens).toEqual(tokens);
  });
});
