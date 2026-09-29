import { describe, expect, test } from "bun:test";
import { inviteCodeIn } from "./group-rules";

describe("inviteCodeIn", () => {
  test("reads a code the way people copy it by hand", () => {
    expect(inviteCodeIn("abcd2345")).toBe("abcd2345");
    expect(inviteCodeIn("ABCD 2345")).toBe("abcd2345");
    expect(inviteCodeIn(" abcd-2345 ")).toBe("abcd2345");
  });

  test("reads the code out of a pasted invite link", () => {
    expect(inviteCodeIn("https://yomukana.app/join/abcd2345")).toBe("abcd2345");
  });

  test("refuses what cannot be a code", () => {
    // Too short, and letters no code has, since they look like others.
    expect(inviteCodeIn("abcd234")).toBeNull();
    expect(inviteCodeIn("abcd2340")).toBeNull();
    expect(inviteCodeIn("abcdl345")).toBeNull();
  });
});
