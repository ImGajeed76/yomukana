import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import {
  backspaceKey,
  measuredLatency,
  pressKey,
  recognitionLatency,
  startAttempt,
  summarise,
  usableTimings,
  type Attempt,
  type SegmentTiming,
} from "./attempt";

/** Drives an attempt from a script of [key, timestamp] pairs. */
function run(text: string, script: readonly (readonly [string, number])[]): Attempt {
  let attempt = startAttempt(segmentKana(text), 0);
  for (const [key, at] of script) {
    attempt = key === "\b" ? backspaceKey(attempt, at) : pressKey(attempt, key, at);
  }
  return attempt;
}

describe("timing", () => {
  test("separates the pause before a segment from the time spent spelling it", () => {
    // The reader starts typing か at once, then stalls 200ms before さ.
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["s", 300],
      ["a", 350],
    ]);

    const [first, second] = attempt.timings;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    expect(recognitionLatency(first)).toBe(0);
    expect(recognitionLatency(second)).toBe(200);
  });

  test("starts the clock on the first key even when it is wrong", () => {
    // The reader reached for a key at 200ms and got it wrong. They still
    // recognised the character at 200ms.
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["t", 200],
      ["\b", 300],
      ["s", 400],
      ["a", 450],
    ]);

    const second = attempt.timings[1];
    expect(second).toBeDefined();
    if (second === undefined) return;

    expect(recognitionLatency(second)).toBe(100);
    expect(second.errors).toBe(1);
  });

  test("counts errors against the segment that was current", () => {
    const attempt = run("かさ", [
      ["z", 10],
      ["\b", 15],
      ["k", 20],
      ["a", 30],
      ["s", 40],
      ["a", 50],
    ]);

    expect(attempt.errors).toBe(1);
    expect(attempt.timings[0]?.errors).toBe(1);
    expect(attempt.timings[1]?.errors).toBe(0);
  });

  test("finishes when the last segment settles", () => {
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["s", 200],
      ["a", 300],
    ]);

    expect(attempt.finishedAt).toBe(300);
    expect(attempt.timings).toHaveLength(2);
  });

  test("ignores keys after the sentence is finished", () => {
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["s", 200],
      ["a", 300],
      ["x", 400],
    ]);

    expect(attempt.keyCount).toBe(4);
    expect(attempt.errors).toBe(0);
  });

  test("does not treat the first segment as a measurement", () => {
    // Nothing precedes the first segment, so its latency is always zero and
    // grading it would hand the reader a free Easy on every sentence.
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["s", 300],
      ["a", 350],
    ]);

    expect(attempt.timings[0]?.isReliable).toBe(false);
    expect(attempt.timings[1]?.isReliable).toBe(true);
    expect(usableTimings(attempt).map((timing) => timing.segment)).toEqual([1]);
  });

  test("times a segment that settles late because of an ambiguous reading", () => {
    // ん does not settle until the k rules out nn, so its timing runs to that key.
    const attempt = run("こんかい", [
      ["k", 0],
      ["o", 50],
      ["n", 100],
      ["k", 200],
      ["a", 250],
      ["i", 300],
    ]);

    const moraicN = attempt.timings[1];
    expect(moraicN).toBeDefined();
    if (moraicN === undefined) return;

    expect(moraicN.segment).toBe(1);
    expect(recognitionLatency(moraicN)).toBe(50);
    expect(moraicN.settledAt).toBe(200);
  });
});

describe("backspace", () => {
  test("drops the timing of a segment it un-settles and flags the retype", () => {
    const attempt = run("こんかい", [
      ["k", 0],
      ["o", 50],
      ["n", 100],
      ["k", 200],
      ["\b", 300],
    ]);

    // ん was settled by the k, and the backspace takes that back.
    expect(attempt.timings.map((timing) => timing.segment)).toEqual([0]);
    expect(attempt.isCurrentCorrected).toBe(true);
  });

  test("marks the segment it lands in so grading can drop it", () => {
    const attempt = run("かさたな", [
      ["k", 0],
      ["a", 50],
      ["s", 100],
      ["\b", 150],
      ["s", 200],
      ["a", 250],
      ["t", 300],
      ["a", 350],
      ["n", 400],
      ["a", 450],
    ]);

    // The first segment is never a measurement, and the backspace spoils さ.
    expect(attempt.timings[0]?.isReliable).toBe(false);
    expect(attempt.timings[1]?.isReliable).toBe(false);
    expect(attempt.timings[2]?.isReliable).toBe(true);
    expect(usableTimings(attempt).map((timing) => timing.segment)).toEqual([2, 3]);
  });

  test("does nothing before the first key", () => {
    const attempt = run("かさ", [["\b", 50]]);
    expect(attempt.keyCount).toBe(0);
    expect(attempt.isCurrentCorrected).toBe(false);
  });
});

describe("summarise", () => {
  test("reports accuracy and reading speed", () => {
    const attempt = run("かさ", [
      ["z", 0],
      ["\b", 50],
      ["k", 100],
      ["a", 200],
      ["s", 300],
      ["a", 400],
    ]);

    const summary = summarise(attempt);
    expect(summary.durationMs).toBe(400);
    // The backspace is not a key: correcting is not typing.
    expect(summary.keyCount).toBe(5);
    expect(summary.errors).toBe(1);
    expect(summary.accuracy).toBe(0.8);
    // Two segments in 400ms is 300 a minute.
    expect(summary.segmentsPerMinute).toBe(300);
  });

  test("reports an untouched attempt without dividing by zero", () => {
    const summary = summarise(startAttempt(segmentKana("かさ"), 0));
    expect(summary.accuracy).toBe(1);
    expect(summary.segmentsPerMinute).toBe(0);
  });
});

describe("measuredLatency", () => {
  test("measures a clean read to the first key, so a long mora is not marked slow", () => {
    const timing: SegmentTiming = {
      segment: 1,
      availableAt: 1000,
      firstKeyAt: 1300,
      settledAt: 1700,
      errors: 0,
      isReliable: true,
    };
    expect(measuredLatency(timing)).toBe(300);
  });

  test("measures an errored read to the point it came out right", () => {
    // Hammering a key the instant a character appears must not read as knowing
    // it. The clock runs until the reader actually produced the character.
    const timing: SegmentTiming = {
      segment: 1,
      availableAt: 1000,
      firstKeyAt: 1010,
      settledAt: 2400,
      errors: 3,
      isReliable: true,
    };
    expect(measuredLatency(timing)).toBe(1400);
  });
});

describe("wrong keys", () => {
  test("land on the screen and hold everything after them until deleted", () => {
    // In the reader's head the z is typed, so it is typed on screen too. The k
    // after it is sitting after a mistake and lands with it.
    const attempt = run("かさ", [
      ["z", 0],
      ["k", 10],
    ]);

    expect(attempt.stray).toBe("zk");
    expect(attempt.typing.keystrokes).toEqual([]);
    expect(attempt.errors).toBe(2);
  });

  test("are deleted before anything the reader got right", () => {
    const attempt = run("かさ", [
      ["k", 0],
      ["z", 10],
      ["\b", 20],
    ]);

    // The z went. The k, which was right, is still there.
    expect(attempt.stray).toBe("");
    expect(attempt.typing.keystrokes).toEqual(["k"]);
  });

  test("do not make a character unreliable when deleted", () => {
    // Deleting a mistake is the ordinary way through one. The character is
    // still timed, to the moment it finally came out right.
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["z", 300],
      ["\b", 350],
      ["s", 400],
      ["a", 500],
    ]);

    const second = attempt.timings[1];
    expect(second?.isReliable).toBe(true);
    expect(second?.errors).toBe(1);
    if (second !== undefined) expect(measuredLatency(second)).toBe(400);
  });
});

describe("backspace", () => {
  test("cannot reach back into a character that is finished and right", () => {
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["\b", 200],
      ["\b", 300],
    ]);

    expect(attempt.typing.keystrokes).toEqual(["k", "a"]);
    expect(attempt.typing.settled).toBe(1);
  });

  test("deletes keys in the character still being typed", () => {
    const attempt = run("かさ", [
      ["k", 0],
      ["a", 100],
      ["s", 200],
      ["\b", 300],
    ]);

    expect(attempt.typing.keystrokes).toEqual(["k", "a"]);
  });
});

/** Types a whole string, one key every 10ms. */
function typeAll(text: string, keys: readonly string[]): Attempt {
  return run(
    text,
    keys.map((key, index) => [key, index * 10] as const),
  );
}

describe("typed keys", () => {
  test("are kept for each character as the reader typed them", () => {
    // Kunrei all the way: the spelling the reader chose, not the preferred one.
    const attempt = typeAll("しゃしん", ["s", "y", "a", "s", "i", "n"]);
    expect(attempt.typedBySegment).toEqual(["sya", "si", "n"]);
  });

  test("give a doubled consonant its own key", () => {
    const attempt = typeAll("がっこう", ["g", "a", "k", "k", "o", "u"]);
    expect(attempt.typedBySegment).toEqual(["ga", "k", "ko", "u"]);
  });
});
