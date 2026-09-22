import type { DailyLatency } from "../srs";
import { dayKey } from "../time";

// Turning timestamped readings into one point per day.
//
// Every chart in the app is a day series: a chart with a point per sentence
// tells the reader how many sentences they read, not how they are doing over a
// month. The carrying rule lives here once rather than in each chart.

/**
 * How long a reading stands in for the days after it.
 *
 * A reader who takes a week off has not lost what they know, so a line holds
 * rather than falling to the floor. Past this it stops being a reading of them
 * and starts being a guess, so it drops.
 */
export const CARRY_FORWARD_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export interface DailyPoint {
  /** The day, as a local YYYY-MM-DD. */
  readonly date: string;
  readonly value: number;
}

/**
 * One point for each of the last `days` days, oldest first.
 *
 * A day with no reading repeats the last one known, up to
 * {@link CARRY_FORWARD_DAYS}. Days before the first reading are zero, which is
 * not a gap in the data, it is what was true.
 */
export function carryForward(
  byDay: ReadonlyMap<string, number>,
  days: number,
  now: Date,
): DailyPoint[] {
  const series: DailyPoint[] = [];
  let carried: number | null = null;
  let carriedFor = 0;

  for (let back = days - 1; back >= 0; back--) {
    const date = dayKey(new Date(now.getTime() - back * MS_PER_DAY));
    const recorded = byDay.get(date);

    if (recorded !== undefined) {
      carried = recorded;
      carriedFor = 0;
    } else if (carried !== null) {
      carriedFor += 1;
      if (carriedFor > CARRY_FORWARD_DAYS) carried = null;
    }

    series.push({ date, value: carried ?? 0 });
  }
  return series;
}

/**
 * Recognition time by day, oldest first.
 *
 * Days before the first read are dropped rather than drawn as zero. On a score
 * chart a leading zero is true, because the reader had no score. Here it would
 * claim they recognised the character instantly before they had ever seen it.
 */
export function dailyLatencies(
  history: readonly DailyLatency[],
  days: number,
  now: Date,
): DailyPoint[] {
  const byDay = new Map<string, number>();
  for (const entry of history) byDay.set(entry.day, entry.latencyMs);

  const series = carryForward(byDay, days, now);
  const first = series.findIndex((point) => point.value > 0);
  return first === -1 ? [] : series.slice(first);
}
