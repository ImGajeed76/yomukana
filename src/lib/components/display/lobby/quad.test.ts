import { describe, expect, test } from "bun:test";
import { quadTransform, type Corner } from "./quad";

/** Where the CSS matrix puts a point of the element. */
function apply(matrix: string, [x, y]: Corner): Corner {
  const m = matrix.slice("matrix3d(".length, -1).split(", ").map(Number);
  const at = (index: number): number => m[index] ?? 0;
  const w = at(3) * x + at(7) * y + at(15);
  return [(at(0) * x + at(4) * y + at(12)) / w, (at(1) * x + at(5) * y + at(13)) / w];
}

describe("quadTransform", () => {
  // A screen seen from above and to the side: narrower at the top, leaning.
  const corners = [
    [210, 95],
    [1310, 120],
    [160, 760],
    [1400, 720],
  ] as const;

  test("puts each corner of the element on its corner of the shape", () => {
    const matrix = quadTransform(1600, 900, corners);
    const sources = [
      [0, 0],
      [1600, 0],
      [0, 900],
      [1600, 900],
    ] as const;
    for (const [index, source] of sources.entries()) {
      const [x, y] = apply(matrix, source);
      // Within a twentieth of a pixel: the matrix is written out rounded.
      expect(x).toBeCloseTo(corners[index]?.[0] ?? Number.NaN, 1);
      expect(y).toBeCloseTo(corners[index]?.[1] ?? Number.NaN, 1);
    }
  });
});
