<script lang="ts">
  import { mode } from "mode-watcher";
  import { clamp01 } from "./dither";
  import { bucketClass } from "./bucket";
  import { ditherColour } from "./paint";

  interface Props {
    /** How full the box reads, 0 for empty and 1 for brim full. */
    fullness: number;
    /** The box's size in CSS pixels, which is the shape the picture is drawn at. */
    width?: number;
    height?: number;
  }

  let { fullness, width = 56, height = 56 }: Props = $props();

  /** How much of the usual alpha the light theme gets. */
  const LIGHT_WEIGHT = 0.88;

  // A dark pattern on a light background reads heavier than the same pattern
  // inverted, so the light theme gets a little less alpha to land at the same
  // weight. Reading the mode here is also what redraws on a theme flip.
  let theme = $derived(mode.current ?? "dark");
  let weight = $derived(theme === "light" ? LIGHT_WEIGHT : 1);
  let level = $derived(clamp01(fullness));

  let fill = $derived(bucketClass(ditherColour(theme), width, height, level, weight));
</script>

<!--
  A bucket filling up: the scatter is solid at the bottom and dissolves toward
  the level, so how full the box is reads before any number does.

  One picture holding every frame of the hover, taller than the box and slid up
  by whole frames when the box is hovered, with the box clipping it. The lift
  thickens the scatter, which CSS cannot do to a drawing, but it can move one, so
  the animation costs a stylesheet rule rather than a repaint per box.

  The rules live in bucket.ts beside the drawing they belong to, including why
  the fill animates in and snaps out rather than animating both ways.

  Decoration for a figure that is also written out, so it is hidden from
  assistive technology rather than described twice.
-->
<span class="fill {fill}" aria-hidden="true"></span>

<style>
  /* Height and the slide come from the generated rule, which knows how many
     frames are in the picture it just drew. */
  .fill {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    background-size: 100% 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }
</style>
