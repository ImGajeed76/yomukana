import type { CardColor } from "$lib/sync/profile-rules";

/**
 * The background class for each card colour. Written out in full, not built
 * from the name, so Tailwind finds every class when it scans the source.
 */
export const CARD_BACKGROUNDS: Readonly<Record<CardColor, string>> = {
  green: "bg-profile-green",
  blue: "bg-profile-blue",
  violet: "bg-profile-violet",
  rose: "bg-profile-rose",
  amber: "bg-profile-amber",
  slate: "bg-profile-slate",
};
