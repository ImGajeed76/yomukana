import { describe, expect, test } from "bun:test";
import { LONGEST_RANDOM_USERNAME, isValidUsername, randomUsername } from "./username";

describe("isValidUsername", () => {
  test("takes lowercase letters, digits, hyphens and underscores", () => {
    expect(isValidUsername("quiet-tanuki_42")).toBe(true);
  });

  test("takes a name typed with capitals or spaces around it, as it will be stored", () => {
    expect(isValidUsername("  Quiet-Tanuki ")).toBe(true);
  });

  test("refuses names too short, too long, or with anything else in them", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(21))).toBe(false);
    expect(isValidUsername("quiet tanuki")).toBe(false);
    expect(isValidUsername("たぬき")).toBe(false);
    expect(isValidUsername("tanuki!")).toBe(false);
  });
});

describe("randomUsername", () => {
  test("always makes a name the database will take", () => {
    // The longest combination is the one that could break the length limit.
    expect(isValidUsername(LONGEST_RANDOM_USERNAME)).toBe(true);
    for (let seed = 0; seed < 200; seed++) expect(isValidUsername(randomUsername())).toBe(true);
  });

  test("reads as adjective, animal, number", () => {
    expect(randomUsername(() => 0)).toBe("quiet-tanuki-10");
  });
});
