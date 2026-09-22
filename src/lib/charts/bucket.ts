// Dithered buckets, drawn once and then handed out as a class name.
//
// A gojuon chart is a hundred boxes and every one of them is the same handful of
// fill levels. Painting each box is a hundred canvases, a hundred style reads and
// tens of thousands of rectangles, for maybe thirty distinct pictures.
//
// So each distinct level is drawn once, as a strip of frames from resting to
// fully lifted, and the picture goes in a stylesheet rather than on the boxes. A
// data URL is several hundred characters; inline, a chart of them is a few
// hundred kilobytes of style text for the browser to parse, most of it the same
// string over and over. As a rule it is written once and every box that needs it
// carries a short class name instead.
//
// The hover then costs nothing at all: the strip is taller than the box and gets
// slid by whole frames, so the scatter thickens frame by frame the way it would
// if something were repainting it, with nothing repainting it.
//
// It slides with `transform`, which the compositor animates on its own. Moving
// it with `background-position` looks identical and is not composited, so every
// frame is a paint on the main thread. Crossing a chart quickly leaves a dozen
// boxes animating at once, and those paints are what made frames disappear.

import { CELL } from "./dither";
import { paintColumn, rgbOf } from "./paint";

/** Frames between resting and fully lifted. Enough to read as movement. */
const FRAMES = 8;

/** Quantisation of a fill level, which bounds how many strips can be cached. */
const LEVEL_STEPS = 64;

const CLASS_PREFIX = "dither-bucket-";
const HOVER_MS = 200;

const classes = new Map<string, string>();
let sheet: CSSStyleSheet | null = null;

/** The one stylesheet every bucket picture is written into. */
function rules(): CSSStyleSheet | null {
  if (sheet !== null) return sheet;

  const element = document.createElement("style");
  document.head.append(element);
  sheet = element.sheet;
  return sheet;
}

/**
 * One canvas, reused for every picture.
 *
 * `willReadFrequently` keeps it on the CPU. Without it the browser backs the
 * canvas on the GPU, and then reading the picture back out stalls until the GPU
 * has caught up. Forty of those in a row, while the page is trying to render,
 * is the difference between a chart appearing and a chart arriving eventually.
 */
let scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;

function surface(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  if (scratch === null) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return null;
    scratch = { canvas, context };
  }

  if (scratch.canvas.width !== width || scratch.canvas.height !== height) {
    scratch.canvas.width = width;
    scratch.canvas.height = height;
  }
  return scratch;
}

/** The whole animation for one level, stacked top to bottom, as a data URL. */
function drawStrip(
  colour: string,
  width: number,
  height: number,
  level: number,
  weight: number,
): string | null {
  // Drawn at the box's own shape rather than square and stretched, or the
  // dither cells come out as rectangles and stop reading as pixels.
  const cols = Math.max(1, Math.round(width / CELL));
  const rows = Math.max(1, Math.round(height / CELL));
  const target = surface(cols, rows * FRAMES);
  if (target === null) return null;

  const rgb = rgbOf(colour);
  const top = rows - level * rows;

  for (let frame = 0; frame < FRAMES; frame++) {
    const image = target.context.createImageData(cols, rows);
    const intensity = frame / (FRAMES - 1);
    for (let x = 0; x < cols; x++) {
      paintColumn(image.data, cols, x, top, rows, rgb, { weight, intensity });
    }
    target.context.putImageData(image, 0, frame * rows);
  }

  return target.canvas.toDataURL();
}

/**
 * The class that fills a box to `level`.
 *
 * Returns an empty string where there is no document to draw on, which is every
 * prerendered page. The real picture arrives when the browser takes over.
 */
export function bucketClass(
  colour: string,
  width: number,
  height: number,
  level: number,
  weight: number,
): string {
  const step = Math.round(level * LEVEL_STEPS) / LEVEL_STEPS;
  const key = `${colour}|${String(width)}x${String(height)}|${String(step)}|${String(weight)}`;

  const cached = classes.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return "";

  const url = drawStrip(colour, width, height, step, weight);
  const target = rules();
  if (url === null || target === null) return "";

  const name = CLASS_PREFIX + String(classes.size);
  // The strip is one box tall per frame, and the last frame sits this far up.
  const strip = FRAMES * 100;
  const travel = ((FRAMES - 1) / FRAMES) * 100;

  // The resting state carries no transition, so leaving the box snaps straight
  // back to the first frame.
  //
  // That is deliberate. A transition reversed halfway does not rewind: it starts
  // again from wherever it is and divides what is left into the same number of
  // steps, which no longer land on frame boundaries. The strip then stops
  // between two frames and shows the bottom of one above the top of the next,
  // and what the reader sees is the fill sliding down out of the box. It only
  // happens when the pointer leaves before the fill finishes, which is to say
  // whenever they move quickly, which is most of the time.
  target.insertRule(
    `.${name}{background-image:url(${url});height:${String(strip)}%;transform:translateY(0)}`,
    target.cssRules.length,
  );
  // Scoped to the box, never `*:hover`: the universal selector makes the browser
  // restyle the whole document every time the pointer moves. Stepped, so it
  // lands on whole frames rather than between two of them.
  target.insertRule(
    `.group:hover .${name}{transform:translateY(-${String(travel)}%);` +
      `transition:transform ${String(HOVER_MS)}ms steps(${String(FRAMES - 1)})}`,
    target.cssRules.length,
  );
  target.insertRule(
    `@media (prefers-reduced-motion: reduce){.group:hover .${name}{transition:none}}`,
    target.cssRules.length,
  );

  classes.set(key, name);
  return name;
}
