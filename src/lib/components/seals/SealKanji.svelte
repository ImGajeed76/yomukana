<script lang="ts">
  import type { SealTier } from "$lib/sync/seal-rules";

  interface Props {
    kanji: string;
    tier: SealTier;
  }

  let { kanji, tier }: Props = $props();
</script>

<!--
  The kanji as a small piece of calligraphy rather than a letter, built up in
  layers the rarer the seal is: pressed into the pill with a hard shadow,
  then set in an ensō (円相), the zen circle drawn in one stroke, then traced
  in light with the circle turning. The ensō is the brush font's own 〇, so it is a real
  brush stroke and not a drawn ring.
-->
<span class="kanji" data-tier={tier} lang="ja" aria-hidden="true">
  {#if tier >= 3}<span class="kanji-enso">〇</span>{/if}
  {#if tier >= 2}<span class="kanji-depth">{kanji}</span>{/if}
  <span class="kanji-face">{kanji}</span>
</span>

<style>
  .kanji {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 1.25em;
    height: 1.25em;
    font-family: var(--font-seal);
    font-size: 1.3em;
    font-weight: 400;
    line-height: 1;
  }

  /* The brush font draws its characters low in their box; lifted to the middle. */
  .kanji-face,
  .kanji-depth {
    grid-area: 1 / 1;
    margin-top: -0.12em;
  }

  /* The ink catches the light at the top of each stroke and deepens below. */
  .kanji-face {
    position: relative;
    color: transparent;
    background: linear-gradient(
      oklch(from var(--ink) calc(l + 0.1) c h),
      oklch(from var(--ink) calc(l - 0.12) c h)
    );
    background-clip: text;
  }

  /* The rarest are cast in light: paper at the top, deepening to ink. */
  .kanji[data-tier="5"] .kanji-face {
    background: linear-gradient(var(--seal-paper) 15%, var(--ink));
    background-clip: text;
  }

  /*
   * Every kanji is edged in the dark of its own body, so it stands off the
   * pill whatever colour both are: a pale character on a dark seal gets a
   * darker rim, a dark one on a pale seal a slightly bolder one.
   */
  .kanji-face {
    -webkit-text-stroke: 0.05em oklch(from var(--body) calc(l - 0.3) c h / 55%);
    paint-order: stroke fill;
  }

  /* Pressed in: the same strokes, dark and a little down and right. */
  .kanji-depth {
    position: relative;
    translate: 0.03em 0.04em;
    color: oklch(from var(--body) calc(l - 0.2) c h / 70%);
  }

  /*
   * The ensō behind it, larger than the character and a little off true.
   * Laid over the middle rather than in the grid, so its size never moves
   * the kanji off centre.
   */
  .kanji-enso {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 1.7em;
    color: oklch(from var(--glow) l c h / 24%);
    translate: -50% -50%;
    rotate: -18deg;
  }

  /* The circle turns, slowly. */
  .kanji[data-tier="4"] .kanji-enso,
  .kanji[data-tier="5"] .kanji-enso {
    color: oklch(from var(--glow) l c h / 40%);
    animation: kanji-turn 14s linear infinite;
  }

  @keyframes kanji-turn {
    to {
      rotate: 342deg;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .kanji-enso {
      animation: none;
    }
  }
</style>
