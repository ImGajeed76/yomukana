// Achievements, drawn as seals a reader wears on their card like a group
// badge: a kanji, a name, and a look that gets richer the rarer it is.
// Shared by the app, which draws them, and the API function, which
// decides who has earned which. Pure, so both can import it and the rules can
// be pinned in tests.
//
// The function works every seal out from what the server holds: synced
// sentences for the reading ones, final marathon results for the racing ones,
// group joins and follows for the people ones, the account for the rest. Synced sentences are written by the reader's own
// browser, so a reading seal is exactly as trustworthy as the score: fine
// between friends, which is what the card is for.

/** How rare a step is, which sets how much the seal does to show it. */
export type SealTier = 1 | 2 | 3 | 4 | 5;

/**
 * A seal's colours, chosen for what it is for rather than for its tier: fire
 * for streaks, jade to violet for reading, sakura for people who follow you.
 * The tier decides how much happens around them.
 */
export type SealLook =
  | "silver"
  | "jade"
  | "azure"
  | "violet"
  | "crimson"
  | "ember"
  | "sakura"
  | "ice"
  | "gold"
  | "obsidian"
  | "tide"
  | "abyss";

export type SealKind =
  | "streak"
  | "days"
  | "sentences"
  | "perfect"
  | "wins"
  | "podium"
  | "finished"
  | "invited"
  | "followers"
  | "joined"
  | "years";

interface SealStep {
  readonly count: number;
  readonly tier: SealTier;
  /** The character the seal wears, chosen to go with its name. */
  readonly kanji: string;
  readonly look: SealLook;
}

interface SealKindRule {
  readonly kind: SealKind;
  /** Oldest first. A kind with no steps is earned once, by everyone, as 始. */
  readonly steps: readonly SealStep[];
}

/**
 * Every seal there is. The steps run far past what most readers will reach,
 * on purpose: the top of each is for the few who grind, and the list should
 * not need adding to for a long while. Tiers climb with rarity, not with the
 * step's place in its row, so a 365-day streak and 25,000 sentences look as
 * special as each other.
 */
export const SEAL_KINDS: readonly SealKindRule[] = [
  {
    kind: "streak",
    steps: [
      { count: 3, tier: 1, kanji: "点", look: "silver" },
      { count: 7, tier: 1, kanji: "火", look: "ember" },
      { count: 14, tier: 2, kanji: "燃", look: "ember" },
      { count: 30, tier: 2, kanji: "炎", look: "crimson" },
      { count: 60, tier: 3, kanji: "焔", look: "ember" },
      { count: 100, tier: 3, kanji: "燎", look: "crimson" },
      { count: 200, tier: 4, kanji: "煉", look: "crimson" },
      { count: 365, tier: 4, kanji: "恒", look: "gold" },
      { count: 500, tier: 5, kanji: "鳳", look: "ember" },
      { count: 730, tier: 5, kanji: "陽", look: "gold" },
      { count: 1000, tier: 5, kanji: "龍", look: "obsidian" },
    ],
  },
  {
    kind: "days",
    steps: [
      { count: 10, tier: 1, kanji: "常", look: "silver" },
      { count: 30, tier: 2, kanji: "習", look: "ice" },
      { count: 100, tier: 3, kanji: "誠", look: "tide" },
      { count: 365, tier: 4, kanji: "暦", look: "azure" },
      { count: 730, tier: 5, kanji: "史", look: "azure" },
      { count: 1000, tier: 5, kanji: "久", look: "abyss" },
    ],
  },
  {
    kind: "sentences",
    steps: [
      { count: 10, tier: 1, kanji: "頁", look: "silver" },
      { count: 100, tier: 1, kanji: "読", look: "jade" },
      { count: 500, tier: 2, kanji: "虫", look: "jade" },
      { count: 1000, tier: 2, kanji: "書", look: "azure" },
      { count: 2500, tier: 3, kanji: "学", look: "azure" },
      { count: 5000, tier: 3, kanji: "賢", look: "violet" },
      { count: 10000, tier: 4, kanji: "蔵", look: "violet" },
      { count: 25000, tier: 4, kanji: "館", look: "gold" },
      { count: 50000, tier: 5, kanji: "叡", look: "obsidian" },
      { count: 100000, tier: 5, kanji: "極", look: "gold" },
    ],
  },
  {
    kind: "perfect",
    steps: [
      { count: 10, tier: 1, kanji: "清", look: "ice" },
      { count: 100, tier: 2, kanji: "眼", look: "ice" },
      { count: 1000, tier: 3, kanji: "完", look: "azure" },
      { count: 5000, tier: 4, kanji: "匠", look: "violet" },
      { count: 10000, tier: 5, kanji: "璧", look: "jade" },
    ],
  },
  // Marathons. Fewer steps and higher tiers than reading, because a race
  // happens when someone makes one, not whenever the reader likes: ten wins
  // is a long time of racing, and first place starts at rare. Finishing stops
  // at rare: it asks only for showing up, so it never looks like winning.
  {
    kind: "wins",
    steps: [
      { count: 1, tier: 3, kanji: "勝", look: "gold" },
      { count: 3, tier: 4, kanji: "覇", look: "gold" },
      { count: 10, tier: 5, kanji: "王", look: "obsidian" },
    ],
  },
  {
    kind: "podium",
    steps: [
      { count: 1, tier: 2, kanji: "壇", look: "silver" },
      { count: 3, tier: 3, kanji: "誉", look: "azure" },
      { count: 10, tier: 4, kanji: "栄", look: "violet" },
      { count: 25, tier: 5, kanji: "殿", look: "gold" },
    ],
  },
  {
    kind: "finished",
    steps: [
      { count: 1, tier: 1, kanji: "走", look: "jade" },
      { count: 5, tier: 2, kanji: "駆", look: "tide" },
      { count: 10, tier: 3, kanji: "遥", look: "azure" },
    ],
  },
  {
    kind: "invited",
    steps: [
      { count: 1, tier: 1, kanji: "招", look: "silver" },
      { count: 5, tier: 2, kanji: "集", look: "jade" },
      { count: 10, tier: 3, kanji: "募", look: "azure" },
      { count: 25, tier: 4, kanji: "輪", look: "violet" },
      { count: 50, tier: 5, kanji: "灯", look: "ember" },
      { count: 100, tier: 5, kanji: "使", look: "gold" },
    ],
  },
  {
    kind: "followers",
    steps: [
      { count: 1, tier: 1, kanji: "目", look: "sakura" },
      { count: 5, tier: 2, kanji: "顔", look: "sakura" },
      { count: 10, tier: 3, kanji: "愛", look: "sakura" },
      { count: 25, tier: 4, kanji: "星", look: "azure" },
      { count: 50, tier: 5, kanji: "華", look: "violet" },
      { count: 100, tier: 5, kanji: "輝", look: "gold" },
    ],
  },
  { kind: "joined", steps: [] },
  {
    kind: "years",
    steps: [
      { count: 1, tier: 2, kanji: "周", look: "sakura" },
      { count: 2, tier: 3, kanji: "季", look: "jade" },
      { count: 3, tier: 3, kanji: "古", look: "azure" },
      { count: 5, tier: 4, kanji: "長", look: "violet" },
      { count: 10, tier: 5, kanji: "伝", look: "gold" },
    ],
  },
];

/** A seal as it is shown: which one, and what it needs to be drawn. */
export interface Seal {
  readonly id: string;
  readonly kind: SealKind;
  readonly kanji: string;
  /** The step reached, or null for 始, which shows when instead. */
  readonly count: number | null;
  readonly tier: SealTier;
  readonly look: SealLook;
}

const SEPARATOR = "-";

/** 始, beginning: the seal everyone has, for when they joined. */
const JOINED_KANJI = "始";

/** A seal's id, as stored and sent: `streak-30`, or `joined` for the one with no steps. */
export function sealId(kind: SealKind, count: number | null): string {
  return count === null ? kind : `${kind}${SEPARATOR}${String(count)}`;
}

/** The seal an id stands for, or null when it is not one. */
export function sealOf(id: string): Seal | null {
  const [kind, countText, ...rest] = id.split(SEPARATOR);
  if (rest.length > 0) return null;
  const rule = SEAL_KINDS.find((each) => each.kind === kind);
  if (rule === undefined) return null;
  if (countText === undefined) {
    return rule.steps.length === 0
      ? { id, kind: rule.kind, kanji: JOINED_KANJI, count: null, tier: 1, look: "silver" }
      : null;
  }
  const step = rule.steps.find((each) => String(each.count) === countText);
  if (step === undefined) return null;
  const { kanji, tier, look } = step;
  return { id, kind: rule.kind, kanji, count: step.count, tier, look };
}

export function isSealId(id: string): boolean {
  return sealOf(id) !== null;
}

/** What the server knows about a reader, which is all a seal is earned from. */
export interface SealFacts {
  /** The longest streak in their synced history, in days. */
  readonly longestStreak: number;
  /** Days on which they reached the day's goal, in a row or not. */
  readonly daysRead: number;
  readonly sentences: number;
  /** Sentences finished without a single wrong key. */
  readonly perfectSentences: number;
  /**
   * Marathons won, and finished in the top three, counting only marathons
   * with PODIUM_MIN_RUNNERS who really ran. Ties share the place.
   */
  readonly marathonWins: number;
  readonly marathonPodiums: number;
  /** Marathons with final results in which they read MARATHON_MIN_SENTENCES. */
  readonly marathonsFinished: number;
  /** People who joined groups they run. */
  readonly invited: number;
  readonly followers: number;
  /** When the account was made, in epoch milliseconds. */
  readonly joinedAt: number;
  readonly now: number;
}

/** Whole years from one moment to another, by the calendar. */
export function fullYearsBetween(from: number, to: number): number {
  const start = new Date(from);
  const end = new Date(to);
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const isBeforeAnniversary =
    end.getUTCMonth() < start.getUTCMonth() ||
    (end.getUTCMonth() === start.getUTCMonth() && end.getUTCDate() < start.getUTCDate());
  if (isBeforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/** Every seal these facts have earned, by id. */
export function sealsEarned(facts: SealFacts): string[] {
  const reached: Record<SealKind, number> = {
    streak: facts.longestStreak,
    days: facts.daysRead,
    sentences: facts.sentences,
    perfect: facts.perfectSentences,
    wins: facts.marathonWins,
    podium: facts.marathonPodiums,
    finished: facts.marathonsFinished,
    invited: facts.invited,
    followers: facts.followers,
    joined: 0,
    years: fullYearsBetween(facts.joinedAt, facts.now),
  };
  const earned: string[] = [];
  for (const rule of SEAL_KINDS) {
    if (rule.steps.length === 0) {
      earned.push(sealId(rule.kind, null));
      continue;
    }
    for (const step of rule.steps) {
      if (reached[rule.kind] >= step.count) earned.push(sealId(rule.kind, step.count));
    }
  }
  return earned;
}

/** Every seal there is, for the preview of all of them. */
export function allSeals(): Seal[] {
  const seals: Seal[] = [];
  for (const rule of SEAL_KINDS) {
    const counts = rule.steps.length === 0 ? [null] : rule.steps.map((step) => step.count);
    for (const count of counts) {
      const seal = sealOf(sealId(rule.kind, count));
      if (seal !== null) seals.push(seal);
    }
  }
  return seals;
}

/**
 * The fastest a person types, in milliseconds a key. A synced sentence typed
 * faster than this, or finished in the future, was written by a script
 * rather than read, and counts towards nothing. The one thing about a
 * history the server can still catch; the function checks it in SQL.
 */
export const FASTEST_KEY_MS = 40;

/** A seal as worn: which one, and when it was earned, which 始 is named for. */
export interface WornSeal {
  readonly seal: string;
  /** In epoch milliseconds. */
  readonly earnedAt: number;
}
