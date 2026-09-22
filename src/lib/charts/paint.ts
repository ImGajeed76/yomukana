// Painting the dither into a pixel buffer. The thresholds themselves live in
// `dither.ts`, which stays free of the DOM so they can be tested directly.
//
// Everything here writes into an `ImageData` rather than calling `fillRect` per
// cell. A chart is half a million cells; as canvas calls that is half a million
// state changes and draw commands, and as an array it is one write each and a
// single upload at the end.

import { BORDER_ALPHA, thresholdAt, tierAlpha } from "./dither";

export type Rgb = readonly [number, number, number];

export interface ColumnPaint {
  /** Overall alpha multiplier, used to even the texture out across themes. */
  readonly weight: number;
  /**
   * Hover lift, 0 to 1.
   *
   * It lowers the dither threshold, so more of the matrix lights and the scatter
   * visibly thickens. It deliberately does not touch the alpha: raising that
   * brightened every column by the same amount, which made the difference in
   * height between neighbouring columns show through the texture as stripes.
   * The texture is the point, so the lift changes how much of it there is and
   * nothing else.
   */
  readonly intensity: number;
}

/**
 * How far the hover drops the dither threshold.
 *
 * The matrix holds sixteen evenly spaced thresholds, so this lights about three
 * more cells in every sixteen. Enough to notice as the pointer crosses, not
 * enough to read as a different chart.
 */
const HOVER_BIAS = 0.2;

function put(pixels: Uint8ClampedArray, offset: number, rgb: Rgb, alpha: number): void {
  pixels[offset] = rgb[0];
  pixels[offset + 1] = rgb[1];
  pixels[offset + 2] = rgb[2];
  pixels[offset + 3] = alpha * 255;
}

/**
 * Fills one column from `top` down to the floor with the ordered-dither
 * scatter, and caps it with a soft edge.
 *
 * The scatter is dense at the floor and dissolves as it rises, so the shape
 * fades out before it reaches its own top. That is why the edge is drawn rather
 * than left to the fill: without it the column has no readable level.
 *
 * `x` is the column's position in the Bayer matrix as well as in the buffer, so
 * neighbouring columns interlock into one texture instead of repeating a stripe.
 */
export function paintColumn(
  pixels: Uint8ClampedArray,
  cols: number,
  x: number,
  top: number,
  rows: number,
  rgb: Rgb,
  { weight, intensity }: ColumnPaint,
): void {
  const from = Math.round(top);
  const depth = rows - from;
  if (depth <= 0) return;

  const bias = HOVER_BIAS * intensity;

  for (let y = from; y < rows; y++) {
    // Inverted falloff: 0 at the level line, 1 at the floor.
    const density = (y - from) / depth;
    const lit = density > thresholdAt(x, y) - bias;
    put(pixels, (y * cols + x) * 4, rgb, weight * tierAlpha(0.3 + density * 0.7, lit));
  }

  put(pixels, (from * cols + x) * 4, rgb, weight * BORDER_ALPHA);
  if (depth > 1) {
    put(pixels, ((from + 1) * cols + x) * 4, rgb, weight * BORDER_ALPHA * 0.5);
  }
}

/** Whether the reader has asked for less movement. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The colour the dither paints in, resolved once per theme.
 *
 * Reading it off each canvas meant a `getComputedStyle` per box, and a gojuon
 * chart is a hundred of them. Each one forces the browser to recompute style
 * before it can answer, so the cost is not the call, it is a hundred of them in
 * a row. One hidden probe answers for all of them.
 */
let resolved: { theme: string; colour: string } | null = null;

export function ditherColour(theme: string): string {
  if (resolved?.theme === theme) return resolved.colour;

  const probe = document.createElement("span");
  probe.className = "text-primary";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();

  resolved = { theme, colour };
  return colour;
}

/**
 * A CSS colour as red, green and blue.
 *
 * Read back out of a canvas rather than parsed, because the theme hands over an
 * `oklch(...)` and the browser is the only thing here that knows what that means
 * in sRGB. Cached, since it is one lookup per theme.
 */
const channels = new Map<string, Rgb>();

export function rgbOf(colour: string): Rgb {
  const cached = channels.get(colour);
  if (cached !== undefined) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return [0, 0, 0];

  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

  const rgb: Rgb = [red, green, blue];
  channels.set(colour, rgb);
  return rgb;
}
