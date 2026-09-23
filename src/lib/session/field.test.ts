import { describe, expect, test } from "bun:test";
import { fieldChange } from "./field";

describe("fieldChange", () => {
  test("reads a key typed at the end", () => {
    expect(fieldChange(" ka", " kak")).toEqual({ deleted: 0, inserted: ["k"] });
  });

  test("reads a backspace", () => {
    expect(fieldChange(" kak", " ka")).toEqual({ deleted: 1, inserted: [] });
  });

  test("reads a composing keyboard replacing its word as one new key", () => {
    // Gboard rewrites the whole composing word on every key. Only the part that
    // is new is a key.
    expect(fieldChange(" k", " ka")).toEqual({ deleted: 0, inserted: ["a"] });
  });

  test("reads a rewritten word as deletions and retyping", () => {
    // A keyboard that changes its mind about a word the reader already typed:
    // what went is backspaced, what came is typed.
    expect(fieldChange(" kaa", " kai")).toEqual({ deleted: 1, inserted: ["i"] });
  });

  test("reads several keys arriving at once, in order", () => {
    expect(fieldChange(" ", " shi")).toEqual({ deleted: 0, inserted: ["s", "h", "i"] });
  });

  test("changes nothing when nothing changed", () => {
    expect(fieldChange(" ka", " ka")).toEqual({ deleted: 0, inserted: [] });
  });
});
