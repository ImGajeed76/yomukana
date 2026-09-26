// What a group may hold. Shared by the app, which checks as the reader types,
// and the API function, which has the final say. Pure, so both can import it.

/** A group's name is free text in any script, up to this many characters. */
export const GROUP_NAME_MAX = 40;

/**
 * How long an invite link may last, in days. An invite that never ends is a
 * link that is still in an old chat a year later, so every one ends.
 */
export const INVITE_DAYS = [1, 7, 30] as const;
export type InviteDays = (typeof INVITE_DAYS)[number];

/** How long a new group's first invite lasts. A week covers a class that meets weekly. */
export const DEFAULT_INVITE_DAYS: InviteDays = 7;

/**
 * The most members a group may have. Room for a whole school, and a bound on
 * how large one board read can get.
 */
export const GROUP_MEMBERS_MAX = 1000;

/** The most groups one reader may be in, so a leaderboard page stays a page. */
export const GROUPS_PER_READER_MAX = 50;

export function isInviteDays(value: unknown): value is InviteDays {
  return INVITE_DAYS.includes(value as InviteDays);
}
