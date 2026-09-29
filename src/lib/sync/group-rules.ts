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

/**
 * The letters invite and display codes are made of: none that look alike (no
 * i, l, o, 0, 1), because an invite is sometimes read off a projector and
 * typed by hand.
 */
export const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * An invite is short enough to type, and lasts at most a month: guessing one
 * of 31^8 codes in that time is not a real risk.
 */
export const INVITE_CODE_LENGTH = 8;

/** Where an invite link leads, the code after it. */
export const JOIN_PATH = "/join/";

/**
 * The invite code in what a reader typed or pasted, or null if there is none.
 *
 * Forgiving about everything a person does to a code they copy by hand: capital
 * letters, the space it is shown with, a dash. A whole invite link works too.
 */
export function inviteCodeIn(text: string): string | null {
  const start = text.lastIndexOf(JOIN_PATH);
  const rest = start === -1 ? text : text.slice(start + JOIN_PATH.length);

  let code = "";
  for (const character of rest.toLowerCase()) {
    if (character === " " || character === "-") continue;
    if (!CODE_ALPHABET.includes(character)) return null;
    code += character;
  }
  return code.length === INVITE_CODE_LENGTH ? code : null;
}
