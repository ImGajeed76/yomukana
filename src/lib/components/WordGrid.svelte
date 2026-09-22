<script lang="ts">
  import { DitherFill } from "$lib/charts";
  import type { Item } from "$lib/srs";
  import type { CharacterStat } from "$lib/stats";

  interface Props {
    /** Words the reader has met, slowest first. */
    words: readonly CharacterStat[];
    /** The reader's own typical recognition latency, used as the yardstick. */
    baselineMs: number;
    onSelect?: (item: Item) => void;
  }

  let { words, baselineMs, onSelect }: Props = $props();

  // Twice the reader's own baseline is the slow end of the scale, the same
  // yardstick the kana charts use, so a full tile means the same thing here.
  const SLOW_MULTIPLE = 2;

  // The tile's drawn shape. The dither is a picture, so it has to be drawn at
  // the size it will be shown at or the cells stretch out of square.
  const TILE_WIDTH = 112;
  const TILE_HEIGHT = 56;

  function fullnessOf(latencyMs: number | null): number | null {
    if (latencyMs === null || baselineMs <= 0) return null;
    return Math.min(Math.max(1 - latencyMs / (baselineMs * SLOW_MULTIPLE), 0), 1);
  }
</script>

<!--
  Tiles rather than the gojuon grid the kana get. A chart works for kana because
  the set is fixed, ordered and one character wide, so a box means the same place
  every time. Words have no canonical order, no fixed number of them, and range
  from 日 to 一生懸命, so a lattice would shuffle itself every session. Tiles wrap
  to fit whatever is in them and keep the one thing worth keeping: how full it
  is, is how fast you read it.

  The reading and the milliseconds are not here. A reader looking at this is
  scanning for what is slow, and how full a tile is says that without being read.
  A second line of kana and a number under every word make the scan harder, not
  easier. Both are one click away in the detail view, which is where someone who
  wants the exact figure has already gone, and the number is on the tile itself
  for anyone who hovers. See CLAUDE.md 12.5.
-->
<div
  class="grid gap-2"
  style:grid-template-columns="repeat(auto-fill, minmax({TILE_WIDTH}px, 1fr))"
>
  {#each words as stat (stat.item.id)}
    {@const fullness = fullnessOf(stat.meanLatencyMs)}
    <button
      type="button"
      class="group relative flex items-center justify-center overflow-hidden rounded-md border bg-background px-3 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style:height="{TILE_HEIGHT}px"
      title={stat.meanLatencyMs === null
        ? undefined
        : `${String(Math.round(stat.meanLatencyMs))} ms`}
      onclick={() => {
        onSelect?.(stat.item);
      }}
    >
      {#if fullness !== null}
        <DitherFill {fullness} width={TILE_WIDTH} height={TILE_HEIGHT} />
      {/if}

      <!-- Positioned, so it paints over the fill behind it. -->
      <span class="relative font-japanese text-xl leading-none" lang="ja">
        {stat.item.kind === "kanji" ? stat.item.surface : ""}
      </span>
    </button>
  {/each}
</div>
