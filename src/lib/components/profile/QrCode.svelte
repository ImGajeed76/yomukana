<script lang="ts">
  import { encode } from "uqr";

  interface Props {
    /** What the code says, usually a link. */
    value: string;
    /** What the code is, for screen readers, which cannot scan it. */
    label: string;
    /** Width and height in CSS pixels. */
    size?: number;
  }

  let { value, label, size = 192 }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  /** The blank margin scanners need around a code, in squares. The standard asks for four. */
  const QUIET_ZONE = 4;

  // Drawn on a canvas from the grid uqr works out, rather than inserted as
  // SVG markup, so it takes the page's own colour tokens. Redrawn when the
  // value or the size changes, never otherwise.
  $effect(() => {
    const element = canvas;
    if (element === null) return;
    const { data } = encode(value, { ecc: "M", border: QUIET_ZONE });
    const scale = window.devicePixelRatio;
    element.width = size * scale;
    element.height = size * scale;
    const context = element.getContext("2d");
    if (context === null) return;

    const style = getComputedStyle(element);
    const module = (size * scale) / data.length;
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, element.width, element.height);
    context.fillStyle = style.color;
    for (const [row, cells] of data.entries()) {
      for (const [column, isDark] of cells.entries()) {
        // Whole pixels, so neighbouring squares meet without hairline gaps.
        if (isDark) {
          context.fillRect(
            Math.floor(column * module),
            Math.floor(row * module),
            Math.ceil(module),
            Math.ceil(module),
          );
        }
      }
    }
  });
</script>

<!-- The label sits on a wrapper: Svelte will not let a canvas take the img role. -->
<div role="img" aria-label={label} class="shrink-0">
  <canvas
    bind:this={canvas}
    aria-hidden="true"
    class="block rounded-md bg-qr-light text-qr-dark"
    style="width: {size}px; height: {size}px"
  ></canvas>
</div>
