<script lang="ts">
  import { Flame, Snowflake } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";
  import { m } from "$lib/paraglide/messages";
  import type { DayMark } from "$lib/stats/streak";

  interface Props {
    mark: DayMark;
    class?: ClassValue;
  }

  let { mark, class: className }: Props = $props();

  const LABELS: Partial<Record<DayMark, () => string>> = {
    done: m.streak_calendar_label_done,
    frozen: m.streak_calendar_label_frozen,
    missed: m.streak_calendar_label_missed,
    today: m.streak_calendar_label_today,
  };
</script>

<!--
  One day's mark, the same on the week row, in the popups and in the calendar.
  Each state has its own shape as well as its own colour, so it reads without
  colour too: a filled flame, a snowflake, a ring for today, an empty outline.
  See CLAUDE.md 8.4.
-->
<span
  class={[
    "flex items-center justify-center rounded-full",
    mark === "done" && "bg-streak text-background",
    mark === "frozen" && "bg-freeze/15 text-freeze",
    mark === "today" && "border-2 border-streak",
    (mark === "missed" || mark === "empty") && "border border-border",
    className,
  ]}
  role={LABELS[mark] === undefined ? undefined : "img"}
  aria-label={LABELS[mark]?.()}
>
  {#if mark === "done"}
    <Flame class="size-1/2 fill-current" aria-hidden="true" />
  {:else if mark === "frozen"}
    <Snowflake class="size-1/2" aria-hidden="true" />
  {/if}
</span>
