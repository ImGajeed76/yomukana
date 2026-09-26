import { describe, expect, test } from "bun:test";
import { randomUsername } from "../../src/lib/sync/username";
import { isOffensiveName } from "./names";

describe("isOffensiveName", () => {
  test("passes the random names the app hands out, and ordinary ones", () => {
    for (const name of [
      "quiet-tanuki-42",
      "curious-mimizuku-99",
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

  test("passes every random name the app can hand out", () => {
    // Every adjective with every animal: the picks run through each list in turn.
    for (let adjective = 0; adjective < 20; adjective++) {
      for (let animal = 0; animal < 16; animal++) {
        const picks = [adjective, animal, 0];
        const name = randomUsername(() => picks.shift() ?? 0);
        expect(isOffensiveName(name)).toBe(false);
      }
    }
  });

  test("passes common innocent words that contain a listed one", () => {
    for (const name of ["Scunthorpe", "assassin", "Hancock", "shitake", "Hans Hit", "Sussex"]) {
      expect(isOffensiveName(name)).toBe(false);
    }
  });

  test("sees through the usual disguises", () => {
    for (const name of [
      "fack",
      "fackmeharder",
      "fuckyou",
      "fvck",
      "fuuuck",
      "f.u.c.k",
      "dickhead",
      "shithead",
    ]) {
      expect(isOffensiveName(name)).toBe(true);
    }
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
