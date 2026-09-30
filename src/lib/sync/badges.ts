// What a reader can wear on their card, group badges and earned seals, and
// choosing which. Through the API function, which holds the rules. See
// functions/api/badges.ts.

import { callApi } from "./api";
import type { Badge } from "./badge-rules";

/** A badge the reader could wear: one of their groups has it. */
export interface OwnBadge {
  readonly groupId: string;
  /** Shown to them only, so they know which badge is which group's. */
  readonly groupName: string;
  readonly badge: Badge;
  /** Where it sits among the things they wear, from 0, or null when they do not wear it. */
  readonly position: number | null;
}

/** A seal the reader has earned, and so could wear. */
export interface OwnSeal {
  readonly seal: string;
  /** In epoch milliseconds. */
  readonly earnedAt: number;
  /** Where it sits among the things they wear, from 0, or null when they do not wear it. */
  readonly position: number | null;
}

export interface Wearables {
  readonly badges: readonly OwnBadge[];
  readonly seals: readonly OwnSeal[];
}

/** Everything the reader could wear, or null when the server could not be reached. */
export async function loadWearables(): Promise<Wearables | null> {
  const response = await callApi("/wearables");
  if (response?.ok !== true) return null;
  return (await response.json()) as Wearables;
}

/**
 * Wears these, in this order: group ids for badges and seal ids for seals,
 * mixed as the reader chose. Whether it was saved.
 */
export async function wearBadges(worn: readonly string[]): Promise<boolean> {
  const response = await callApi("/badges", {
    method: "PUT",
    body: JSON.stringify({ worn }),
  });
  return response?.ok === true;
}
