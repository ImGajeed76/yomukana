import { describe, expect, test } from "bun:test";
import { OFF_TIER, backingSize, isLit, resample, thresholdAt, tierAlpha } from "./dither";

describe("thresholdAt", () => {
  test("tiles the matrix, so a wide area keeps one continuous texture", () => {
    expect(thresholdAt(4, 4)).toBe(thresholdAt(0, 0));
    expect(thresholdAt(7, 5)).toBe(thresholdAt(3, 1));
  });
});

describe("isLit", () => {
  test("lights nothing at zero and everything at one", () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(isLit(0, x, y)).toBe(false);
        expect(isLit(1, x, y)).toBe(true);
      }
    }
  });

  test("lights about half the matrix at half density", () => {
    let lit = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (isLit(0.5, x, y)) lit += 1;
      }
    }
    expect(lit).toBe(8);
  });
});

describe("tierAlpha", () => {
  test("keeps an unlit cell faintly filled rather than empty", () => {
    // The whole point of the two tiers: at low density the surface still reads
    // as tinted, not as holes punched through to the card behind it.
    expect(tierAlpha(0.8, false)).toBeGreaterThan(0);
    expect(tierAlpha(0.8, false)).toBeLessThan(tierAlpha(0.8, true));
    expect(tierAlpha(0.8, false)).toBe(0.8 * OFF_TIER);
  });
});

describe("resample", () => {
  test("returns zeroes for an empty series rather than a ragged array", () => {
    expect(resample([], 3)).toEqual([0, 0, 0]);
  });

  test("pins the ends and interpolates between them", () => {
    expect(resample([0, 10], 3)).toEqual([0, 5, 10]);
  });

  test("stretches a single point across the whole width", () => {
    expect(resample([4], 3)).toEqual([4, 4, 4]);
  });
});

describe("backingSize", () => {
  test("halves the box, since a dither cell is two CSS pixels", () => {
    expect(backingSize(200, 60)).toEqual({ cols: 100, rows: 30 });
  });

  test("never returns a zero-sized canvas", () => {
    expect(backingSize(0, 0)).toEqual({ cols: 1, rows: 1 });
  });
});
