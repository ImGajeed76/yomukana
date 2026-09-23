import { describe, expect, test } from "bun:test";
import { Rating } from "ts-fsrs";
import {
  INITIAL_READER,
  gradeReview,
  isPlausibleLatency,
  trimReading,
  updateReader,
  type ReaderModel,
} from "./grade";

/** A reader whose keyboard baseline is `baselineMs`. */
function readerAt(baselineMs: number, reviews = 200): ReaderModel {
  return {
    ...INITIAL_READER,
    keyboard: { ...INITIAL_READER.keyboard, baselineMs, reviews },
  };
}

const steady = readerAt(400);

describe("gradeReview", () => {
  test("grades any wrong key as Again, however fast the reader was", () => {
    expect(gradeReview(50, 1, steady, "keyboard")).toBe(Rating.Again);
    expect(gradeReview(5, 3, steady, "keyboard")).toBe(Rating.Again);
  });

  test("grades by how far the latency sits from the reader's own baseline", () => {
    expect(gradeReview(250, 0, steady, "keyboard")).toBe(Rating.Easy);
    expect(gradeReview(500, 0, steady, "keyboard")).toBe(Rating.Good);
    expect(gradeReview(900, 0, steady, "keyboard")).toBe(Rating.Hard);
  });

  test("keeps Easy rare, because the baseline is the reader's own average", () => {
    // Half of anyone's reviews are faster than their own mean. Handing Easy to
    // all of them tells FSRS the character is mastered after two reads, and it
    // schedules accordingly: six in a row puts the interval past sixty years.
    expect(gradeReview(400, 0, steady, "keyboard")).toBe(Rating.Good);
    expect(gradeReview(340, 0, steady, "keyboard")).toBe(Rating.Good);
    expect(gradeReview(300, 0, steady, "keyboard")).toBe(Rating.Good);
  });

  test("gives a fast typist and a slow typist the same grade for the same reading", () => {
    const fast = readerAt(200);
    const slow = readerAt(800);

    // Each reader is two and a half times their own baseline: equally hesitant.
    expect(gradeReview(500, 0, fast, "keyboard")).toBe(Rating.Hard);
    expect(gradeReview(2000, 0, slow, "keyboard")).toBe(Rating.Hard);

    // And each is well inside it.
    expect(gradeReview(120, 0, fast, "keyboard")).toBe(Rating.Easy);
    expect(gradeReview(480, 0, slow, "keyboard")).toBe(Rating.Easy);
  });

  test("treats an interruption as ordinary rather than as forgetting", () => {
    expect(isPlausibleLatency(30_000)).toBe(false);
    expect(gradeReview(30_000, 0, steady, "keyboard")).toBe(Rating.Good);
  });

  test("does not let an unusually fast baseline make everything Hard", () => {
    // A 10ms baseline would put every real read far above the hard ratio.
    const implausible = readerAt(10, 5);
    expect(gradeReview(200, 0, implausible, "keyboard")).toBe(Rating.Good);
  });
});

describe("updateReader", () => {
  test("moves towards the reader's actual speed over many reviews", () => {
    let reader = INITIAL_READER;
    for (let index = 0; index < 200; index++) {
      reader = updateReader(reader, 300, "keyboard");
    }

    expect(reader.keyboard.reviews).toBe(200);
    expect(reader.keyboard.baselineMs).toBeGreaterThan(299);
    expect(reader.keyboard.baselineMs).toBeLessThan(305);
  });

  test("barely moves on a single review", () => {
    const moved = updateReader(steady, 2000, "keyboard");
    expect(moved.keyboard.baselineMs).toBeGreaterThan(400);
    expect(moved.keyboard.baselineMs).toBeLessThan(500);
  });

  test("ignores interruptions", () => {
    expect(updateReader(steady, 60_000, "keyboard")).toEqual(steady);
    expect(updateReader(steady, -1, "keyboard")).toEqual(steady);
  });
});

describe("trimReading", () => {
  test("takes the first reading of a character as it comes", () => {
    expect(trimReading(2400, null)).toBe(2400);
  });

  test("leaves an ordinary reading alone", () => {
    expect(trimReading(420, 300)).toBe(420);
  });

  test("caps a read that was an interruption rather than a slow read", () => {
    // Glancing out of the window must not make a known character look unknown.
    expect(trimReading(4200, 300)).toBe(900);
  });

  test("still lets a character the reader has genuinely lost climb", () => {
    // Three slow reads in a row, each capped, and the estimate follows them up
    // rather than pinning the character at what it used to cost.
    let estimate = 300;
    for (let read = 0; read < 3; read++) {
      const trimmed = trimReading(2400, estimate);
      estimate = estimate + 0.3 * (trimmed - estimate);
    }
    expect(estimate).toBeGreaterThan(600);
  });
});
