<script lang="ts">
  import { ChevronLeft, ChevronRight, Snowflake } from "@lucide/svelte";
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

  /** Where a whole week's two sparkles sit: on a gap between days, varied by week. */
  function sparklesOf(week: readonly number[]): { left: number; isHigh: boolean }[] {
    const seed = week[0] ?? 0;
    return [
      { left: ((seed % 3) + 1) / 7, isHigh: true },
      { left: ((seed % 2) + 4) / 7, isHigh: false },
    ];
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
  a sparkle or two: the one reward the calendar gives, so it is kept for that.
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
              class={[
                "absolute size-1 -translate-x-1/2 rotate-45 bg-streak-foreground/90",
                sparkle.isHigh ? "top-1.5" : "bottom-1.5",
              ]}
              style:left={percent(sparkle.left)}
              aria-hidden="true"
            ></span>
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
                  status === "frozen" && "bg-freeze text-streak-foreground ring-2 ring-freeze/35",
                  status === "today" && "bg-muted text-foreground",
                  (status === "missed" || status === "empty") &&
                    (day > today ? "text-muted-foreground/50" : "text-muted-foreground"),
                ]}
                aria-hidden="true"
              >
                {#if status === "frozen"}
                  <!-- Frozen over: a drop of ice, with two icicles hanging off it. -->
                  <Snowflake class="size-4" />
                  <span class="absolute top-full left-2.5 -mt-1 h-2 w-1.5 rounded-b-full bg-freeze"
                  ></span>
                  <span
                    class="absolute top-full left-4.5 -mt-1 h-1.5 w-1.5 rounded-b-full bg-freeze"
                  ></span>
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
