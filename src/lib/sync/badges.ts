// The group badges a reader can wear, and choosing which. Through the API
// function, which holds the rules. See functions/api/badges.ts.

import { callApi } from "./api";
import type { Badge } from "./badge-rules";

/** A badge the reader could wear: one of their groups has it. */
export interface OwnBadge {
  readonly groupId: string;
  /** Shown to them only, so they know which badge is which group's. */
  readonly groupName: string;
  readonly badge: Badge;
  /** Where it sits among the ones they wear, from 0, or null when they do not wear it. */
  readonly position: number | null;
}

/** Every badge the reader could wear, or null when the server could not be reached. */
export async function loadOwnBadges(): Promise<OwnBadge[] | null> {
  const response = await callApi("/badges");
  if (response?.ok !== true) return null;
  return (await response.json()) as OwnBadge[];
}

/** Wears these groups' badges, in this order. Whether it was saved. */
export async function wearBadges(groupIds: readonly string[]): Promise<boolean> {
  const response = await callApi("/badges", {
    method: "PUT",
    body: JSON.stringify({ groupIds }),
  });
  return response?.ok === true;
}
