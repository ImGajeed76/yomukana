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
      ["k", 100],
      ["a", 200],
      ["s", 300],
      ["a", 400],
    ]);

    const summary = summarise(attempt);
    expect(summary.durationMs).toBe(400);
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
