<script lang="ts">
  import IceDrop from "./IceDrop.svelte";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import {
    dateOf,
    marksOf,
    readingDay,
    weekdayOf,
    type DayMark,
    type Streak,
  } from "$lib/stats/streak";

  interface Props {
    streak: Streak;
  }

  let { streak }: Props = $props();

  const DAY_MS = 86_400_000;

  const monthName = new Intl.DateTimeFormat(getLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekdayName = new Intl.DateTimeFormat(getLocale(), { weekday: "narrow", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(getLocale(), { dateStyle: "long", timeZone: "UTC" });

  const LABELS: Record<DayMark, (() => string) | null> = {
    done: m.streak_calendar_label_done,
    frozen: m.streak_calendar_label_frozen,
    missed: m.streak_calendar_label_missed,
    today: m.streak_calendar_label_today,
    empty: null,
  };

  /** How many months back from this one is on show. */
  let monthsBack = $state(0);

  let today = $derived(readingDay(Date.now()));
  let mark = $derived(marksOf(streak));
  /** The earliest month there is anything to show in. */
  let firstDay = $derived(streak.days[0]?.day ?? today);
  let monthsAvailable = $derived.by(() => {
    const first = dateOf(firstDay);
    const now = dateOf(today);
    return (
      (now.getUTCFullYear() - first.getUTCFullYear()) * 12 + now.getUTCMonth() - first.getUTCMonth()
    );
  });

  /** The month on show, as its first day and its length. */
  let month = $derived.by(() => {
    const now = dateOf(today);
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1);
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1);
    return { first: start / DAY_MS, length: (end - start) / DAY_MS };
  });

  /**
   * The month as weeks, Monday to Sunday, each day as its day number. The days
   * of the months either side are kept too, unnumbered, so a run that crosses
   * into a month is drawn across the blanks. Always six weeks, the most a month
   * can touch, so the grid is the same height every month and moving to a
   * longer one never shifts it.
   */
  let weeks = $derived.by(() => {
    const monday = month.first - weekdayOf(month.first);
    return Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => monday + row * 7 + column),
    );
  });

  function isInMonth(day: number): boolean {
    return day >= month.first && day < month.first + month.length;
  }

  function isInStreak(day: number): boolean {
    const status = mark(day);
    return status === "done" || status === "frozen";
  }

  /**
   * Whether every day of a week row was read. A week a freeze had to cover
   * kept the streak, but it was not a week read, so it is not drawn as one.
   */
  function isWholeWeek(week: readonly number[]): boolean {
    return week.every((day) => mark(day) === "done");
  }

  /** The runs of streak days in a week row, as first and last column. */
  function runsOf(week: readonly number[]): { from: number; to: number }[] {
    const runs: { from: number; to: number }[] = [];
    for (const [column, day] of week.entries()) {
      if (!isInStreak(day)) continue;
      const last = runs.at(-1);
      if (last?.to === column - 1) last.to = column;
      else runs.push({ from: column, to: column });
    }
    return runs;
  }

  interface Sparkle {
    /** Across the row, as a share of it: always on a gap between two days. */
    left: number;
    isHigh: boolean;
    /** Its own rhythm, in seconds, so the four never blink together. */
    period: number;
    /** How far into that rhythm it starts, so the row is already sparkling when drawn. */
    offset: number;
  }

  /**
   * A whole week's four sparkles, each on a different gap between days. Varied
   * by week, so two full weeks do not twinkle in step.
   */
  function sparklesOf(week: readonly number[]): Sparkle[] {
    const seed = week[0] ?? 0;
    return [0, 2, 5, 1].map((step, index) => ({
      left: (((seed + step) % 6) + 1) / 7,
      isHigh: index % 2 === 0,
      period: 4.5 + ((seed + index) % 3) * 0.7,
      offset: index * 1.3 + (seed % 5) * 0.4,
    }));
  }

  function percent(share: number): string {
    return `${String(share * 100)}%`;
  }
</script>

<!--
  A month at a time, the way a wall calendar is read, drawn the way Duolingo
  draws its streak. A run of streak days is a soft band with the days in
  orange on it. A day a freeze covered is a drop of ice on the band, and today,
  not yet read, a grey one. A week read on all seven days is a solid pill with
  sparkles that come and go: the one reward the calendar gives, so it is kept for that.
  Each kind differs by shape as well as colour, see CLAUDE.md 8.4.
-->
<div class="flex flex-col gap-3">
  <div class="grid grid-cols-[2rem_1fr_2rem] items-center">
    <!-- Only once there is another month to go to. Until then they could only be disabled. -->
    {#if monthsAvailable > 0}
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label={m.streak_calendar_previous()}
        disabled={monthsBack >= monthsAvailable}
        onclick={() => {
          monthsBack += 1;
        }}
      >
        <ChevronLeft class="size-4" />
      </Button>
    {:else}
      <span class="size-8"></span>
    {/if}
    <span class="text-center text-sm font-medium">{monthName.format(dateOf(month.first))}</span>
    {#if monthsAvailable > 0}
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label={m.streak_calendar_next()}
        disabled={monthsBack === 0}
        onclick={() => {
          monthsBack -= 1;
        }}
      >
        <ChevronRight class="size-4" />
      </Button>
    {/if}
  </div>

  <div class="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">
    {#each weeks[0] ?? [] as day (day)}
      <span>{weekdayName.format(dateOf(day))}</span>
    {/each}
  </div>

  <ol class="flex flex-col gap-1.5">
    {#each weeks as week, row (row)}
      {@const isWhole = isWholeWeek(week)}
      <li class="relative grid grid-cols-7">
        {#if isWhole}
          <span
            class="absolute inset-0 rounded-full bg-streak ring-2 ring-streak/25"
            aria-hidden="true"
          ></span>
          {#each sparklesOf(week) as sparkle, index (index)}
            <span
              class={["absolute -translate-x-1/2", sparkle.isHigh ? "top-1" : "bottom-1"]}
              style:left={percent(sparkle.left)}
              aria-hidden="true"
            >
              <span
                class="sparkle block size-1 bg-streak-foreground/70"
                style:animation-duration={`${String(sparkle.period)}s`}
                style:animation-delay={`${String(-sparkle.offset)}s`}
              ></span>
            </span>
          {/each}
        {:else}
          {#each runsOf(week) as run (run.from)}
            <span
              class="absolute inset-y-0 rounded-full bg-streak/12"
              style:left={percent(run.from / 7)}
              style:right={percent((6 - run.to) / 7)}
              aria-hidden="true"
            ></span>
          {/each}
        {/if}
        {#each week as day (day)}
          {#if !isInMonth(day)}
            <span class="h-8"></span>
          {:else}
            {@const status = mark(day)}
            {@const label = LABELS[status]}
            <span
              class={[
                "relative flex h-8 items-center justify-center",
                // Above the next row, so the icicles hang over its band.
                status === "frozen" && "z-10",
              ]}
              aria-label={label === null
                ? fullDate.format(dateOf(day))
                : `${fullDate.format(dateOf(day))}, ${label()}`}
              role="img"
            >
              <span
                class={[
                  "relative flex size-8 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  status === "done" && (isWhole ? "text-streak-foreground" : "text-streak"),
                  status === "today" && "bg-muted text-foreground",
                  (status === "missed" || status === "empty") &&
                    (day > today ? "text-muted-foreground/50" : "text-muted-foreground"),
                ]}
                aria-hidden="true"
              >
                {#if status === "frozen"}
                  <IceDrop class="size-8" />
                {:else}
                  {dateOf(day).getUTCDate()}
                {/if}
              </span>
            </span>
          {/if}
        {/each}
      </li>
    {/each}
  </ol>
</div>

<style>
  /*
   * A sparkle pops in, stays a while, pops out, and stays away a while. Quick
   * both ways, with a little overshoot on the way in, so it twinkles rather
   * than fades. Still for a reader who asks for less motion.
   */
  .sparkle {
    transform: rotate(45deg) scale(0);
    animation-name: sparkle;
    animation-iteration-count: infinite;
  }

  @keyframes sparkle {
    0% {
      transform: rotate(45deg) scale(0);
      animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    6% {
      transform: rotate(45deg) scale(1);
    }
    55% {
      transform: rotate(45deg) scale(1);
      animation-timing-function: ease-in;
    }
    61%,
    100% {
      transform: rotate(45deg) scale(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sparkle {
      animation: none;
      transform: rotate(45deg);
    }
  }
</style>
