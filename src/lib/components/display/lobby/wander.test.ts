import { describe, expect, test } from "bun:test";
import { stepWalkers, walkerAt, type Floor } from "./wander";

const floor: Floor = {
  front: 10,
  back: -10,
  halfWidth: () => 20,
  seats: [],
  obstacles: [{ x: 0, z: 0, radius: 1.6 }],
  space: 1.5,
  pace: 1,
  clearings: [],
};

describe("stepWalkers", () => {
  test("goes round furniture between a walker and where it is going", () => {
    // Straight behind the bench from its goal: the case that used to press
    // against the bench for ever.
    const walker = walkerAt({ x: 0, z: 5 }, () => 0);
    walker.rest = 0;
    walker.toX = 0;
    walker.toZ = -5;
    for (let frame = 0; frame < 30 * 60; frame++) {
      walker.toX = 0;
      walker.toZ = -5;
      walker.rest = 0;
      stepWalkers([walker], 1 / 30, floor, () => 0.5);
    }
    expect(Math.hypot(walker.x, walker.z + 5)).toBeLessThan(0.5);
  });
});
