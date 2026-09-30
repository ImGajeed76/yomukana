// What a seal is called and what it means, in the reader's language. The
// names live in messages/, like every other word the app shows; this only
// finds the right one for a seal.

import { m } from "$lib/paraglide/messages";
import { getLocale } from "$lib/paraglide/runtime";
import type { Seal, SealKind, SealTier } from "$lib/sync/seal-rules";

const NAMES: Readonly<Record<string, (inputs: { year: string }) => string>> = {
  "streak-3": m.seal_name_streak_3,
  "streak-7": m.seal_name_streak_7,
  "streak-14": m.seal_name_streak_14,
  "streak-30": m.seal_name_streak_30,
  "streak-60": m.seal_name_streak_60,
  "streak-100": m.seal_name_streak_100,
  "streak-200": m.seal_name_streak_200,
  "streak-365": m.seal_name_streak_365,
  "streak-500": m.seal_name_streak_500,
  "streak-730": m.seal_name_streak_730,
  "streak-1000": m.seal_name_streak_1000,
  "days-10": m.seal_name_days_10,
  "days-30": m.seal_name_days_30,
  "days-100": m.seal_name_days_100,
  "days-365": m.seal_name_days_365,
  "days-730": m.seal_name_days_730,
  "days-1000": m.seal_name_days_1000,
  "sentences-10": m.seal_name_sentences_10,
  "sentences-100": m.seal_name_sentences_100,
  "sentences-500": m.seal_name_sentences_500,
  "sentences-1000": m.seal_name_sentences_1000,
  "sentences-2500": m.seal_name_sentences_2500,
  "sentences-5000": m.seal_name_sentences_5000,
  "sentences-10000": m.seal_name_sentences_10000,
  "sentences-25000": m.seal_name_sentences_25000,
  "sentences-50000": m.seal_name_sentences_50000,
  "sentences-100000": m.seal_name_sentences_100000,
  "perfect-10": m.seal_name_perfect_10,
  "perfect-100": m.seal_name_perfect_100,
  "perfect-1000": m.seal_name_perfect_1000,
  "perfect-5000": m.seal_name_perfect_5000,
  "perfect-10000": m.seal_name_perfect_10000,
  "invited-1": m.seal_name_invited_1,
  "invited-5": m.seal_name_invited_5,
  "invited-10": m.seal_name_invited_10,
  "invited-25": m.seal_name_invited_25,
  "invited-50": m.seal_name_invited_50,
  "invited-100": m.seal_name_invited_100,
  "followers-1": m.seal_name_followers_1,
  "followers-5": m.seal_name_followers_5,
  "followers-10": m.seal_name_followers_10,
  "followers-25": m.seal_name_followers_25,
  "followers-50": m.seal_name_followers_50,
  "followers-100": m.seal_name_followers_100,
  "years-1": m.seal_name_years_1,
  "years-2": m.seal_name_years_2,
  "years-3": m.seal_name_years_3,
  "years-5": m.seal_name_years_5,
  "years-10": m.seal_name_years_10,
  joined: m.seal_name_joined,
};

function yearOf(earnedAt: number | null): string {
  return earnedAt === null ? "" : String(new Date(earnedAt).getFullYear());
}

/** The seal's name. 始 needs when it was earned, which is when the reader joined. */
export function sealName(seal: Seal, earnedAt: number | null): string {
  return NAMES[seal.id]?.({ year: yearOf(earnedAt) }) ?? "";
}

/** What earned it, in a line, for hovering over it. */
export function sealMeaning(seal: Seal, earnedAt: number | null): string {
  const count = new Intl.NumberFormat(getLocale()).format(seal.count ?? 0);
  switch (seal.kind) {
    case "streak":
      return m.seal_meaning_streak({ count });
    case "days":
      return m.seal_meaning_days({ count });
    case "sentences":
      return m.seal_meaning_sentences({ count });
    case "perfect":
      return m.seal_meaning_perfect({ count });
    case "invited":
      return seal.count === 1 ? m.seal_meaning_invited_one() : m.seal_meaning_invited({ count });
    case "followers":
      return seal.count === 1
        ? m.seal_meaning_followers_one()
        : m.seal_meaning_followers({ count });
    case "years":
      return seal.count === 1 ? m.seal_meaning_years_one() : m.seal_meaning_years({ count });
    case "joined": {
      const month =
        earnedAt === null
          ? ""
          : new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" }).format(
              earnedAt,
            );
      return m.seal_meaning_joined({ month });
    }
  }
}

const LINES: Readonly<Record<string, (inputs: { month: string }) => string>> = {
  "streak-3": m.seal_poem_streak_3,
  "streak-7": m.seal_poem_streak_7,
  "streak-14": m.seal_poem_streak_14,
  "streak-30": m.seal_poem_streak_30,
  "streak-60": m.seal_poem_streak_60,
  "streak-100": m.seal_poem_streak_100,
  "streak-200": m.seal_poem_streak_200,
  "streak-365": m.seal_poem_streak_365,
  "streak-500": m.seal_poem_streak_500,
  "streak-730": m.seal_poem_streak_730,
  "streak-1000": m.seal_poem_streak_1000,
  "days-10": m.seal_poem_days_10,
  "days-30": m.seal_poem_days_30,
  "days-100": m.seal_poem_days_100,
  "days-365": m.seal_poem_days_365,
  "days-730": m.seal_poem_days_730,
  "days-1000": m.seal_poem_days_1000,
  "sentences-10": m.seal_poem_sentences_10,
  "sentences-100": m.seal_poem_sentences_100,
  "sentences-500": m.seal_poem_sentences_500,
  "sentences-1000": m.seal_poem_sentences_1000,
  "sentences-2500": m.seal_poem_sentences_2500,
  "sentences-5000": m.seal_poem_sentences_5000,
  "sentences-10000": m.seal_poem_sentences_10000,
  "sentences-25000": m.seal_poem_sentences_25000,
  "sentences-50000": m.seal_poem_sentences_50000,
  "sentences-100000": m.seal_poem_sentences_100000,
  "perfect-10": m.seal_poem_perfect_10,
  "perfect-100": m.seal_poem_perfect_100,
  "perfect-1000": m.seal_poem_perfect_1000,
  "perfect-5000": m.seal_poem_perfect_5000,
  "perfect-10000": m.seal_poem_perfect_10000,
  "invited-1": m.seal_poem_invited_1,
  "invited-5": m.seal_poem_invited_5,
  "invited-10": m.seal_poem_invited_10,
  "invited-25": m.seal_poem_invited_25,
  "invited-50": m.seal_poem_invited_50,
  "invited-100": m.seal_poem_invited_100,
  "followers-1": m.seal_poem_followers_1,
  "followers-5": m.seal_poem_followers_5,
  "followers-10": m.seal_poem_followers_10,
  "followers-25": m.seal_poem_followers_25,
  "followers-50": m.seal_poem_followers_50,
  "followers-100": m.seal_poem_followers_100,
  "years-1": m.seal_poem_years_1,
  "years-2": m.seal_poem_years_2,
  "years-3": m.seal_poem_years_3,
  "years-5": m.seal_poem_years_5,
  "years-10": m.seal_poem_years_10,
  joined: m.seal_poem_joined,
};

function monthOf(earnedAt: number | null): string {
  return earnedAt === null
    ? ""
    : new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" }).format(earnedAt);
}

/** The line written for this step, a little poem in the reader's language. */
export function sealLine(seal: Seal, earnedAt: number | null): string {
  return LINES[seal.id]?.({ month: monthOf(earnedAt) }) ?? "";
}

const MOTTOS: Readonly<Record<SealKind, () => string>> = {
  streak: m.seal_motto_streak,
  days: m.seal_motto_days,
  sentences: m.seal_motto_sentences,
  perfect: m.seal_motto_perfect,
  invited: m.seal_motto_invited,
  followers: m.seal_motto_followers,
  years: m.seal_motto_years,
  joined: m.seal_motto_joined,
};

/** Three words for what a kind of seal is about, shown under its name on the banner. */
export function sealMotto(seal: Seal): string {
  return MOTTOS[seal.kind]();
}

const CLASSICS: Readonly<Record<SealKind, () => string>> = {
  streak: m.seal_classic_streak,
  days: m.seal_classic_days,
  sentences: m.seal_classic_sentences,
  perfect: m.seal_classic_perfect,
  invited: m.seal_classic_invited,
  followers: m.seal_classic_followers,
  years: m.seal_classic_years,
  joined: m.seal_classic_joined,
};

/** What the classical poem for this kind of seal says, in the reader's language. */
export function sealClassic(seal: Seal): string {
  return CLASSICS[seal.kind]();
}

const TIERS: Readonly<Record<SealTier, () => string>> = {
  1: m.seal_tier_1,
  2: m.seal_tier_2,
  3: m.seal_tier_3,
  4: m.seal_tier_4,
  5: m.seal_tier_5,
};

/** How rare it is, in a word: common to legendary. */
export function sealTierName(seal: Seal): string {
  return TIERS[seal.tier]();
}
