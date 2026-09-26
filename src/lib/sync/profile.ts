// The reader's profile: the name, display name, card colour and visibility
// other readers see. Read and written through the API function, which checks
// every name before it is stored. See functions/api/index.ts.

import { callApi, callApiSignedOut } from "./api";
import type { Progress } from "../db";
import { isCardColor, type CardColor } from "./profile-rules";

export interface Profile {
  readonly username: string;
  readonly displayName: string | null;
  readonly cardColor: CardColor;
  /** Whether they are on the global leaderboard. */
  readonly isListed: boolean;
  readonly score: number;
  /** When the score was last sent, in epoch milliseconds. */
  readonly scoredAt: number | null;
}

/** A profile at /@username, and how the visitor stands to it. */
export type ProfileView = Profile & { readonly isYou: boolean; readonly isFollowed: boolean };

/** Why a change to the profile was not saved, in terms the reader can act on. */
export type ProfileProblem = "invalid" | "offensive" | "taken" | "offline" | "unknown";

export type ProfileChanges = Partial<
  Pick<Profile, "username" | "displayName" | "cardColor" | "isListed">
>;

async function problemOf(response: Response): Promise<ProfileProblem> {
  const body: unknown = await response.json().catch(() => null);
  const problem =
    typeof body === "object" && body !== null && "problem" in body ? body.problem : null;
  return problem === "invalid" || problem === "offensive" || problem === "taken"
    ? problem
    : "unknown";
}

/**
 * The reader's own profile, made with a random name if they have none yet.
 * Null when the function could not be reached, or nobody is signed in.
 */
export async function ensureProfile(): Promise<Profile | null> {
  const response = await callApi("/profile/ensure", { method: "POST" });
  if (!response?.ok) return null;
  return (await response.json()) as Profile;
}

/** Saves changes to the reader's profile. The saved profile, or why it was refused. */
export async function updateProfile(
  changes: ProfileChanges,
): Promise<{ profile: Profile } | { problem: ProfileProblem }> {
  const response = await callApi("/profile", { method: "PATCH", body: JSON.stringify(changes) });
  if (response === null) return { problem: "offline" };
  if (!response.ok) return { problem: await problemOf(response) };
  return { profile: (await response.json()) as Profile };
}

async function viewOf(response: Response | null): Promise<ProfileView | "missing" | null> {
  if (response === null) return null;
  if (response.status === 404) return "missing";
  if (!response.ok) return null;
  return (await response.json()) as ProfileView;
}

/**
 * A profile, asked for as the signed-in reader so it says whether they follow
 * it. "missing" when nobody has that name, null
 * when the function could not be reached.
 */
export function viewProfile(username: string): Promise<ProfileView | "missing" | null> {
  return callApi(`/u/${encodeURIComponent(username)}`).then(viewOf);
}

/** A profile, asked for by someone who is not signed in. See viewProfile. */
export function viewProfileSignedOut(username: string): Promise<ProfileView | "missing" | null> {
  return callApiSignedOut(`/u/${encodeURIComponent(username)}`).then(viewOf);
}

/** Where the reader's own profile is remembered between visits. See SyncRecord.shown. */
const SHOWN_PROFILE = "profile";

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.username === "string" &&
    typeof profile.score === "number" &&
    isCardColor(profile.cardColor)
  );
}

/**
 * The reader's profile as it was last loaded on this device, to draw at once
 * while the server is asked. Null the first time, or if what was kept is not
 * a profile any more.
 */
export async function lastShownProfile(progress: Progress): Promise<Profile | null> {
  const value = await progress.lastShown(SHOWN_PROFILE);
  return isProfile(value) ? value : null;
}

export function rememberProfile(progress: Progress, profile: Profile): Promise<void> {
  return progress.saveShown(SHOWN_PROFILE, profile);
}

/**
 * The reader's own profile, for the pages that show it: the kept copy at
 * once if there is one, then the server's, which is kept for next time.
 * Returns whether the server answered.
 */
export async function showOwnProfile(
  progress: Progress,
  show: (profile: Profile) => void,
): Promise<boolean> {
  const kept = await lastShownProfile(progress);
  if (kept !== null) show(kept);
  const fresh = await ensureProfile();
  if (fresh === null) return false;
  show(fresh);
  await rememberProfile(progress, fresh);
  return true;
}
