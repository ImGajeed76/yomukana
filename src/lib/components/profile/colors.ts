import { m } from "$lib/paraglide/messages";
import type { CardColor } from "$lib/sync/profile-rules";

// Every class below is written out in full, not built from the colour's name,
// so Tailwind finds each one when it scans the source.

/** The background class for each card colour: a solid banner under white text. */
export const CARD_BACKGROUNDS: Readonly<Record<CardColor, string>> = {
  rose: "bg-profile-rose",
  orange: "bg-profile-orange",
  amber: "bg-profile-amber",
  lime: "bg-profile-lime",
  green: "bg-profile-green",
  teal: "bg-profile-teal",
  cyan: "bg-profile-cyan",
  blue: "bg-profile-blue",
  indigo: "bg-profile-indigo",
  violet: "bg-profile-violet",
  pink: "bg-profile-pink",
  slate: "bg-profile-slate",
};

/**
 * The classes for a badge in each colour: a pill, not a banner. A faint tint
 * of the colour, the text and a thin outline in it at full strength. The
 * badge tokens are deep in light mode and light in dark mode, so the same
 * classes read in both.
 */
export const BADGE_STYLES: Readonly<Record<CardColor, string>> = {
  rose: "bg-badge-rose/12 text-badge-rose ring-badge-rose/40",
  orange: "bg-badge-orange/12 text-badge-orange ring-badge-orange/40",
  amber: "bg-badge-amber/12 text-badge-amber ring-badge-amber/40",
  lime: "bg-badge-lime/12 text-badge-lime ring-badge-lime/40",
  green: "bg-badge-green/12 text-badge-green ring-badge-green/40",
  teal: "bg-badge-teal/12 text-badge-teal ring-badge-teal/40",
  cyan: "bg-badge-cyan/12 text-badge-cyan ring-badge-cyan/40",
  blue: "bg-badge-blue/12 text-badge-blue ring-badge-blue/40",
  indigo: "bg-badge-indigo/12 text-badge-indigo ring-badge-indigo/40",
  violet: "bg-badge-violet/12 text-badge-violet ring-badge-violet/40",
  pink: "bg-badge-pink/12 text-badge-pink ring-badge-pink/40",
  slate: "bg-badge-slate/12 text-badge-slate ring-badge-slate/40",
};

/**
 * A badge colour's swatch: the colour solid, where the badge itself only tints
 * with it. Twelve faint tints side by side are too alike to choose between.
 */
export const BADGE_SWATCHES: Readonly<Record<CardColor, string>> = {
  rose: "bg-badge-rose",
  orange: "bg-badge-orange",
  amber: "bg-badge-amber",
  lime: "bg-badge-lime",
  green: "bg-badge-green",
  teal: "bg-badge-teal",
  cyan: "bg-badge-cyan",
  blue: "bg-badge-blue",
  indigo: "bg-badge-indigo",
  violet: "bg-badge-violet",
  pink: "bg-badge-pink",
  slate: "bg-badge-slate",
};

/** What each colour is called, for the screen reader on a colour swatch. */
export const COLOR_NAMES: Readonly<Record<CardColor, () => string>> = {
  rose: m.settings_profile_color_rose,
  orange: m.settings_profile_color_orange,
  amber: m.settings_profile_color_amber,
  lime: m.settings_profile_color_lime,
  green: m.settings_profile_color_green,
  teal: m.settings_profile_color_teal,
  cyan: m.settings_profile_color_cyan,
  blue: m.settings_profile_color_blue,
  indigo: m.settings_profile_color_indigo,
  violet: m.settings_profile_color_violet,
  pink: m.settings_profile_color_pink,
  slate: m.settings_profile_color_slate,
};
