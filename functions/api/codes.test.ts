import { describe, expect, test } from "bun:test";
import { isCode, isUuid, randomCode } from "./codes";

describe("codes", () => {
  test("a random code has the length asked for and only readable characters", () => {
    for (let run = 0; run < 200; run++) {
      const code = randomCode(8);
      expect(isCode(code, 8)).toBe(true);
    }
  });

  test("refuses look-alike characters, wrong lengths and anything a query should not see", () => {
    expect(isCode("abcdefgh", 8)).toBe(true);
    expect(isCode("abcdefg0", 8)).toBe(false);
    expect(isCode("abcdefgl", 8)).toBe(false);
    expect(isCode("abcdefg", 8)).toBe(false);
    expect(isCode("abc'; --", 8)).toBe(false);
  });

  test("knows a UUID from something that only looks like one", () => {
    expect(isUuid("3f2b8c1e-7a4d-4e21-9b0c-5d6e7f8a9b0c")).toBe(true);
    expect(isUuid("3f2b8c1e-7a4d-4e21-9b0c-5d6e7f8a9b0")).toBe(false);
    expect(isUuid("3f2b8c1e_7a4d-4e21-9b0c-5d6e7f8a9b0c")).toBe(false);
    expect(isUuid("3f2b8c1e-7a4d-4e21-9b0c-5d6e7f8a9b0g")).toBe(false);
  });
});
