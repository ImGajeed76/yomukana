import { describe, expect, test } from "bun:test";
import { rankBoard, standingOf, type BoardEntry } from "./board";

function entry(username: string, score: number, isYou = false): BoardEntry {
  return { userId: username, username, score, scoredAt: null, isYou };
}

describe("rankBoard", () => {
  test("puts the highest score first", () => {
    const ranked = rankBoard([entry("low", 10), entry("high", 90), entry("me", 50, true)], 50);
    expect(ranked.map((row) => row.username)).toEqual(["high", "me", "low"]);
  });

  test("gives equal scores the same place, and skips the places they share", () => {
    const ranked = rankBoard([entry("a", 90), entry("b", 90), entry("c", 10)], 0);
    expect(ranked.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  test("puts the reader first among equals", () => {
    const ranked = rankBoard([entry("friend", 40), entry("me", 0, true)], 40);
    expect(ranked[0]?.username).toBe("me");
    expect(ranked.map((row) => row.rank)).toEqual([1, 1]);
  });

  test("ranks the reader on their score now, not the one from their last sync", () => {
    const ranked = rankBoard([entry("friend", 60), entry("me", 20, true)], 75);
    expect(ranked[0]?.username).toBe("me");
  });

  test("does not rank apart two scores that show as the same number", () => {
    const ranked = rankBoard([entry("friend", 40.4), entry("me", 0, true)], 39.6);
    expect(ranked.map((row) => row.rank)).toEqual([1, 1]);
  });
});

describe("standingOf", () => {
  test("names the one just above, not the one at the top", () => {
    const ranked = rankBoard([entry("top", 500), entry("next", 120), entry("me", 0, true)], 100);
    expect(standingOf(ranked)).toEqual({ kind: "behind", points: 20, username: "next" });
  });

  test("says leading, tied, or alone", () => {
    expect(standingOf(rankBoard([entry("friend", 10), entry("me", 0, true)], 50))).toEqual({
      kind: "leading",
    });
    expect(standingOf(rankBoard([entry("friend", 50), entry("me", 0, true)], 50))).toEqual({
      kind: "tied",
      username: "friend",
    });
    expect(standingOf(rankBoard([entry("me", 0, true)], 50))).toEqual({ kind: "alone" });
  });
});
