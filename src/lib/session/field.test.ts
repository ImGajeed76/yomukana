import { describe, expect, test } from "bun:test";
import { keysForCharacter } from "../romaji/kana-keys";
import { fieldChange, readFieldChange } from "./field";

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

describe("readFieldChange", () => {
  const spell = (character: string): string | null => keysForCharacter(character);

  test("reads a romaji keyboard exactly as before: a key per letter", () => {
    const reading = readFieldChange([0], fieldChange(" ", " ka"), spell);
    expect(reading).toEqual({ backspaces: 0, keys: ["k", "a"], keyCounts: [0, 1, 1] });
  });

  test("turns a kana into the keys that spell it", () => {
    const reading = readFieldChange([0], fieldChange(" ", " ね"), spell);
    expect(reading.keys).toEqual(["n", "e"]);
    expect(reading.keyCounts).toEqual([0, 2]);
  });

  test("takes back every key of a kana the keypad replaced", () => {
    // A flick keypad cycling な to に replaces the character: both keys of na
    // come back out before ni goes in.
    const reading = readFieldChange([0, 2], fieldChange(" な", " に"), spell);
    expect(reading).toEqual({ backspaces: 2, keys: ["n", "i"], keyCounts: [0, 2] });
  });

  test("leaves typed kana alone when the keyboard converts them to kanji", () => {
    const reading = readFieldChange([0, 2, 2], fieldChange(" ねこ", " 猫"), spell);
    // The kanji keeps the four keys of ねこ, so deleting it takes them back.
    expect(reading).toEqual({ backspaces: 0, keys: [], keyCounts: [0, 4] });
  });

  test("still reads the kana typed in the same step as a live conversion", () => {
    // iOS converts as you type: ねこ becomes 猫 in the same change that adds が.
    const reading = readFieldChange([0, 2, 2], fieldChange(" ねこ", " 猫が"), spell);
    expect(reading).toEqual({ backspaces: 0, keys: ["g", "a"], keyCounts: [0, 4, 2] });
  });

  test("takes back every key of a converted kanji when it is deleted", () => {
    const reading = readFieldChange([0, 4, 2], fieldChange(" 猫が", " 猫"), spell);
    expect(reading.backspaces).toBe(2);
    const whole = readFieldChange([0, 4], fieldChange(" 猫", " "), spell);
    expect(whole.backspaces).toBe(4);
  });
});
