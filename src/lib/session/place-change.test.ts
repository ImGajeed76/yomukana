import { describe, expect, test } from "bun:test";
import { placeChange, type BoardLine } from "./place-change";

function board(own: number): BoardLine[] {
  return [
    { name: "Aiko", isYou: false, score: 3400 },
    { name: "Kenji", isYou: false, score: 3200 },
    { name: "Mia", isYou: false, score: 300 },
    { name: "Lukas", isYou: false, score: 200 },
    { name: "You", isYou: true, score: own },
  ];
}

describe("placeChange", () => {
  test("the first sentence only says where the reader stands", () => {
    const change = placeChange(board(250), undefined);
    expect(change?.place).toBe(4);
    expect(change?.passed).toEqual([]);
    expect(change?.isPodium).toBe(false);
  });

  test("names whom a sentence passed, nearest first", () => {
    const before = placeChange(board(150), undefined)?.ahead;
    const change = placeChange(board(350), before);
    expect(change?.place).toBe(3);
    expect(change?.passed).toEqual(["Mia", "Lukas"]);
  });

  test("reaching the top three from below is the moment for a popup", () => {
    const before = placeChange(board(250), undefined)?.ahead;
    expect(placeChange(board(350), before)?.isPodium).toBe(true);
  });

  test("staying in the top three, or climbing outside it, is not", () => {
    const third = placeChange(board(350), undefined)?.ahead;
    expect(placeChange(board(360), third)?.isPodium).toBe(false);
    const fifth = placeChange(board(150), undefined)?.ahead;
    expect(placeChange(board(250), fifth)?.isPodium).toBe(false);
  });

  test("an equal score is not passed: places are shared on a tie", () => {
    const before = placeChange(board(250), undefined)?.ahead;
    const change = placeChange(board(300), before);
    expect(change?.place).toBe(3);
    expect(change?.passed).toEqual([]);
  });
});
