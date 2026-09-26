import { describe, expect, test } from "bun:test";
import { isOffensiveName } from "./names";

describe("isOffensiveName", () => {
  test("passes the random names the app hands out, and ordinary ones", () => {
    for (const name of [
      "quiet-tanuki-42",
      "curious-fukurou-99",
      "oliver",
      "Classic Reader",
      "たなか",
    ]) {
      expect(isOffensiveName(name)).toBe(false);
    }
  });

  test("refuses a listed word, alone or inside a name", () => {
    expect(isOffensiveName("asshole")).toBe(true);
    expect(isOffensiveName("big-asshole-7")).toBe(true);
  });

  test("sees through the usual disguises", () => {
    expect(isOffensiveName("4ssh0le")).toBe(true);
    expect(isOffensiveName("A S S H O L E")).toBe(true);
    expect(isOffensiveName("ＡＳＳＨＯＬＥ")).toBe(true);
  });

  test("matches a short word only on its own, so class and title stay fine", () => {
    expect(isOffensiveName("ass")).toBe(true);
    expect(isOffensiveName("class-act")).toBe(false);
    expect(isOffensiveName("title-hunter")).toBe(false);
  });

  test("covers other languages, including ones without spaces", () => {
    expect(isOffensiveName("arschloch")).toBe(true);
    expect(isOffensiveName("アナル")).toBe(true);
    expect(isOffensiveName("糞太郎")).toBe(true);
  });
});
