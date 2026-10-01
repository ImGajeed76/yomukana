// When to ask a reader to sign up or to install the app, and remembering
// what they said. Both are asks, so both back off: "not now" waits until the
// next reading day, and "don't show again" is kept for good. Kept in
// localStorage, on this device only, because it is about this device: a
// reader who installed on their phone may still want asking on their laptop.

import { dayStart, readingDay } from "$lib/stats/streak";

export type PromptKind = "sign-up" | "install";

interface PromptRecord {
  /** Not before this, in epoch milliseconds. */
  readonly snoozedUntil?: number;
  readonly isDismissed?: boolean;
}

/**
 * Sentences read before the sign-up ask. Enough that the reader has felt
 * what the app does and has something to lose, few enough to be early: past
 * the first streak popup at five, inside the first sitting.
 */
export const SIGN_UP_AFTER_SENTENCES = 10;

/** Reading days before the install ask: never on the first, see CLAUDE.md. */
export const INSTALL_AFTER_DAYS = 2;

function keyOf(kind: PromptKind): string {
  return `yomukana:prompt:${kind}`;
}

function recordOf(kind: PromptKind): PromptRecord {
  // localStorage throws in some private windows and when site data is
  // blocked. Asking then would only ask again next time, so it reads as asked.
  try {
    const raw = localStorage.getItem(keyOf(kind));
    return raw === null ? {} : (JSON.parse(raw) as PromptRecord);
  } catch {
    return { isDismissed: true };
  }
}

function save(kind: PromptKind, record: PromptRecord): void {
  // As above: nowhere to keep it is the same as not keeping it.
  try {
    localStorage.setItem(keyOf(kind), JSON.stringify(record));
  } catch {
    // Nothing to do.
  }
}

/** Whether this ask may show now, as far as what the reader said before goes. */
export function isPromptDue(kind: PromptKind, now: number): boolean {
  const record = recordOf(kind);
  if (record.isDismissed === true) return false;
  return (record.snoozedUntil ?? 0) <= now;
}

/** "Not now": ask again on the next reading day. */
export function snoozePrompt(kind: PromptKind, now: number): void {
  save(kind, { snoozedUntil: dayStart(readingDay(now) + 1) });
}

/** "Don't show again", or done with: signed up, installed. */
export function dismissPrompt(kind: PromptKind): void {
  save(kind, { isDismissed: true });
}

/**
 * `?prompt=sign-up` or `?prompt=install` in dev: show that ask at once,
 * whatever was said before, for looking at it. Null otherwise.
 */
export function forcedPrompt(url: URL): PromptKind | null {
  if (!import.meta.env.DEV) return null;
  const asked = url.searchParams.get("prompt");
  return asked === "sign-up" || asked === "install" ? asked : null;
}
