// How the numbers on the stats page read. Kept beside the aggregation so a
// figure and its label cannot drift apart.

import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import { startOfDay } from "../time";

/** "3 minutes ago", in the reader's language, from the largest unit that fits. */
export function timeAgo(at: number, now: number = Date.now()): string {
  const seconds = Math.round((at - now) / 1000);
  // The browser's own phrase for under a minute is "this minute", which reads
  // like a clock rather than like a person.
  if (seconds > -60) return m.common_time_just_now();
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  if (seconds > -3600) return format.format(Math.round(seconds / 60), "minute");
  if (seconds > -86_400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86_400), "day");
}

/** A day key as the reader would say it, like "10 Mar". */
export function dayLabel(date: string): string {
  return startOfDay(date).toLocaleDateString(getLocale(), {
    day: "numeric",
    month: "short",
  });
}
