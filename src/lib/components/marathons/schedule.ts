// A marathon's start and end as the forms check them, in the creator's own
// time zone: the same limits the server holds to, split so a form can say
// which one was missed.

import { m } from "$lib/paraglide/messages";
import { MARATHON_LEAD_MAX_MS, MARATHON_MAX_MS, MARATHON_MIN_MS } from "$lib/sync/marathon-rules";

const HOUR_MS = 3_600_000;

/** The next full hour: a start nobody has to adjust to the minute. */
export function nextFullHour(now: number): number {
  return Math.ceil((now + 1) / HOUR_MS) * HOUR_MS;
}

export type ScheduleProblem = "past" | "order" | "short" | "long" | "far";

/**
 * What is wrong with a start and an end, said the way the reader would put
 * it, or null when they make a marathon. The same limits the server holds
 * to (isValidSchedule), split up so the form can say which one.
 */
export function scheduleProblem(
  startsAt: number,
  endsAt: number,
  now: number,
): ScheduleProblem | null {
  if (startsAt < now - 60_000) return "past";
  if (startsAt > now + MARATHON_LEAD_MAX_MS) return "far";
  if (endsAt <= startsAt) return "order";
  if (endsAt - startsAt < MARATHON_MIN_MS) return "short";
  if (endsAt - startsAt > MARATHON_MAX_MS) return "long";
  return null;
}

const PROBLEM_MESSAGES: Readonly<Record<ScheduleProblem, () => string>> = {
  past: m.marathon_create_error_past,
  order: m.marathon_create_error_order,
  short: m.marathon_create_error_short,
  long: m.marathon_create_error_long,
  far: m.marathon_create_error_far,
};

/** What is wrong with the times, in the reader's words. */
export function scheduleProblemMessage(problem: ScheduleProblem): string {
  return PROBLEM_MESSAGES[problem]();
}
