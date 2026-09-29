<script lang="ts">
  import { Flame, Snowflake } from "@lucide/svelte";
  import StreakCalendar from "./StreakCalendar.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { m } from "$lib/paraglide/messages";
  import { FREEZES_MAX, type Streak } from "$lib/stats/streak";

  interface Props {
    streak: Streak;
  }

  let { streak }: Props = $props();
</script>

<!--
  The streak beside the score. One row says where it stands: the number, the
  best it has been, and the freezes held as slots, so the limit of two shows
  without being said. How a freeze is earned is the same on every visit, so it
  waits behind the slots until asked for. Below, the calendar of how it came
  about, which takes whatever height the score beside it leaves.
-->
<section id="streak" class="flex h-full flex-col rounded-lg border border-border bg-card">
  <div class="flex items-start justify-between gap-4 p-6">
    <div class="flex items-center gap-3">
      <Flame
        class={[
          "size-10",
          streak.isTodayDone ? "fill-streak text-streak" : "text-muted-foreground",
        ]}
        aria-hidden="true"
      />
      <div class="flex flex-col gap-1">
        <span class="text-5xl leading-none font-semibold tabular-nums">{streak.current}</span>
        <span class="text-xs text-muted-foreground">
          {m.streak_day_streak()} · {m.streak_label_best({ days: String(streak.longest) })}
        </span>
      </div>
    </div>

    <Popover.Root>
      <Popover.Trigger
        class="-m-1 flex gap-1 rounded-full p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={m.streak_label_freezes_held({
          held: String(streak.freezes),
          max: String(FREEZES_MAX),
        })}
      >
        {#each { length: FREEZES_MAX }, index (index)}
          <span
            class={[
              "flex size-8 items-center justify-center rounded-full",
              index < streak.freezes
                ? "bg-freeze/20 text-freeze"
                : "border border-dashed border-border text-muted-foreground/40",
            ]}
          >
            <Snowflake class="size-4" aria-hidden="true" />
          </span>
        {/each}
      </Popover.Trigger>
      <Popover.Content class="w-64 text-sm" align="end">
        {m.streak_stats_hint_freezes()}
      </Popover.Content>
    </Popover.Root>
  </div>

  <div class="flex flex-1 flex-col justify-center border-t border-border p-6">
    <StreakCalendar {streak} />
  </div>
</section>
