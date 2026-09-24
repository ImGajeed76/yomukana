// Ranking the friends board. Pure, so the rules for ties and for "how far
// behind am I" can be pinned in tests.

/** One line on the board. */
export interface BoardEntry {
  readonly userId: string;
  readonly username: string;
  readonly score: number;
  /** When the score was last sent, in epoch milliseconds. Null if it never was. */
  readonly scoredAt: number | null;
  /** Whether this line is the reader looking at the board. */
  readonly isYou: boolean;
}

export interface RankedEntry extends BoardEntry {
  /** Place on the board. Equal scores share a place, so 1, 1, 3. */
  readonly rank: number;
}

/** Where the reader stands, said as the one number worth chasing. */
export type Standing =
  | { readonly kind: "alone" }
  | { readonly kind: "leading" }
  | { readonly kind: "tied"; readonly username: string }
  | { readonly kind: "behind"; readonly points: number; readonly username: string };

/**
 * The board in order, with the reader's own score as it is now rather than as
 * it was at their last sync.
 *
 * Scores are compared as they are shown, whole numbers, so two people shown
 * with the same score are never ranked apart by a fraction nobody can see.
 * Among equals the reader comes first: it is their board.
 */
export function rankBoard(entries: readonly BoardEntry[], ownScore: number): RankedEntry[] {
  const rounded = entries.map((entry) => ({
    ...entry,
    score: Math.round(entry.isYou ? ownScore : entry.score),
  }));
  rounded.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.isYou) - Number(a.isYou) ||
      a.username.localeCompare(b.username),
  );
  return rounded.map((entry) => ({
    ...entry,
    rank: 1 + rounded.filter((other) => other.score > entry.score).length,
  }));
}

export function standingOf(ranked: readonly RankedEntry[]): Standing {
  const you = ranked.find((entry) => entry.isYou);
  const others = ranked.filter((entry) => !entry.isYou);
  if (you === undefined || others.length === 0) return { kind: "alone" };

  const ahead = others.filter((entry) => entry.score > you.score);
  // The one just above, not the one at the top: the next place is the one
  // within reach.
  const next = ahead.at(-1);
  if (next !== undefined) {
    return { kind: "behind", points: next.score - you.score, username: next.username };
  }
  const level = others.find((entry) => entry.score === you.score);
  return level === undefined ? { kind: "leading" } : { kind: "tied", username: level.username };
}
