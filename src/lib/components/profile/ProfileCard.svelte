<script lang="ts">
  import IceDrop from "$lib/components/streak/IceDrop.svelte";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import type { Snippet } from "svelte";
  import WornBadge from "$lib/components/badges/WornBadge.svelte";
  import type { Worn } from "$lib/sync/badge-rules";
  import { m } from "$lib/paraglide/messages";
  import type { CardColor } from "$lib/sync/profile-rules";
  import { CARD_BACKGROUNDS } from "./colors";

  interface Props {
    username: string;
    displayName: string | null;
    cardColor: CardColor;
    /** The score to show, or null to leave it off, as a private profile does. */
    score: number | null;
    /** The group badges they wear, in their order. */
    badges?: readonly Worn[];
    /** Days in their reading streak. Left off at 0, when there is none to show. */
    streak?: number;
    /**
     * Whether the streak is only still running because a freeze covered a
     * missed day. Drawn as the ice drop, so "a streak, but last active three
     * days ago" explains itself.
     */
    isStreakFrozen?: boolean;
    /** Buttons under the name, like Follow. */
    children?: Snippet;
  }

  let {
    username,
    displayName,
    cardColor,
    score,
    badges = [],
    streak = 0,
    isStreakFrozen = false,
    children,
  }: Props = $props();

  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  let name = $derived(displayName ?? username);
  /**
   * Until there are avatars, the first character of the name. A whole
   * character, so an emoji or a kanji is not cut in half.
   */
  let initial = $derived(
    (graphemes.segment(name)[Symbol.iterator]().next().value?.segment ?? "").toUpperCase(),
  );
</script>

<!--
  A banner in the reader's colour, and the name under it. The same card on
  their public page, in settings as a preview, and later on the boards.
-->
<article class="overflow-hidden rounded-lg border border-border bg-background">
  <div class={["h-20", CARD_BACKGROUNDS[cardColor]]}></div>
  <div class="flex flex-col gap-4 px-6 pb-6">
    <div
      class={[
        "-mt-8 flex size-16 items-center justify-center rounded-full border-4 border-background text-2xl font-semibold text-profile-foreground",
        CARD_BACKGROUNDS[cardColor],
      ]}
      aria-hidden="true"
    >
      {initial}
    </div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-xl leading-snug font-semibold">{name}</span>
        <span class="truncate text-sm text-muted-foreground">@{username}</span>
        {#if badges.length > 0}
          <div class="mt-2 flex flex-wrap gap-1">
            {#each badges as worn, index (index)}
              <WornBadge {worn} />
            {/each}
          </div>
        {/if}
      </div>
      <div class="flex items-end gap-6">
        {#if streak > 0}
          <div class="flex flex-col items-end">
            <span class="text-xs text-muted-foreground">{m.streak_label()}</span>
            <span
              class="flex items-center gap-1 text-2xl leading-none font-semibold tabular-nums"
              title={isStreakFrozen ? m.streak_card_frozen() : undefined}
            >
              {#if isStreakFrozen}
                <IceDrop class="size-5" />
                <span class="sr-only">{m.streak_card_frozen()}</span>
              {:else}
                <StreakFlame class="size-5" />
              {/if}
              {streak}
            </span>
          </div>
        {/if}
        {#if score !== null}
          <div class="flex flex-col items-end">
            <span class="text-xs text-muted-foreground">{m.stats_score_label()}</span>
            <span class="text-2xl leading-none font-semibold tabular-nums">{Math.round(score)}</span
            >
          </div>
        {/if}
      </div>
    </div>
    {#if children}
      {@render children()}
    {/if}
  </div>
</article>
