<script lang="ts">
  import { mode } from "mode-watcher";
  import { clamp01, isLit } from "./dither";
  import { AT_REST, fallen, struck, type Energy } from "./energy";
  import { activity } from "$lib/session";

  /** CSS pixels per cell. The same two as the charts, so it reads as fine grain. */
  const CELL = 2;

  /** Density right at the source. Paper, not content. */
  const PEAK = 0.3;
  /** How far up the light reaches, as a fraction of the window height. */
  const REACH_UP = 0.5;
  /** And sideways from the middle, as a fraction of the window width. */
  const REACH_ACROSS = 0.55;
  /** How fast it falls off. Above 1 it collapses toward the source. */
  const FALLOFF = 2.2;
  /** Alpha of a lit cell, per theme. Dark rooms take a little more. */
  const DARK_ALPHA = 0.07;
  const LIGHT_ALPHA = 0.055;

  /**
   * The keystroke layer: a denser scatter that reaches less far, drawn in the
   * accent colour. Different numbers on purpose, so what flashes under a
   * keystroke is a different texture rather than the same one turned up.
   */
  const PULSE_PEAK = 0.5;
  const PULSE_REACH_UP = 0.34;
  const PULSE_REACH_ACROSS = 0.4;
  const PULSE_FALLOFF = 1.6;
  const PULSE_ALPHA = 0.22;

  /** How much taller the glow stands when the page is fully lit. */
  const LIFT = 0.4;

  interface Layer {
    readonly peak: number;
    readonly up: number;
    readonly across: number;
    readonly falloff: number;
    readonly alpha: number;
  }

  let paper = $state<HTMLCanvasElement | null>(null);
  let pulse = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let height = $state(0);

  let energy: Energy = AT_REST;
  let frame = 0;
  let last = 0;

  function paint(element: HTMLCanvasElement, colour: string, layer: Layer): void {
    const cols = Math.max(1, Math.round(width / CELL));
    const rows = Math.max(1, Math.round(height / CELL));
    element.width = cols;
    element.height = rows;

    const context = element.getContext("2d");
    if (context === null) return;

    context.clearRect(0, 0, cols, rows);
    context.fillStyle = colour;
    context.globalAlpha = layer.alpha;

    // Ordered dithering is how you draw a gradient without one: the falloff
    // never changes colour or alpha, only how many cells it lights, so what
    // fades out toward the top is the texture itself. That is also why this is
    // not the gradient CLAUDE.md 8.5 rules out. It is one flat colour, scattered.
    const centre = cols / 2;
    const across = cols * layer.across;
    const up = rows * layer.up;
    // Nothing above the reach can be lit, so those rows are never walked.
    const ceiling = Math.max(0, Math.floor(rows - up));

    for (let y = ceiling; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // An ellipse anchored to the bottom edge, halfway across: it is gone by
        // half the window height, which is where a page stops feeling lit.
        const distance = Math.hypot((x - centre) / across, (rows - y) / up);
        const density = layer.peak * clamp01(1 - distance) ** layer.falloff;
        if (isLit(density, x, y)) context.fillRect(x, y, 1, 1);
      }
    }
  }

  $effect(() => {
    if (paper === null || pulse === null || width === 0 || height === 0) return;

    const isLight = mode.current === "light";
    paint(paper, getComputedStyle(paper).color, {
      peak: PEAK,
      up: REACH_UP,
      across: REACH_ACROSS,
      falloff: FALLOFF,
      alpha: isLight ? LIGHT_ALPHA : DARK_ALPHA,
    });
    paint(pulse, getComputedStyle(pulse).color, {
      peak: PULSE_PEAK,
      up: PULSE_REACH_UP,
      across: PULSE_REACH_ACROSS,
      falloff: PULSE_FALLOFF,
      alpha: PULSE_ALPHA,
    });
  });

  /**
   * Draws the current energy onto the accent layer.
   *
   * Written straight to the element rather than through state: this runs on
   * every frame the page is lit, and a signal per frame would walk the whole
   * reactive graph to move one opacity. Opacity and transform are both
   * compositor properties, so the frame costs nothing after this.
   */
  function show(element: HTMLCanvasElement): void {
    element.style.opacity = String(energy.level);
    element.style.transform = `scaleY(${String(1 - LIFT + LIFT * energy.level)})`;
  }

  function tick(at: number): void {
    const element = pulse;
    if (element === null) return;

    // Capped, so a tab left in the background does not come back and drop the
    // whole thing in one enormous step.
    const seconds = Math.min((at - last) / 1000, 0.05);
    last = at;
    energy = fallen(energy, seconds);
    show(element);

    frame = energy.level > 0 ? requestAnimationFrame(tick) : 0;
  }

  // One keystroke, one shove. Both layers are already drawn, so typing moves an
  // opacity and a scale and never a pixel. The loop only runs while there is
  // something to fall, and stops itself the moment the page is dark again.
  $effect(() => {
    const element = pulse;
    const keystrokes = activity.keystrokes;
    if (element === null || keystrokes === 0) return;

    energy = struck(energy, activity.impulse);
    show(element);

    if (frame === 0) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });

  $effect(() => () => {
    if (frame !== 0) cancelAnimationFrame(frame);
  });
</script>

<!--
  Pinned to the bottom of the page rather than to the window, so it is the foot
  of the document that is lit and the reader scrolls down into it. One window
  tall, which is what keeps the arc the same shape on a short page and a long
  one. Behind everything and untouchable.

  Two layers: the paper, and a denser scatter in the accent colour that the
  reader lifts by typing and gravity takes back. Both are painted once, so a
  keystroke moves an opacity and a scale and never a pixel.
-->
<div
  class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-svh"
  bind:clientWidth={width}
  bind:clientHeight={height}
  aria-hidden="true"
>
  <canvas
    bind:this={paper}
    class="absolute inset-0 block h-full w-full text-foreground"
    style:image-rendering="pixelated"
    aria-hidden="true"
  ></canvas>
  <canvas
    bind:this={pulse}
    class="absolute inset-0 block h-full w-full origin-bottom text-primary opacity-0 motion-reduce:hidden"
    style:image-rendering="pixelated"
    aria-hidden="true"
  ></canvas>
</div>
