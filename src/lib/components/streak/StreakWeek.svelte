<script lang="ts">
  import DayDot from "./DayDot.svelte";
  import { getLocale } from "$lib/paraglide/runtime";
  import { dateOf, readingDay, thisWeek, type Streak } from "$lib/stats/streak";

  interface Props {
    streak: Streak;
  }

  let { streak }: Props = $props();

  const weekday = new Intl.DateTimeFormat(getLocale(), { weekday: "narrow", timeZone: "UTC" });

  let week = $derived(thisWeek(streak, readingDay(Date.now())));
</script>

<!-- This week, Monday to Sunday: a letter over each day's mark. -->
<ol class="flex gap-2">
  {#each week as { day, mark } (day)}
    <li class="flex flex-col items-center gap-1">
      <span class="text-xs text-muted-foreground" aria-hidden="true">
        {weekday.format(dateOf(day))}
      </span>
      <DayDot {mark} class="size-7" />
    </li>
  {/each}
</ol>
