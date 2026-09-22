import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROGRESSION,
  START,
  advance,
  bandsAround,
  type Outcome,
  type Progression,
} from "./progression";

// Clean, and read well under the reader's own norm.
const easy: Outcome = { accuracy: 1, easeRatio: 0.4, challenge: 2 };
// Clean, but read at about the speed the reader usually reads.
const fitting: Outcome = { accuracy: 1, easeRatio: 1.1, challenge: 2 };
// Typed badly.
const messy: Outcome = { accuracy: 0.7, easeRatio: 1.1, challenge: 2 };
// Typed cleanly but read far slower than usual, so the reader was working.
const laboured: Outcome = { accuracy: 1, easeRatio: 2.4, challenge: 2 };

function run(start: Progression, outcomes: readonly Outcome[]): Progression {
  let progression = start;
  for (const outcome of outcomes) progression = advance(progression, outcome);
  return progression;
}

describe("advance", () => {
  test("moves up after three sentences with nothing left to learn", () => {
    expect(run(START, [easy, easy]).band).toBe(0);
    expect(run(START, [easy, easy, easy]).band).toBe(1);
  });

  test("moves down after two sentences the reader typed badly", () => {
    const mid: Progression = { band: 5, easyStreak: 0, hardStreak: 0 };
    expect(run(mid, [messy]).band).toBe(5);
    expect(run(mid, [messy, messy]).band).toBe(4);
  });

  test("counts slow reading as a struggle even when typed cleanly", () => {
    const mid: Progression = { band: 5, easyStreak: 0, hardStreak: 0 };
    expect(run(mid, [laboured, laboured]).band).toBe(4);
  });

  test("does not promote on accuracy alone", () => {
    // Perfect typing at the reader's usual reading speed is not readiness.
    expect(run(START, [fitting, fitting, fitting, fitting]).band).toBe(0);
  });

  test("does not promote a fast reader who is making mistakes", () => {
    const fastButWrong: Outcome = { accuracy: 0.95, easeRatio: 0.3, challenge: 2 };
    expect(run(START, [fastButWrong, fastButWrong, fastButWrong]).band).toBe(0);
  });

  test("breaks an easy streak with one sentence that fit", () => {
    expect(run(START, [easy, easy, fitting, easy, easy]).band).toBe(0);
  });

  test("breaks a hard streak with one sentence that fit", () => {
    const mid: Progression = { band: 5, easyStreak: 0, hardStreak: 0 };
    expect(run(mid, [messy, fitting, messy]).band).toBe(5);
  });

  test("does not move below the first band or above the last", () => {
    expect(run(START, [messy, messy, messy, messy]).band).toBe(0);

    const top: Progression = {
      band: DEFAULT_PROGRESSION.highestBand,
      easyStreak: 0,
      hardStreak: 0,
    };
    expect(run(top, [easy, easy, easy, easy, easy, easy]).band).toBe(
      DEFAULT_PROGRESSION.highestBand,
    );
  });

  test("keeps moving a reader who is far past the material", () => {
    // Nine easy sentences is three promotions, which is the point: a reader who
    // already reads this well should not spend a session proving it.
    expect(run(START, Array<Outcome>(9).fill(easy)).band).toBe(3);
  });
});

describe("bandsAround", () => {
  test("keeps a band either side, so the selector has room to move", () => {
    expect(bandsAround(4, 9)).toEqual([3, 4, 5]);
  });

  test("does not ask for bands that do not exist", () => {
    expect(bandsAround(0, 9)).toEqual([0, 1]);
    expect(bandsAround(9, 9)).toEqual([8, 9]);
  });
});

describe("running out of material", () => {
  // The signal that keeps working once the reader's baseline has caught up with
  // them: the sentences stop containing anything they need to practise.
  const nothingLeft: Outcome = { accuracy: 1, easeRatio: 1.1, challenge: 0 };

  test("moves a reader up when the band has nothing left to teach them", () => {
    expect(run(START, [nothingLeft, nothingLeft, nothingLeft]).band).toBe(1);
  });

  test("still will not move a reader up who is getting it wrong", () => {
    const wrong: Outcome = { accuracy: 0.8, easeRatio: 1.1, challenge: 0 };
    expect(run(START, [wrong, wrong, wrong]).band).toBe(0);
  });

  test("moves a reader down when a sentence asks too much at once", () => {
    const overloaded: Outcome = { accuracy: 1, easeRatio: 1.1, challenge: 9 };
    expect(run({ band: 5, easyStreak: 0, hardStreak: 0 }, [overloaded, overloaded]).band).toBe(4);
  });
});
