// Groups, as the app sees them: a shared board, its members and its links.
// Every call goes through the API function, which holds the rules. See
// functions/api/groups.ts.

import type { Progress } from "../db";
import { callApi, callApiSignedOut } from "./api";
import type { BoardEntry } from "./board";
import type { InviteDays } from "./group-rules";
import type { CardColor } from "./profile-rules";

export type GroupRole = "admin" | "member";

/** A group in the list of boards. */
export interface GroupSummary {
  readonly id: string;
  readonly name: string;
  readonly role: GroupRole;
  readonly memberCount: number;
}

export interface GroupMember {
  readonly username: string;
  readonly displayName: string | null;
  readonly cardColor: CardColor;
  readonly score: number;
  readonly scoredAt: number | null;
  readonly role: GroupRole;
  readonly isYou: boolean;
}

export interface Invite {
  readonly code: string;
  /** When it stops working, in epoch milliseconds. */
  readonly expiresAt: number;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly role: GroupRole;
  readonly members: readonly GroupMember[];
  /** The invite while it works. Only the admin is sent it. */
  readonly invite: Invite | null;
  /** The display link's code. Only the admin is sent it. */
  readonly displayCode: string | null;
}

/** Where an invite leads, for the page a scanned code opens. */
export interface InvitePreview {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  readonly isMember: boolean;
}

/** A board for a classroom screen. */
export interface DisplayBoard {
  readonly name: string;
  readonly members: readonly GroupMember[];
}

/** Why a group call did not work, in terms the reader can act on. */
export type GroupProblem =
  "invalid" | "offensive" | "limit" | "expired" | "not-found" | "offline" | "unknown";

async function problemOf(response: Response | null): Promise<GroupProblem> {
  if (response === null) return "offline";
  const body: unknown = await response.json().catch(() => null);
  const problem =
    typeof body === "object" && body !== null && "problem" in body ? body.problem : null;
  switch (problem) {
    case "invalid":
    case "offensive":
    case "limit":
    case "expired":
    case "not-found":
      return problem;
    default:
      return "unknown";
  }
}

type Result<T> = { value: T } | { problem: GroupProblem };

/** Reads a JSON answer, or why there is none. */
async function resultOf<T>(response: Response | null): Promise<Result<T>> {
  if (response?.ok !== true) return { problem: await problemOf(response) };
  if (response.status === 204) return { value: undefined as T };
  return { value: (await response.json()) as T };
}

function send(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

export async function listGroups(): Promise<Result<GroupSummary[]>> {
  return resultOf(await callApi("/groups"));
}

export async function createGroup(name: string): Promise<Result<{ id: string }>> {
  return resultOf(await callApi("/groups", { method: "POST", ...send({ name }) }));
}

export async function loadGroup(id: string): Promise<Result<Group>> {
  return resultOf(await callApi(`/groups/${encodeURIComponent(id)}`));
}

export async function renameGroup(id: string, name: string): Promise<Result<{ name: string }>> {
  return resultOf(await callApi(`/groups/${id}`, { method: "PATCH", ...send({ name }) }));
}

export async function deleteGroup(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/groups/${id}`, { method: "DELETE" }));
}

export async function leaveGroup(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/groups/${id}/membership`, { method: "DELETE" }));
}

export async function removeMember(id: string, username: string): Promise<Result<undefined>> {
  return resultOf(
    await callApi(`/groups/${id}/members/${encodeURIComponent(username)}`, { method: "DELETE" }),
  );
}

export async function makeInvite(id: string, days: InviteDays): Promise<Result<Invite>> {
  return resultOf(await callApi(`/groups/${id}/invite`, { method: "POST", ...send({ days }) }));
}

export async function stopInvite(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/groups/${id}/invite`, { method: "DELETE" }));
}

export async function makeDisplayLink(id: string): Promise<Result<{ code: string }>> {
  return resultOf(await callApi(`/groups/${id}/display`, { method: "POST" }));
}

export async function stopDisplayLink(id: string): Promise<Result<undefined>> {
  return resultOf(await callApi(`/groups/${id}/display`, { method: "DELETE" }));
}

/** What an invite leads to. Asked as nobody when the visitor is not signed in. */
export async function previewInvite(
  code: string,
  isSignedIn: boolean,
): Promise<Result<InvitePreview>> {
  const path = `/join/${encodeURIComponent(code)}`;
  return resultOf(await (isSignedIn ? callApi(path) : callApiSignedOut(path)));
}

export async function joinGroup(code: string): Promise<Result<{ id: string }>> {
  return resultOf(await callApi(`/join/${encodeURIComponent(code)}`, { method: "POST" }));
}

export async function loadDisplayBoard(code: string): Promise<Result<DisplayBoard>> {
  return resultOf(await callApiSignedOut(`/display/${encodeURIComponent(code)}`));
}

/** A group's members as board lines, ranked by the same rules as every other board. */
export function boardOf(members: readonly GroupMember[]): BoardEntry[] {
  return members.map((member) => ({
    // Usernames are unique, and a board line needs no more than that to be told apart.
    userId: member.username,
    username: member.username,
    displayName: member.displayName,
    score: member.score,
    scoredAt: member.scoredAt,
    isYou: member.isYou,
  }));
}

/** Where the list of groups is remembered between visits. See SyncRecord.shown. */
const SHOWN_GROUPS = "groups";

function isGroupList(value: unknown): value is GroupSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group: unknown) =>
        typeof group === "object" &&
        group !== null &&
        "id" in group &&
        typeof group.id === "string" &&
        "name" in group &&
        typeof group.name === "string",
    )
  );
}

/** The groups as they were last loaded on this device, to draw at once. */
export async function lastShownGroups(progress: Progress): Promise<GroupSummary[] | null> {
  const value = await progress.lastShown(SHOWN_GROUPS);
  return isGroupList(value) ? value : null;
}

export function rememberGroups(progress: Progress, list: readonly GroupSummary[]): Promise<void> {
  return progress.saveShown(SHOWN_GROUPS, list);
}

function isGroup(value: unknown): value is Group {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "members" in value &&
    Array.isArray(value.members)
  );
}

/** A group's board as it was last loaded on this device, to draw at once. */
export async function lastShownGroup(progress: Progress, id: string): Promise<Group | null> {
  const value = await progress.lastShown(`group:${id}`);
  return isGroup(value) && value.id === id ? value : null;
}

export function rememberGroup(progress: Progress, group: Group): Promise<void> {
  return progress.saveShown(`group:${group.id}`, group);
}

/** Forgets a group this reader has left or deleted, so it is not drawn again. */
export function forgetGroup(progress: Progress, id: string): Promise<void> {
  return progress.saveShown(`group:${id}`, undefined);
}
