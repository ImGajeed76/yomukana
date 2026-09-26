// What a profile may hold. Shared by the app, which checks as the reader types,
// and the API function, which has the final say. Pure, so both can import it.

/**
 * The colours a profile card may take. Names, not colour values: each one is
 * a pair of theme tokens in layout.css, a shade for light mode and one for
 * dark, so a card reads well in both. Mirrors the check in drizzle/schema.ts.
 */
export const CARD_COLORS = ["green", "blue", "violet", "rose", "amber", "slate"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** A display name is free text in any script, up to this many characters. */
export const DISPLAY_NAME_MAX = 32;

export function isCardColor(value: unknown): value is CardColor {
  return CARD_COLORS.includes(value as CardColor);
}
