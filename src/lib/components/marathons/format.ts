// How a marathon's times read: when it starts or ends, in the reader's own
// time zone and language, and the countdown through its last day.

import { m } from "$lib/paraglide/messages";
import { getLocale } from "$lib/paraglide/runtime";
import { marathonStatus, resultsAt, type MarathonTimes } from "$lib/sync/marathon-rules";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** "Mon 5 Oct, 09:00", in the reader's language. */
export function formatWhen(at: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** "3:12:05": hours, minutes and seconds left. */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours)}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Whether it is in its last day, when the board counts down by the second. */
export function isFinalDay(marathon: MarathonTimes, now: number): boolean {
  return now >= marathon.endsAt - DAY_MS && now < marathon.endsAt;
}

/** The one line that says where a marathon is: when it starts, ends, or that it is over. */
export function statusLine(
  marathon: MarathonTimes & { readonly resultsDelay: number },
  now: number,
): string {
  switch (marathonStatus(marathon, now)) {
    case "upcoming":
      // In the last hour, minutes: the room is waiting for it now.
      return marathon.startsAt - now <= HOUR_MS
        ? m.marathon_board_status_starts_minutes({
            minutes: String(Math.ceil((marathon.startsAt - now) / 60_000)),
          })
        : m.marathon_board_status_upcoming({ when: formatWhen(marathon.startsAt) });
    case "running":
      return isFinalDay(marathon, now)
        ? m.marathon_board_status_final_hours({ time: formatCountdown(marathon.endsAt - now) })
        : m.marathon_board_status_running({ when: formatWhen(marathon.endsAt) });
    case "counting":
      return m.marathon_board_status_counting({ when: formatWhen(resultsAt(marathon)) });
    case "finished":
      return m.marathon_board_status_finished();
  }
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", DAY_MS],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "in 3 days", "in 2 hours", in the reader's language: the largest unit that fits. */
export function formatFromNow(at: number, now: number): string {
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  const ahead = at - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(ahead) >= size) return format.format(Math.round(ahead / size), unit);
  }
  return format.format(0, "minute");
}

/** A marathon in a list of boards, said short: when it starts or ends, or that it is over. */
export function shortStatus(
  marathon: MarathonTimes & { readonly resultsDelay: number },
  now: number,
): string {
  switch (marathonStatus(marathon, now)) {
    case "upcoming":
      return m.marathon_overview_starts({ when: formatFromNow(marathon.startsAt, now) });
    case "running":
      return m.marathon_overview_ends({ when: formatFromNow(marathon.endsAt, now) });
    case "counting":
    case "finished":
      return m.marathon_overview_over();
  }
}

/**
 * A place as each language says it in a sentence: "2nd" in English, "2" in
 * German, where the sentence carries "Platz", "2位" in Japanese. The messages
 * are written around these.
 */
export function placeWord(place: number): string {
  const locale = getLocale();
  if (locale === "ja") return `${String(place)}位`;
  if (locale === "de") return String(place);
  const suffix: Record<Intl.LDMLPluralRule, string> = {
    one: "st",
    two: "nd",
    few: "rd",
    other: "th",
    zero: "th",
    many: "th",
  };
  return `${String(place)}${suffix[new Intl.PluralRules("en", { type: "ordinal" }).select(place)]}`;
}

/** The classroom screen counts the last minute down, big, before a race starts and ends. */
const COUNTDOWN_MS = 60_000;

/** How long "Go!" or "Finish!" stays after zero before the board comes back. */
const COUNTDOWN_AFTER_MS = 2500;

/** The moment the screen is counting down to right now, or null. */
export function countdownFor(
  marathon: MarathonTimes,
  now: number,
): { readonly at: number; readonly kind: "start" | "end" } | null {
  for (const [at, kind] of [
    [marathon.startsAt, "start"],
    [marathon.endsAt, "end"],
  ] as const) {
    if (now >= at - COUNTDOWN_MS && now < at + COUNTDOWN_AFTER_MS) return { at, kind };
  }
  return null;
}
