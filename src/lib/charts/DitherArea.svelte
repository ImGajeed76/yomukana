<script lang="ts">
  import { mode } from "mode-watcher";
  import { Spring, Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { backingSize, clamp01, resample } from "./dither";
  import { paintColumn, prefersReducedMotion, rgbOf } from "./paint";

  /** One reading on the line, with what to call it when the pointer is on it. */
  export interface ChartPoint {
    readonly label: string;
    readonly value: number;
  }

  interface Props {
    /** The series, oldest first. */
    points: readonly ChartPoint[];
    /** What the chart says, for a reader who cannot see it. */
    label: string;
    /** What the line is called, shown beside the value under the pointer. */
    seriesLabel: string;
    /** How a value reads in the tooltip. */
    format?: (value: number) => string;
    /** Drawn height in CSS pixels. */
    height?: number;
  }

  let {
    points,
    label,
    seriesLabel,
    format = (value) => value.toLocaleString(),
    height = 140,
  }: Props = $props();

  /**
   * Gap between the pointer and the tooltip's corner, and the edge it flips at.
   * Ten, and anchored top-left, is what LayerChart does when a tooltip follows
   * the pointer, which is the behaviour a shadcn chart inherits.
   */
  const TOOLTIP_OFFSET = 10;
  const FADE_MS = 100;

  /** How much of the usual alpha the light theme gets. See the paint below. */
  const LIGHT_WEIGHT = 0.88;
  const HOVER_MS = 200;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let hovered = $state<number | null>(null);
  /** Where the pointer is inside the box. The tooltip rides along with it. */
  let pointerX = $state(0);
  let pointerY = $state(0);
  let tooltipWidth = $state(0);
  let tooltipHeight = $state(0);

  // The tooltip trails the pointer rather than being pinned to it. LayerChart
  // springs its position by default, and that slight lag is most of what makes
  // a chart tooltip feel like one instead of like a cursor decoration.
  const tipX = new Spring(0);
  const tipY = new Spring(0);

  // The lift is painted, not styled, so it has to be animated as a number the
  // paint can read. Instant when the reader has asked for less movement.
  const lift = new Tween(0, { duration: HOVER_MS, easing: cubicOut });

  let point = $derived(hovered === null ? null : (points[hovered] ?? null));

  /**
   * Where the tooltip's top-left corner wants to be.
   *
   * Below and right of the pointer, flipping to the other side of it rather
   * than sliding along the edge, so it never covers the reading it describes.
   */
  let target = $derived({
    x:
      pointerX + TOOLTIP_OFFSET + tooltipWidth > width
        ? pointerX - TOOLTIP_OFFSET - tooltipWidth
        : pointerX + TOOLTIP_OFFSET,
    y:
      pointerY + TOOLTIP_OFFSET + tooltipHeight > height
        ? pointerY - TOOLTIP_OFFSET - tooltipHeight
        : pointerY + TOOLTIP_OFFSET,
  });

  $effect(() => {
    // Placed without animation the first time, or it flies in from the corner.
    const instant = hovered === null || prefersReducedMotion();
    void tipX.set(target.x, { instant });
    void tipY.set(target.y, { instant });
  });
  /** Where the hovered reading sits across the box, 0 to 1. */
  let position = $derived(
    hovered === null || points.length < 2 ? 0 : hovered / (points.length - 1),
  );

  function moveTo(event: MouseEvent) {
    const box = event.currentTarget;
    if (!(box instanceof HTMLElement) || points.length === 0) return;

    const bounds = box.getBoundingClientRect();
    pointerX = event.clientX - bounds.left;
    pointerY = event.clientY - bounds.top;

    const fraction = clamp01(pointerX / box.clientWidth);
    hovered = Math.round(fraction * (points.length - 1));
    void lift.set(1, { duration: prefersReducedMotion() ? 0 : HOVER_MS });
  }

  function leave() {
    hovered = null;
    void lift.set(0, { duration: prefersReducedMotion() ? 0 : HOVER_MS });
  }

  $effect(() => {
    const element = canvas;
    if (element === null || width === 0) return;

    // A dark pattern on a light background reads heavier than the same pattern
    // inverted, so the light theme gets a little less alpha to land at the same
    // weight. Reading the mode here is also what repaints on a theme flip: the
    // colour below comes from the DOM, which tells Svelte nothing on its own.
    const weight = mode.current === "light" ? LIGHT_WEIGHT : 1;
    const colour = getComputedStyle(element).color;
    const intensity = lift.current;

    const { cols, rows } = backingSize(width, height);
    element.width = cols;
    element.height = rows;

    const context = element.getContext("2d");
    if (context === null) return;

    const values = points.map((entry) => Math.max(entry.value, 0));
    const highest = Math.max(...values, 0);
    // A series of nothing would otherwise divide by zero and paint nothing.
    const scale = highest === 0 ? 0 : 1 / highest;
    const columns = resample(
      values.map((value) => clamp01(value * scale)),
      cols,
    );

    // Written into a buffer and uploaded once. A chart this wide is tens of
    // thousands of cells, and as canvas calls that is tens of thousands of
    // state changes on the frame the reader is waiting for.
    const image = context.createImageData(cols, rows);
    const rgb = rgbOf(colour);
    for (const [x, fraction] of columns.entries()) {
      paintColumn(image.data, cols, x, rows - fraction * rows, rows, rgb, { weight, intensity });
    }
    context.putImageData(image, 0, 0);
  });
</script>

<!--
  The canvas is drawn at one cell per two CSS pixels and scaled up with nearest
  neighbour, which is what makes the dither read as pixels rather than as noise.
  It carries its colour through `color`, so a caller restyles it with a text
  colour class like anything else.
-->
<div
  class="relative w-full text-primary"
  bind:clientWidth={width}
  style:height="{height}px"
  role="img"
  aria-label={label}
  onmousemove={moveTo}
  onmouseleave={leave}
>
  <canvas
    bind:this={canvas}
    class="block h-full w-full"
    style:image-rendering="pixelated"
    aria-hidden="true"
  ></canvas>

  {#if point !== null}
    {@const cursor = position * width}
    <!--
      The cursor is a dashed rule at the reading under the pointer, the same one
      a shadcn chart draws, so someone who has used one knows what this is
      without being told.
    -->
    <div
      class="pointer-events-none absolute inset-y-0 w-0 border-l border-dashed border-border"
      style:left="{cursor}px"
    ></div>
    <!--
      Riding the pointer rather than parked on the cursor, which is how every
      chart the reader has used behaves.
    -->
    <div
      bind:clientWidth={tooltipWidth}
      bind:clientHeight={tooltipHeight}
      transition:fade={{ duration: FADE_MS }}
      class="pointer-events-none absolute grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
      style:left="{tipX.current}px"
      style:top="{tipY.current}px"
    >
      <div class="font-medium">{point.label}</div>
      <div class="flex w-full items-center gap-2">
        <div class="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-current"></div>
        <div class="flex flex-1 shrink-0 items-center justify-between gap-4 leading-none">
          <span class="text-muted-foreground">{seriesLabel}</span>
          <span class="font-mono font-medium text-foreground tabular-nums">
            {format(point.value)}
          </span>
        </div>
      </div>
    </div>
  {/if}
</div>
