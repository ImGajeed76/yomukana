// Where the reader stands on every board they are on, from one request. See
// functions/api/boards.ts.

import type { Progress } from "../db";
import { callApi } from "./api";
import type { GroupRole } from "./groups";

/** A place on a board, and how many are on it. */
export interface Standing {
  readonly rank: number;
  readonly size: number;
}

export interface GroupStanding extends Standing {
  readonly id: string;
  readonly name: string;
  readonly role: GroupRole;
}

export interface Standings {
  readonly following: Standing;
  /** Rank null when they are not on the global board. */
  readonly global: { readonly rank: number | null; readonly size: number };
  /** Every group they are in, in the order they joined. */
  readonly groups: readonly GroupStanding[];
}

/** The reader's standings, or null when they could not be fetched. */
export async function loadStandings(): Promise<Standings | null> {
  const response = await callApi("/boards");
  if (response?.ok !== true) return null;
  return (await response.json()) as Standings;
}

/** Where the standings are remembered between visits. See SyncRecord.shown. */
const SHOWN_STANDINGS = "standings";

function isStandings(value: unknown): value is Standings {
  return (
    typeof value === "object" &&
    value !== null &&
    "following" in value &&
    "global" in value &&
    "groups" in value &&
    Array.isArray(value.groups)
  );
}

/** The standings as they were last loaded on this device, to draw at once. */
export async function lastShownStandings(progress: Progress): Promise<Standings | null> {
  const value = await progress.lastShown(SHOWN_STANDINGS);
  return isStandings(value) ? value : null;
}

export function rememberStandings(progress: Progress, standings: Standings): Promise<void> {
  return progress.saveShown(SHOWN_STANDINGS, standings);
}
