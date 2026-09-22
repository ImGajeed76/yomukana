import { describe, expect, test } from "bun:test";
import { AT_REST, CORRECT_IMPULSE, GRAVITY, WRONG_IMPULSE, fallen, struck } from "./energy";

describe("struck", () => {
  test("lifts the page and cancels the fall under way", () => {
    const energy = struck({ level: 0.2, velocity: -1.4 }, CORRECT_IMPULSE);
    expect(energy.level).toBeCloseTo(0.2 + CORRECT_IMPULSE);
    expect(energy.velocity).toBe(0);
  });

  test("pays a key that landed far more than one that did not", () => {
    expect(CORRECT_IMPULSE).toBeGreaterThan(WRONG_IMPULSE * 5);
  });

  test("lights the page inside a few correct keys", () => {
    let energy = AT_REST;
    for (let key = 0; key < 3; key++) energy = struck(energy, CORRECT_IMPULSE);
    expect(energy.level).toBeGreaterThan(0.9);
  });

  test("cannot be driven past full, however fast the reader types", () => {
    let energy = AT_REST;
    for (let key = 0; key < 50; key++) energy = struck(energy, CORRECT_IMPULSE);
    expect(energy.level).toBe(1);
  });
});

describe("fallen", () => {
  test("hangs before it drops, rather than fading from the first instant", () => {
    // A tenth of a second after the last key it has barely moved. That pause is
    // what keeps a run of keystrokes reading as one continuous thing.
    const energy = fallen({ level: 1, velocity: 0 }, 0.1);
    expect(energy.level).toBeGreaterThan(0.97);
  });

  test("falls faster the longer it has been falling", () => {
    const early = fallen({ level: 1, velocity: 0 }, 0.25);
    const late = fallen({ level: 1, velocity: -GRAVITY }, 0.25);
    expect(1 - late.level).toBeGreaterThan(1 - early.level);
  });

  test("comes to rest at the floor rather than going through it", () => {
    expect(fallen({ level: 0.05, velocity: -2 }, 0.5)).toEqual(AT_REST);
  });

  test("a single keystroke dies away within a couple of seconds", () => {
    let energy = struck(AT_REST, CORRECT_IMPULSE);
    let seconds = 0;
    while (energy.level > 0 && seconds < 10) {
      energy = fallen(energy, 1 / 60);
      seconds += 1 / 60;
    }
    expect(seconds).toBeLessThan(2);
  });
});
