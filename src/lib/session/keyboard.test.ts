import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { startAttempt, type Attempt } from "./attempt";
import {
  applyKey,
  classifyKey,
  shouldHoldKana,
  shouldPreventDefault,
  type KeyEvent,
} from "./keyboard";

function event(key: string, modifiers: Partial<KeyEvent> = {}): KeyEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
}

/** Types a string into a fresh attempt, one key per 100ms. */
function type(text: string, keys: string): Attempt {
  let attempt = startAttempt(segmentKana(text), 0);
  let at = 1000;

  for (const key of keys) {
    at += 100;
    attempt = applyKey(attempt, classifyKey(event(key)), at).attempt;
  }
  return attempt;
}

describe("classifyKey", () => {
  test("treats a single character as input", () => {
    expect(classifyKey(event("k"))).toEqual({ kind: "type", key: "k" });
    expect(classifyKey(event("-"))).toEqual({ kind: "type", key: "-" });
    expect(classifyKey(event("'"))).toEqual({ kind: "type", key: "'" });
  });

  test("lowercases, so caps lock is not a wall of errors", () => {
    expect(classifyKey(event("K"))).toEqual({ kind: "type", key: "k" });
  });

  test("leaves browser and system shortcuts alone", () => {
    expect(classifyKey(event("r", { ctrlKey: true })).kind).toBe("ignore");
    expect(classifyKey(event("r", { metaKey: true })).kind).toBe("ignore");
    expect(classifyKey(event("r", { altKey: true })).kind).toBe("ignore");
  });

  test("ignores keys that are not characters", () => {
    for (const key of ["Enter", "Tab", "Shift", "ArrowLeft", "F5", "Escape"]) {
      expect(classifyKey(event(key)).kind).toBe("ignore");
    }
  });

  test("recognises backspace", () => {
    expect(classifyKey(event("Backspace"))).toEqual({ kind: "backspace" });
  });

  test("does not swallow a key the exercise is not using", () => {
    expect(shouldPreventDefault(classifyKey(event("Enter")))).toBe(false);
    expect(shouldPreventDefault(classifyKey(event("k")))).toBe(true);
    expect(shouldPreventDefault(classifyKey(event("Backspace")))).toBe(true);
  });
});

describe("applyKey", () => {
  test("starts the clock at the first key, not when the sentence appeared", () => {
    // The attempt was created at 0; the reader starts typing at 1100.
    const attempt = type("かさ", "kasa");
    expect(attempt.startedAt).toBe(1100);
    expect(attempt.finishedAt).toBe(1400);
  });

  test("reports a wrong key so the view can show it", () => {
    const fresh = startAttempt(segmentKana("かさ"), 0);
    expect(applyKey(fresh, classifyKey(event("k")), 10).wasRejected).toBe(false);
    expect(applyKey(fresh, classifyKey(event("z")), 10).wasRejected).toBe(true);
  });

  test("leaves the attempt untouched for a key it ignores", () => {
    const fresh = startAttempt(segmentKana("かさ"), 0);
    const outcome = applyKey(fresh, classifyKey(event("Enter")), 10);

    expect(outcome.attempt).toBe(fresh);
    expect(outcome.wasRejected).toBe(false);
  });

  test("does not count a backspace as an error", () => {
    let attempt = type("かさ", "k");
    attempt = applyKey(attempt, classifyKey(event("Backspace")), 2000).attempt;

    expect(attempt.errors).toBe(0);
    expect(attempt.typing.keystrokes).toEqual([]);
  });

  test("runs a whole sentence through, wrong keys and all", () => {
    let attempt = type("こんかい", "kozz");
    attempt = applyKey(attempt, classifyKey(event("Backspace")), 5000).attempt;
    attempt = applyKey(attempt, classifyKey(event("Backspace")), 5100).attempt;
    for (const [index, key] of ["n", "k", "a", "i"].entries()) {
      attempt = applyKey(attempt, classifyKey(event(key)), 5200 + index * 100).attempt;
    }

    expect(attempt.finishedAt).not.toBeNull();
    expect(attempt.errors).toBe(2);
    expect(attempt.typing.keystrokes.join("")).toBe("konkai");
  });
});

describe("shouldHoldKana", () => {
  const nothingBefore = { backspaces: 0, keys: [] };

  test("holds a kana the flick keypad's ゛゜小 key can still correct", () => {
    expect(shouldHoldKana(type("が", ""), "か", nothingBefore, 2000)).toBe(true);
    expect(shouldHoldKana(type("ぱ", ""), "ば", nothingBefore, 2000)).toBe(true);
    expect(shouldHoldKana(type("きゃ", "ki"), "や", nothingBefore, 2000)).toBe(true);
    expect(shouldHoldKana(type("ガ", ""), "カ", nothingBefore, 2000)).toBe(true);
  });

  test("holds a kana multitap passes through on the way to the right one", () => {
    expect(shouldHoldKana(type("ね", ""), "な", nothingBefore, 2000)).toBe(true);
    expect(shouldHoldKana(type("ど", ""), "た", nothingBefore, 2000)).toBe(true);
  });

  test("types a kana that is already right", () => {
    expect(shouldHoldKana(type("か", ""), "か", nothingBefore, 2000)).toBe(false);
  });

  test("types a wrong kana on a key that cannot reach the right one", () => {
    // A mistake, and counted as one straight away.
    expect(shouldHoldKana(type("ね", ""), "か", nothingBefore, 2000)).toBe(false);
  });

  test("judges the kana after what the same change typed first", () => {
    expect(shouldHoldKana(type("ねが", ""), "か", { backspaces: 0, keys: ["n", "e"] }, 2000)).toBe(
      true,
    );
  });
});
