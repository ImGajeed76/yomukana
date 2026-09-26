<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import { encode } from "uqr";

  interface Props {
    /** What the code says, usually a link. */
    value: string;
    /** What the code is, for screen readers, which cannot scan it. */
    label: string;
    /** Width classes. The code is square and fills the width it is given. */
    class?: ClassValue;
  }

  let { value, label, class: className = "" }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  /** The drawn width in CSS pixels, measured, so a phone gets a code as wide as its screen. */
  let width = $state(0);

  /** The blank margin scanners need around a code, in squares. The standard asks for four. */
  const QUIET_ZONE = 4;

  $effect(() => {
    const element = canvas;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      width = element.clientWidth;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  });

  // Drawn on a canvas from the grid uqr works out, rather than inserted as
  // SVG markup, so it takes the page's own colour tokens. Redrawn when the
  // value or the width changes, never otherwise.
  $effect(() => {
    const element = canvas;
    if (element === null || width === 0) return;
    const { data } = encode(value, { ecc: "M", border: QUIET_ZONE });
    // Whole device pixels per square, so every square is the same size and
    // neighbours meet without hairline gaps. What is left over is margin.
    const pixels = Math.round(width * window.devicePixelRatio);
    const module = Math.floor(pixels / data.length);
    const offset = Math.floor((pixels - module * data.length) / 2);
    element.width = pixels;
    element.height = pixels;
    const context = element.getContext("2d");
    if (context === null) return;

    const style = getComputedStyle(element);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, pixels, pixels);
    context.fillStyle = style.color;
    for (const [row, cells] of data.entries()) {
      for (const [column, isDark] of cells.entries()) {
        if (isDark)
          context.fillRect(offset + column * module, offset + row * module, module, module);
      }
    }
  });
</script>

<!-- The label sits on a wrapper: Svelte will not let a canvas take the img role. -->
<div role="img" aria-label={label} class={["shrink-0", className]}>
  <canvas
    bind:this={canvas}
    aria-hidden="true"
    class="block aspect-square w-full rounded-md bg-qr-light text-qr-dark"
  ></canvas>
</div>
