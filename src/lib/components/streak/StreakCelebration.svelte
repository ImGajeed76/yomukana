<script lang="ts">
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { scale } from "svelte/transition";
  import StreakWeek from "./StreakWeek.svelte";
  import { m } from "$lib/paraglide/messages";
  import type { Streak } from "$lib/stats/streak";

  interface Props {
    streak: Streak;
  }

  let { streak }: Props = $props();
</script>

<!--
  The day's goal, reached with the sentence just finished: the summary's stats
  make way for the streak, once a day. It sits in the summary's own reserved
  space, so nothing on the page moves, and it is between sentences, where the
  page may move. The flame pops in; with reduced motion it simply appears.
  See CLAUDE.md 10.1 and 14.7.
-->
<div class="flex flex-wrap items-center gap-x-8 gap-y-4">
  <div class="flex items-center gap-3">
    <span in:scale={{ start: 0.6, duration: prefersReducedMotion.current ? 0 : 300 }}>
      <StreakFlame class="size-10" />
    </span>
    <div class="flex flex-col">
      <span class="text-3xl leading-none font-semibold tabular-nums">{streak.current}</span>
      <span class="text-xs text-muted-foreground">{m.streak_day_streak()}</span>
    </div>
  </div>
  <StreakWeek {streak} />
</div>
