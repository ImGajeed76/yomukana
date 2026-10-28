import { describe, expect, test } from "bun:test";
import { assignSpots, gatherSpots, waveDelay } from "./gather";
import type { Floor } from "./wander";

const floor: Floor = {
  front: 4,
  back: -8,
  halfWidth: () => 15,
  seats: [],
  obstacles: [],
  space: 1.5,
  pace: 1,
  clearings: [],
};

describe("gatherSpots", () => {
  test("gives every place room, and fills the front middle first", () => {
    const space = 1.4;
    const spots = gatherSpots(80, floor, space);
    expect(spots).toHaveLength(80);
    const first = spots[0];
    expect(Math.abs(first?.x ?? Number.NaN)).toBeLessThan(space);
    expect(first?.z ?? Number.NaN).toBeLessThan(floor.back + space * 1.5);
    // The nudges may bring two a little closer than the space; never into each other.
    for (const [index, one] of spots.entries()) {
      for (const other of spots.slice(index + 1)) {
        expect(Math.hypot(one.x - other.x, one.z - other.z)).toBeGreaterThan(space * 0.7);
      }
    }
  });

  test("stops at the front of the floor rather than placing anyone off it", () => {
    const spots = gatherSpots(10_000, floor, 1.4);
    expect(spots.length).toBeLessThan(10_000);
    expect(spots.every((spot) => spot.z <= floor.front)).toBe(true);
  });
});

describe("gatherSpots round a podium", () => {
  test("rings its ground without stepping on it, the nearest places first", () => {
    const podium = { x: 0, z: -7, across: 4, deep: 2 };
    const ringed = { ...floor, clearings: [podium] };
    const spots = gatherSpots(40, ringed, 1.4, { x: podium.x, z: podium.z });
    expect(spots).toHaveLength(40);
    for (const spot of spots) {
      expect(Math.hypot(spot.x / podium.across, (spot.z - podium.z) / podium.deep)).toBeGreaterThan(
        1,
      );
    }
    // The first places hug the podium rather than starting far off.
    const first = spots[0];
    expect(Math.hypot(first?.x ?? 99, (first?.z ?? 99) - podium.z)).toBeLessThan(
      podium.across + 1.4,
    );
  });
});

describe("assignSpots", () => {
  test("never gives two the same place, and leaves out whoever has none", () => {
    const from = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ];
    const spots = [
      { x: 0, z: -5 },
      { x: 1, z: -5 },
    ];
    const assigned = assignSpots(from, spots, { x: 0, z: -6 });
    const given = assigned.filter((spot) => spot !== null);
    expect(new Set(given).size).toBe(2);
    expect(assigned.filter((spot) => spot === null)).toHaveLength(1);
  });

  test("gives the front places to whoever is nearest the screen", () => {
    const across = (z: number): { x: number; z: number }[] =>
      Array.from({ length: 12 }, (_, index) => ({ x: index - 6, z }));
    const front = across(-5);
    const back = across(-2);
    const near = across(-4.5);
    const far = across(3);
    // Far-off people listed first, so the order given counts for nothing.
    const assigned = assignSpots([...far, ...near], [...front, ...back], { x: 0, z: -6 });
    for (const spot of assigned.slice(12)) expect(spot?.z).toBe(-5);
    for (const spot of assigned.slice(0, 12)) expect(spot?.z).toBe(-2);
  });
});

describe("waveDelay", () => {
  test("rolls from left to right", () => {
    const still = (): number => 0;
    expect(waveDelay(-10, -10, 10, still)).toBeLessThan(waveDelay(10, -10, 10, still));
  });
});
