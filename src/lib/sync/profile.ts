// The reader's profile: the name, display name, card colour and visibility
// other readers see. Read and written through the API function, which checks
// every name before it is stored. See functions/api/index.ts.

import { callApi, callApiSignedOut } from "./api";
import type { CardColor } from "./profile-rules";

export interface Profile {
  readonly username: string;
  readonly displayName: string | null;
  readonly cardColor: CardColor;
  readonly score: number;
  /** When the score was last sent, in epoch milliseconds. */
  readonly scoredAt: number | null;
}

/** A profile at /@username, and how the visitor stands to it. */
export type ProfileView = Profile & { readonly isYou: boolean; readonly isFollowed: boolean };

/** Why a change to the profile was not saved, in terms the reader can act on. */
export type ProfileProblem = "invalid" | "offensive" | "taken" | "offline" | "unknown";

export type ProfileChanges = Partial<Pick<Profile, "username" | "displayName" | "cardColor">>;

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
