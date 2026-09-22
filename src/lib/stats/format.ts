// How the numbers on the stats page read. Kept beside the aggregation so a
// figure and its label cannot drift apart.

import { getLocale } from "../paraglide/runtime";
import { startOfDay } from "../time";

/** A day key as the reader would say it, like "10 Mar". */
export function dayLabel(date: string): string {
  return startOfDay(date).toLocaleDateString(getLocale(), {
    day: "numeric",
    month: "short",
  });
}
