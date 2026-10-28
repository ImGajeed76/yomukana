// Fits a page element onto a four-cornered shape on the screen, so the lobby
// board, which the page draws as ordinary HTML and text, lies on the face of
// the 3D screen in the room as if it were shown on it. The text stays text:
// sharp at any size, and the board's own scrolling and moving rows still work.
//
// A rectangle seen at an angle is not a rectangle any more but any four-sided
// shape, and only a projective transform (a homography) maps one onto the
// other. CSS can apply one as matrix3d.

type Matrix = readonly [number, number, number, number, number, number, number, number, number];
export type Corner = readonly [number, number];

function adjugate(m: Matrix): Matrix {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const of = (m: Matrix, index: number): number => m[index] ?? 0;
  const at = (row: number, column: number): number =>
    of(a, row * 3) * of(b, column) +
    of(a, row * 3 + 1) * of(b, 3 + column) +
    of(a, row * 3 + 2) * of(b, 6 + column);
  return [at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2), at(2, 0), at(2, 1), at(2, 2)];
}

/** The transform taking the unit square's corners to these four, as homogeneous coordinates. */
function fromBasis([a, b, c, d]: readonly [Corner, Corner, Corner, Corner]): Matrix {
  const m: Matrix = [a[0], b[0], c[0], a[1], b[1], c[1], 1, 1, 1];
  const adj = adjugate(m);
  const v = [
    adj[0] * d[0] + adj[1] * d[1] + adj[2],
    adj[3] * d[0] + adj[4] * d[1] + adj[5],
    adj[6] * d[0] + adj[7] * d[1] + adj[8],
  ] as const;
  return multiply(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/**
 * The CSS `matrix3d` that lays a `width` by `height` element, with its
 * transform origin at its top left, onto the corners top left, top right,
 * bottom left, bottom right.
 */
export function quadTransform(
  width: number,
  height: number,
  corners: readonly [Corner, Corner, Corner, Corner],
): string {
  const source = fromBasis([
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]);
  const t = multiply(fromBasis(corners), adjugate(source));
  const n = t.map((value) => value / t[8]);
  const columns = [n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, n[8]];
  return `matrix3d(${columns.map((value) => (value ?? 0).toFixed(8)).join(", ")})`;
}
