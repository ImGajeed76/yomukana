<script lang="ts">
  import { DitherFill } from "$lib/charts";
  import type { ChartRow } from "$lib/japanese/chart";
  import { m } from "$lib/paraglide/messages";
  import { kanaItem, type ItemStore } from "$lib/srs";

  interface Props {
    /** The chart to draw, in gojuon order. */
    rows: readonly ChartRow[];
    store: ItemStore;
    /** The reader's own typical recognition latency, used as the yardstick. */
    baselineMs: number;
    /** Called with the kana when the reader asks to see it up close. */
    onSelect?: (kana: string) => void;
  }

  let { rows, store, baselineMs, onSelect }: Props = $props();

  interface Cell {
    readonly kana: string;
    readonly latencyMs: number | null;
    /** 0 when the reader is slow here, 1 when they are fast. Null when unseen. */
    readonly ease: number | null;
  }

  // Twice the reader's own baseline is the slow end of the scale. Beyond that
  // the exact number stops mattering: it is a character they have to stop for.
  const SLOW_MULTIPLE = 2;

  function cellFor(kana: string | null): Cell | null {
    if (kana === null) return null;

    const state = store.items.get(kanaItem(kana).id);
    const latencyMs = state?.meanLatencyMs ?? null;
    if (latencyMs === null || baselineMs <= 0) {
      return { kana, latencyMs: null, ease: null };
    }

    const ratio = latencyMs / (baselineMs * SLOW_MULTIPLE);
    return { kana, latencyMs, ease: Math.min(Math.max(1 - ratio, 0), 1) };
  }

  let grid = $derived(rows.map((row) => row.map(cellFor)));
</script>

<!--
  Speed fills the box like a bucket rather than tinting it: the faster the
  reader recognises a character, the higher the dither stands in it. A level is
  a shape, not a hue, so it stays legible to the one man in twelve who cannot
  read a red-to-green scale. See CLAUDE.md 8.4.

  No figure printed under the kana. A chart of a hundred boxes is for finding
  what is slow at a glance, and a hundred small numbers is the opposite of a
  glance. The exact one is on the box for anyone who hovers, and in the detail
  view for anyone who clicks. See CLAUDE.md 12.5.
-->
<div class="flex flex-col gap-2">
  {#each grid as row, rowIndex (rowIndex)}
    <div class="flex gap-2">
      {#each row as cell, cellIndex (cellIndex)}
        {#if cell === null}
          <div class="size-14"></div>
        {:else}
          <button
            type="button"
            class="group relative flex size-14 flex-col items-center justify-center overflow-hidden rounded-md border bg-background transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            class:border-dashed={cell.ease === null}
            title={cell.latencyMs === null
              ? m.stats_grid_unseen()
              : `${String(Math.round(cell.latencyMs))} ms`}
            onclick={() => {
              onSelect?.(cell.kana);
            }}
          >
            {#if cell.ease !== null}
              <DitherFill fullness={cell.ease} />
            {/if}
            <!-- Positioned, so it paints over the fill behind it. -->
            <span class="relative font-japanese text-xl leading-none" lang="ja">{cell.kana}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/each}
</div>
