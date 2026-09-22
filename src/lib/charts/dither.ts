// Ordered-dither painting primitives.
//
// Ported from dither-kit (MIT, https://tripwire.sh/dither-kit), which ships as
// React components this app cannot use. What is kept is the part that makes the
// look: the 4x4 Bayer matrix, two cells per CSS pixel, and the rule that a
// region's density drives *alpha on one colour* rather than a second shade.
// That rule is why the texture survives a theme flip. A lighter shade tuned for
// a dark background reads as a bright speck on a light one; the same colour at a
// lower alpha just blends into whatever sits behind it.
//
// Pure, no canvas and no DOM, so the thresholding can be tested directly.

/** 4x4 ordered (Bayer) matrix, normalised to thresholds in 0..1. */
export const BAYER: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));

/** CSS pixels per dither cell. Two is chunky enough to read as pixels. */
export const CELL = 2;

/** Alpha of the line capping a shape, now that its fill dissolves upward. */
export const BORDER_ALPHA = 0.72;
/**
 * Alpha of an unlit cell, relative to a lit one. The scatter modulates between
 * two tiers of the same colour instead of leaving holes, so the surface behind
 * never shows through as a stark speck.
 */
export const OFF_TIER = 0.22;

// Flattened once, so the hot path is one masked index instead of two. The 2D
// form above stays because that is how the matrix is written down everywhere.
const THRESHOLDS: readonly number[] = BAYER.flat();

/** The Bayer threshold for a backing-canvas cell. */
export function thresholdAt(x: number, y: number): number {
  return THRESHOLDS[((y & 3) << 2) | (x & 3)] ?? 0;
}

/** Whether a cell is lit at this density. */
export function isLit(density: number, x: number, y: number): boolean {
  return density > thresholdAt(x, y);
}

/** Splits one alpha into the lit tier and the faint one beneath it. */
export function tierAlpha(alpha: number, lit: boolean): number {
  return lit ? alpha : alpha * OFF_TIER;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export interface BackingSize {
  readonly cols: number;
  readonly rows: number;
}

/** Backing-canvas resolution for a box, which is then scaled up `pixelated`. */
export function backingSize(width: number, height: number): BackingSize {
  return {
    cols: Math.max(1, Math.round(width / CELL)),
    rows: Math.max(1, Math.round(height / CELL)),
  };
}

/**
 * Stretches a series to fill `cols` columns, interpolating between points.
 *
 * A reader with four days of history still gets a chart the width of the card,
 * and one with four hundred gets one that does not need every point drawn.
 */
export function resample(values: readonly number[], cols: number): number[] {
  const out = new Array<number>(cols).fill(0);
  if (values.length === 0) return out;

  const last = Math.max(values.length - 1, 1);
  for (let column = 0; column < cols; column++) {
    const position = (column / Math.max(cols - 1, 1)) * last;
    const index = Math.floor(position);
    const fraction = position - index;
    const from = values[Math.min(index, values.length - 1)] ?? 0;
    const to = values[Math.min(index + 1, values.length - 1)] ?? from;
    out[column] = from + (to - from) * fraction;
  }
  return out;
}
