// The friends board: your score next to the scores of people you added.
//
// Only for signed-in readers, and only between people who chose each other:
// a profile is readable by its owner and by whoever added it, and someone is
// found only by typing their exact name. There is no list of everyone. See
// drizzle/schema.ts and drizzle/migrations/0003_friend_lookup.sql.

import type { Progress } from "../db";
import type { BoardEntry } from "./board";
import { callApi } from "./api";
import { connect, type SyncClient } from "./client";
import { ensureProfile } from "./profile";
import { normaliseUsername } from "./username";

export type FriendProblem = "not-found" | "self" | "offline" | "unknown";

/** Postgres' code for a row that is already there. */
const UNIQUE_VIOLATION = "23505";

async function currentUserId(client: SyncClient): Promise<string | null> {
  const session = await client.auth.getSession();
  return session.data?.user.id ?? null;
}

/**
 * Sends the reader's score, and makes their profile the first time.
 *
 * Called from sync, after everything else has gone up, so it runs as often as
 * sync does and never on the way to the next sentence. The API function keeps
 * it only if a real reader could have reached it by now (see
 * functions/api/score-check.ts). A score it turns down is simply not shown to
 * anyone yet. Nothing on this device changes, and the next sync tries again,
 * with more time behind it.
 */
export async function publishScore(score: number): Promise<void> {
  const send = (): Promise<Response | null> =>
    callApi("/score", { method: "POST", body: JSON.stringify({ score }) });
  const response = await send();
  // No profile yet: this reader just signed in for the first time. The API
  // function makes one with a random name, which they can change in settings,
  // and the score goes onto it.
  if (response?.status === 404 && (await ensureProfile()) !== null) await send();
}

/**
 * The reader and everyone they added, in no order: the board ranks them
 * (see board.ts), because the reader's own line uses their live score. Null when the
 * server could not be reached, which the board says rather than showing an
 * empty list that would look like "no friends".
 */
export async function loadBoard(): Promise<BoardEntry[] | null> {
  // The network fails for reasons nobody can prevent. The board is a view of
  // the server, so without it there is nothing to show but that.
  try {
    const client = await connect();
    const userId = await currentUserId(client);
    const rows = await client
      .from("profiles")
      .select("user_id, username, display_name, score, scored_at");
    if (rows.error !== null || userId === null) return null;

    return rows.data.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      score: row.score,
      scoredAt: row.scored_at === null ? null : Date.parse(row.scored_at),
      isYou: row.user_id === userId,
    }));
  } catch (error) {
    console.warn("could not load the friends board", error);
    return null;
  }
}

/** Adds someone by their exact name. Returns what went wrong, or null. */
export async function addFriend(name: string): Promise<FriendProblem | null> {
  try {
    const client = await connect();
    const userId = await currentUserId(client);
    const found = await client.rpc("find_profile", { name: normaliseUsername(name) });
    if (found.error !== null || userId === null) return "unknown";

    const friend = found.data[0];
    if (friend === undefined) return "not-found";
    if (friend.user_id === userId) return "self";

    const added = await client.from("friends").insert({ followee_id: friend.user_id });
    // Adding someone already on the board changes nothing, so it is not a problem.
    if (added.error !== null && added.error.code !== UNIQUE_VIOLATION) return "unknown";
    return null;
  } catch (error) {
    console.warn("could not add a friend", error);
    return "offline";
  }
}

/** Takes someone off the reader's board. They are not told. Returns whether it worked. */
export async function removeFriend(friendId: string): Promise<boolean> {
  try {
    const client = await connect();
    const removed = await client.from("friends").delete().eq("followee_id", friendId);
    return removed.error === null;
  } catch (error) {
    console.warn("could not remove a friend", error);
    return false;
  }
}

/** Takes someone off the reader's board by their name, as their profile page knows them. */
export async function removeFriendByName(name: string): Promise<boolean> {
  try {
    const client = await connect();
    const found = await client.rpc("find_profile", { name: normaliseUsername(name) });
    const friend = found.data?.[0];
    if (friend === undefined) return false;
    return await removeFriend(friend.user_id);
  } catch (error) {
    console.warn("could not remove a friend", error);
    return false;
  }
}

/** Where the board is remembered between visits. See SyncRecord.shown. */
const SHOWN_BOARD = "board";

function isBoard(value: unknown): value is BoardEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "userId" in entry &&
        typeof entry.userId === "string" &&
        "username" in entry &&
        typeof entry.username === "string" &&
        "score" in entry &&
        typeof entry.score === "number",
    )
  );
}

/**
 * The board as it was last loaded on this device, to draw at once while the
 * server is asked. Null the first time, or if what was kept is not a board.
 */
export async function lastShownBoard(progress: Progress): Promise<BoardEntry[] | null> {
  const value = await progress.lastShown(SHOWN_BOARD);
  if (!isBoard(value)) return null;
  // A display name missing from what was kept reads as none.
  return value.map((entry) => ({ ...entry, displayName: entry.displayName ?? null }));
}

export function rememberBoard(progress: Progress, board: readonly BoardEntry[]): Promise<void> {
  return progress.saveShown(SHOWN_BOARD, board);
}
