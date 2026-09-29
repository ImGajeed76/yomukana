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

  /** The month as weeks, Monday first. Null for the blanks before the 1st and after the last. */
  let weeks = $derived.by(() => {
    const cells: (number | null)[] = [
      ...Array.from({ length: weekdayOf(month.first) }, () => null),
      ...Array.from({ length: month.length }, (_, index) => month.first + index),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  });

  /**
   * Whether every day of a week row was read. A week a freeze had to cover
   * kept the streak, but it was not a week read, so it is not drawn as one.
   */
  function isWholeWeek(week: readonly (number | null)[]): boolean {
    return week.every((day) => day !== null && mark(day) === "done");
  }
</script>

<!--
  A month at a time, the way a wall calendar is read. Each day says how it went
  on its own: a day read is an orange circle, a day a freeze covered is a blue
  one with a snowflake, today not yet read is a ring. Shape as well as colour,
  see CLAUDE.md 8.4. A week read on all seven days is joined by a band behind
  it, the one reward the calendar gives, so it is kept for that alone.
-->
<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-sm font-medium">{monthName.format(dateOf(month.first))}</span>
    <!-- Only once there is another month to go to. Until then they could only be disabled. -->
    {#if monthsAvailable > 0}
      <div class="-mr-2 flex">
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
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">
    {#each weeks[0] ?? [] as _, index (index)}
      <span>{weekdayName.format(dateOf(month.first - weekdayOf(month.first) + index))}</span>
    {/each}
  </div>

  <ol class="flex flex-col gap-1">
    {#each weeks as week, row (row)}
      {@const isWhole = isWholeWeek(week)}
      <li class="grid grid-cols-7">
        {#each week as day, column (column)}
          {#if day === null}
            <span></span>
          {:else}
            {@const status = mark(day)}
            {@const label = LABELS[status]}
            <span
              class="relative flex h-8 items-center justify-center"
              aria-label={label === null
                ? fullDate.format(dateOf(day))
                : `${fullDate.format(dateOf(day))}, ${label()}`}
              role="img"
            >
              {#if isWhole}
                <!-- The band from Monday's centre to Sunday's, so it ends round with them. -->
                <span
                  class={[
                    "absolute inset-y-0 bg-streak/25",
                    column === 0 ? "left-1/2 -ml-4 rounded-l-full" : "left-0",
                    column === 6 ? "right-1/2 -mr-4 rounded-r-full" : "right-0",
                  ]}
                ></span>
              {/if}
              <span
                class={[
                  "relative flex size-8 items-center justify-center rounded-full text-xs tabular-nums",
                  status === "done" && "bg-streak font-semibold text-background",
                  status === "frozen" && "bg-freeze text-background",
                  status === "today" && "border-2 border-streak font-semibold",
                  (status === "missed" || status === "empty") &&
                    (day > today ? "text-muted-foreground/50" : "text-muted-foreground"),
                ]}
                aria-hidden="true"
              >
                {#if status === "frozen"}
                  <Snowflake class="size-4" />
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
