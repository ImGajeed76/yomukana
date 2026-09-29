<script lang="ts">
  import IceDrop from "./IceDrop.svelte";
  import { m } from "$lib/paraglide/messages";
  import { DAY_GOAL, FREEZE_EARNED_AT, FREEZES_MAX, type Streak } from "$lib/stats/streak";

  interface Props {
    streak: Streak;
  }

  let { streak }: Props = $props();

  /** Once today counts, the next thing to reach for, while there is room for it. */
  let isChasingFreeze = $derived(streak.isTodayDone && streak.freezes < FREEZES_MAX);
</script>

<!--
  Today's progress, one stat among the summary's others, so it costs the
  typing screen nothing. Until the goal, a dot per sentence. After it, the
  count towards a freeze while a slot is free, and nothing once both are held.
-->
{#if !streak.isTodayDone}
  <div class="flex flex-col gap-1">
    <dt class="text-xs text-muted-foreground">{m.streak_label_today()}</dt>
    <dd class="flex h-8 items-center gap-1.5" aria-label="{streak.today} / {DAY_GOAL}">
      {#each { length: DAY_GOAL }, index (index)}
        <span
          class={[
            "size-2.5 rounded-full",
            index < streak.today ? "bg-streak" : "border border-muted-foreground/40",
          ]}
        ></span>
      {/each}
    </dd>
  </div>
{:else if isChasingFreeze}
  <div class="flex flex-col gap-1">
    <dt class="text-xs text-muted-foreground">{m.streak_label_next_freeze()}</dt>
    <dd class="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
      <IceDrop class="size-5" />
      {streak.today}<span class="text-base font-normal text-muted-foreground"
        >/ {FREEZE_EARNED_AT}</span
      >
    </dd>
  </div>
{/if}
