import { describe, expect, test } from "bun:test";
import { isCurveFor, scoreAt, type ScoreLine } from "./score-curve";

const DAY = 86_400_000;
const SENT = 1_000_000_000_000;
const CURVE = [900, 800, 700, 600, 500, 400];

/** A score of 1,000 sent at SENT, with a curve worked out at the same moment. */
const line: ScoreLine = { score: 1000, scoredAt: SENT, curve: CURVE, curveAt: SENT };

describe("scoreAt", () => {
  test("is the score sent, until there is a curve", () => {
    expect(scoreAt({ ...line, curve: null, curveAt: null }, SENT + 30 * DAY)).toBe(1000);
  });

  test("falls along a straight line to each point of the curve", () => {
    expect(scoreAt(line, SENT + DAY / 2)).toBe(950);
    expect(scoreAt(line, SENT + DAY)).toBe(900);
    expect(scoreAt(line, SENT + 2 * DAY)).toBe(850);
  });

  test("stays at the last point once past it", () => {
    expect(scoreAt(line, SENT + 400 * DAY)).toBe(400);
  });

  test("starts from a newer score when the curve came with an earlier sync", () => {
    // Curve from five minutes before a sync that sent 990: the line runs
    // from 990 to the curve's first point, not from the curve's own start.
    const later: ScoreLine = { ...line, score: 990, scoredAt: SENT + 5 * 60_000 };
    expect(scoreAt(later, SENT + 5 * 60_000)).toBe(990);
    expect(scoreAt(later, SENT + DAY)).toBe(900);
  });

  test("never rises, even when the reader got past an old curve", () => {
    // Read on after the curve was made, so the score sent is under where the
    // old curve's points are held: a day on, still not above it.
    const behind: ScoreLine = { ...line, score: 850, scoredAt: SENT + 60 * 60_000 };
    expect(scoreAt(behind, SENT + DAY)).toBe(850);
    expect(scoreAt(behind, SENT + 3 * DAY)).toBe(800);
  });
});

describe("isCurveFor", () => {
  test("takes a curve that never rises and stays under the score", () => {
    expect(isCurveFor(CURVE, 1000)).toBe(true);
    expect(isCurveFor([1000, 1000, 1000, 1000, 1000, 1000], 1000)).toBe(true);
  });

  test("refuses one that would show more than the score", () => {
    expect(isCurveFor([1100, 800, 700, 600, 500, 400], 1000)).toBe(false);
    expect(isCurveFor([900, 950, 700, 600, 500, 400], 1000)).toBe(false);
  });

  test("refuses anything that is not six numbers", () => {
    expect(isCurveFor([900, 800], 1000)).toBe(false);
    expect(isCurveFor([900, 800, 700, 600, 500, Number.NaN], 1000)).toBe(false);
    expect(isCurveFor("900,800", 1000)).toBe(false);
  });
});
