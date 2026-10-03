// What one sentence did to a runner's place: where they are now, whom they
// passed, and whether that is a top-three place just reached. Pure, so the
// rules can be pinned in tests. See marathon-moments.svelte.ts.

/** Places at or above this, newly reached, are worth a popup. */
export const PODIUM = 3;

export interface BoardLine {
  readonly name: string;
  readonly isYou: boolean;
  /** As shown: whole points, the way the board ranks. */
  readonly score: number;
}

export interface PlaceChange {
  readonly place: number;
  /** Whom the sentence passed, nearest first. Empty for the first sentence: passing needs a before. */
  readonly passed: readonly string[];
  /** Who is ahead now, to compare the next sentence with. */
  readonly ahead: ReadonlySet<string>;
  /** Whether this reached a top-three place from below it. */
  readonly isPodium: boolean;
}

/** Null when the reader is not on the board. */
export function placeChange(
  lines: readonly BoardLine[],
  aheadBefore: ReadonlySet<string> | undefined,
): PlaceChange | null {
  const own = lines.find((line) => line.isYou);
  if (own === undefined) return null;
  const others = lines.filter((line) => !line.isYou);
  const ahead = new Set(others.filter((line) => line.score > own.score).map((line) => line.name));
  const place = ahead.size + 1;
  if (aheadBefore === undefined) return { place, passed: [], ahead, isPodium: false };

  // Those ahead before and below now, nearest first: the one just below the
  // reader now is the one they passed last. Drawing level is not passing:
  // equal scores share a place.
  const passed = others
    .filter((line) => aheadBefore.has(line.name) && line.score < own.score)
    .sort((left, right) => right.score - left.score)
    .map((line) => line.name);
  const placeBefore = aheadBefore.size + 1;
  return {
    place,
    passed,
    ahead,
    isPodium: place < placeBefore && place <= PODIUM && others.length > 0,
  };
}
