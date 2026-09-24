// The friends board: your score next to the scores of people you added.
//
// Only for signed-in readers, and only between people who chose each other:
// a profile is readable by its owner and by whoever added it, and someone is
// found only by typing their exact name. There is no list of everyone. See
// drizzle/schema.ts and drizzle/migrations/0003_friend_lookup.sql.

import type { BoardEntry } from "./board";
import { connect, type SyncClient } from "./client";
import { isValidUsername, normaliseUsername, randomUsername } from "./username";

export type FriendProblem = "not-found" | "self" | "offline" | "unknown";
export type RenameProblem = "taken" | "invalid" | "offline" | "unknown";

/** Postgres' codes for the two ways a name is refused. */
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

/** Random names collide rarely. A few tries is plenty, and a loop that cannot end is not. */
const NAME_ATTEMPTS = 5;

async function currentUserId(client: SyncClient): Promise<string | null> {
  const session = await client.auth.getSession();
  return session.data?.user.id ?? null;
}

/**
 * Sends the reader's score, and makes their profile the first time.
 *
 * Called from sync, after everything else has gone up, so it runs as often as
 * sync does and never on the way to the next sentence.
 */
export async function publishScore(client: SyncClient, score: number): Promise<void> {
  const userId = await currentUserId(client);
  if (userId === null) return;

  const scoredAt = new Date().toISOString();
  const updated = await client
    .from("profiles")
    .update({ score, scored_at: scoredAt })
    .eq("user_id", userId)
    .select("user_id");
  if (updated.error !== null) throw new Error(updated.error.message);
  if (updated.data.length > 0) return;

  // No profile yet: this reader just signed in for the first time. They get
  // a random name, and can change it in settings.
  for (let attempt = 0; attempt < NAME_ATTEMPTS; attempt++) {
    const created = await client
      .from("profiles")
      .insert({ username: randomUsername(), score, scored_at: scoredAt });
    if (created.error === null) return;
    if (created.error.code !== UNIQUE_VIOLATION) throw new Error(created.error.message);
  }
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
    const rows = await client.from("profiles").select("user_id, username, score, scored_at");
    if (rows.error !== null || userId === null) return null;

    return rows.data.map((row) => ({
      userId: row.user_id,
      username: row.username,
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

/** The reader's own name, or null if they have no profile yet or the server is out of reach. */
export async function ownUsername(): Promise<string | null> {
  try {
    const client = await connect();
    const userId = await currentUserId(client);
    if (userId === null) return null;
    const own = await client.from("profiles").select("username").eq("user_id", userId);
    return own.error === null ? (own.data[0]?.username ?? null) : null;
  } catch (error) {
    console.warn("could not read the username", error);
    return null;
  }
}

/** Changes the reader's name. Returns what went wrong, or null. */
export async function renameProfile(name: string): Promise<RenameProblem | null> {
  if (!isValidUsername(name)) return "invalid";
  try {
    const client = await connect();
    const userId = await currentUserId(client);
    if (userId === null) return "unknown";
    const renamed = await client
      .from("profiles")
      .update({ username: normaliseUsername(name) })
      .eq("user_id", userId);
    if (renamed.error === null) return null;
    if (renamed.error.code === UNIQUE_VIOLATION) return "taken";
    if (renamed.error.code === CHECK_VIOLATION) return "invalid";
    return "unknown";
  } catch (error) {
    console.warn("could not rename the profile", error);
    return "offline";
  }
}
