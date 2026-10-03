// Marathons, as the app sees them: making and joining them, their boards, and
// each one's track on this device. Every call goes through the API function,
// which holds the rules (functions/api/marathons.ts); a runner's progress
// syncs through the Data API like their own (sync.ts, track-remote.ts).

import { Progress, marathonDatabaseName, marathonDatabases } from "../db";
import { callApi, callApiSignedOut } from "./api";
import type { Worn } from "./badge-rules";
import type { RunnerScore } from "./marathon-rules";
import type { CardColor } from "./profile-rules";

export interface MarathonHeader {
  readonly id: string;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly startsAt: number;
  /** Epoch milliseconds. */
  readonly endsAt: number;
  /** Whether people may still start running once it has begun. */
  readonly allowsLateEntry: boolean;
  /** Minutes after the end before the results are final. One of RESULTS_DELAY_MINUTES. */
  readonly resultsDelay: number;
}

/** A marathon in the reader's list of them. */
export interface MarathonSummary extends MarathonHeader {
  readonly isAdmin: boolean;
  readonly isRunning: boolean;
  readonly runnerCount: number;
  /** Their place among the runners now, or null while they only watch. */
  readonly place: number | null;
}

/** One runner on a board. */
export interface Runner extends RunnerScore {
  readonly username: string;
  readonly displayName: string | null;
  readonly cardColor: CardColor;
  /** When they started running, in epoch milliseconds. */
  readonly enteredAt: number | null;
  readonly isAdmin: boolean;
  readonly isYou: boolean;
  readonly badges?: readonly Worn[];
}

/** A marathon's board, for someone in it. */
export interface Marathon extends MarathonHeader {
  readonly runners: readonly Runner[];
  /** How many watch without running. */
  readonly watchers: number;
  readonly isAdmin: boolean;
  readonly isRunning: boolean;
  /** When the reader started running in it, or null while they watch. */
  readonly enteredAt: number | null;
  /** The invite's code. Only the admin is sent it. */
  readonly inviteCode: string | null;
  /** The display link's code. Only the admin is sent it. */
  readonly displayCode: string | null;
}

/** Where an invite leads, for the page it opens. */
export interface MarathonInvite extends MarathonHeader {
  readonly runnerCount: number;
  /** Whether the visitor could still run in it, rather than only watch. */
  readonly canEnter: boolean;
  readonly isMember: boolean;
  readonly isRunning: boolean;
}

/** A board for a screen, without signing in. */
export interface MarathonDisplay extends MarathonHeader {
  readonly runners: readonly Runner[];
  readonly watchers: number;
}

/** Why a marathon call did not work, in terms the reader can act on. */
export type MarathonProblem =
  "invalid" | "offensive" | "limit" | "expired" | "forbidden" | "not-found" | "offline" | "unknown";

type Result<T> = { value: T } | { problem: MarathonProblem };

const PROBLEMS: readonly MarathonProblem[] = [
  "invalid",
  "offensive",
  "limit",
  "expired",
  "forbidden",
  "not-found",
];

async function resultOf<T>(response: Response | null): Promise<Result<T>> {
  if (response === null) return { problem: "offline" };
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const problem =
      typeof body === "object" && body !== null && "problem" in body ? body.problem : null;
    return {
      problem: PROBLEMS.includes(problem as MarathonProblem)
        ? (problem as MarathonProblem)
        : "unknown",
    };
  }
  if (response.status === 204) return { value: undefined as T };
  return { value: (await response.json()) as T };
}

function send(method: string, body?: unknown): RequestInit {
  return body === undefined ? { method } : { method, body: JSON.stringify(body) };
}

export interface NewMarathon {
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly allowsLateEntry: boolean;
  readonly resultsDelay: number;
  /** Whether the maker runs in it too, or only runs it. */
  readonly isRunning: boolean;
}

export async function createMarathon(marathon: NewMarathon): Promise<Result<{ id: string }>> {
  return resultOf(await callApi("/marathons", send("POST", marathon)));
}

export async function loadMarathons(): Promise<Result<MarathonSummary[]>> {
  return resultOf(await callApi("/marathons"));
}

export async function loadMarathon(id: string): Promise<Result<Marathon>> {
  return resultOf(await callApi(`/marathons/${encodeURIComponent(id)}`));
}

/** Admin only. The times only before it starts. */
export async function updateMarathon(
  id: string,
  changes: Partial<
    Pick<MarathonHeader, "name" | "startsAt" | "endsAt" | "allowsLateEntry" | "resultsDelay">
  >,
): Promise<Result<MarathonHeader>> {
  return resultOf(await callApi(`/marathons/${id}`, send("PATCH", changes)));
}

export async function deleteMarathon(id: string): Promise<Result<undefined>> {
  const result = await resultOf<undefined>(await callApi(`/marathons/${id}`, send("DELETE")));
  if ("value" in result) await forgetTrack(id);
  return result;
}

export async function leaveMarathon(id: string): Promise<Result<undefined>> {
  const result = await resultOf<undefined>(
    await callApi(`/marathons/${id}/membership`, send("DELETE")),
  );
  if ("value" in result) await forgetTrack(id);
  return result;
}

export async function removeRunner(id: string, username: string): Promise<Result<undefined>> {
  return resultOf(
    await callApi(`/marathons/${id}/members/${encodeURIComponent(username)}`, send("DELETE")),
  );
}

/** A watcher starts running, while the marathon lets them. */
export async function enterMarathon(id: string): Promise<Result<{ enteredAt: number }>> {
  return resultOf(await callApi(`/marathons/${id}/entry`, send("POST")));
}

export async function replaceMarathonInvite(id: string): Promise<Result<{ code: string }>> {
  return resultOf(await callApi(`/marathons/${id}/invite`, send("POST")));
}

export async function stopMarathonInvite(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/marathons/${id}/invite`, send("DELETE")));
}

export async function makeMarathonDisplay(id: string): Promise<Result<{ code: string }>> {
  return resultOf(await callApi(`/marathons/${id}/display`, send("POST")));
}

export async function stopMarathonDisplay(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/marathons/${id}/display`, send("DELETE")));
}

/** What an invite leads to. Asked as nobody when the visitor is not signed in. */
export async function previewMarathonInvite(
  code: string,
  isSignedIn: boolean,
): Promise<Result<MarathonInvite>> {
  const path = `/marathon-invites/${encodeURIComponent(code)}`;
  return resultOf(await (isSignedIn ? callApi(path) : callApiSignedOut(path)));
}

export async function joinMarathon(
  code: string,
  as: "runner" | "watcher",
): Promise<Result<{ id: string }>> {
  return resultOf(
    await callApi(`/marathon-invites/${encodeURIComponent(code)}`, send("POST", { as })),
  );
}

export async function loadMarathonDisplay(code: string): Promise<Result<MarathonDisplay>> {
  return resultOf(await callApiSignedOut(`/marathon-display/${encodeURIComponent(code)}`));
}

/**
 * Sends a runner's score in one marathon, and what it will be at the end if
 * they read nothing more. Called from sync, as the reader's own score is. A
 * refused score is simply not shown, and the next sync tries again.
 */
export async function publishMarathonScore(
  id: string,
  score: number,
  endScore: number,
): Promise<void> {
  await callApi(
    `/marathons/${id}/score`,
    send("POST", { score, endScore: Math.min(endScore, score) }),
  );
}

/**
 * This device's copy of a marathon's track, ready to read on. The first time,
 * it is signed in as the reader's own account, so it syncs, and starts from
 * their typing model, which is about their hands and not their Japanese.
 */
export async function openTrack(id: string): Promise<Progress> {
  const own = new Progress();
  const track = new Progress(marathonDatabaseName(id));
  const account = (await own.syncState()).account;
  const state = await track.syncState();
  if (account !== null && state.account !== account) {
    await track.saveSyncState({ ...state, account });
  }
  await track.adoptReader(await own.storedReader());
  return track;
}

/**
 * Deletes a marathon's track from this device. Its synced copy stays on the
 * server while the marathon does, so nothing is lost that a board shows.
 */
export async function forgetTrack(id: string): Promise<void> {
  await new Progress(marathonDatabaseName(id)).destroy();
}

/** Deletes every marathon's track from this device, as signing out does. */
export async function forgetAllTracks(): Promise<void> {
  for (const id of await marathonDatabases()) await forgetTrack(id);
}
