<script lang="ts">
  import { Flame } from "@lucide/svelte";
  import { m } from "$lib/paraglide/messages";
  import { streak } from "$lib/stats/streak-state.svelte";

  let value = $derived(streak.value);
  let label = $derived(m.streak_nav_label({ days: String(value?.current ?? 0) }));
</script>

<!--
  The streak, on every page, beside the name: status, not a place to go, and
  on a phone the other side has no room left. Grey until today's sentences are
  read, then lit, and the flame fills in too, so the change is not colour
  alone. Nothing for a reader who has never finished a sentence: a zero there
  is only noise. It changes when a sentence is saved, never while typing.
-->
{#if value !== null && (value.current > 0 || value.today > 0)}
  <a
    href="/stats#streak"
    class={[
      "flex h-11 items-center gap-1 px-1 text-sm font-semibold tabular-nums transition-colors",
      value.isTodayDone ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    ]}
    aria-label={label}
    title={label}
  >
    <Flame class={["size-4", value.isTodayDone && "fill-streak text-streak"]} aria-hidden="true" />
    {value.current}
  </a>
{/if}
