// The global leaderboard, as the app sees it: the best readers who chose to
// be on it. Public, so it is asked for without a token when nobody is signed
// in. See functions/api/scores.ts.

import { callApi, callApiSignedOut } from "./api";
import type { DisplayBoard, GroupMember } from "./groups";
import type { Profile } from "./profile";

export interface GlobalLine extends Profile {
  /** Place on the whole board, not only among the lines sent. */
  readonly rank: number;
  readonly isYou: boolean;
}

export interface GlobalBoard {
  /** The best readers on the board, best first. */
  readonly lines: readonly GlobalLine[];
  /** The caller's own line when they are on the board but not among `lines`. */
  readonly you: GlobalLine | null;
}

/** The global board, or null when it could not be reached. */
export async function loadGlobalBoard(isSignedIn: boolean): Promise<GlobalBoard | null> {
  const response = await (isSignedIn ? callApi("/global") : callApiSignedOut("/global"));
  if (response?.ok !== true) return null;
  return (await response.json()) as GlobalBoard;
}

/** The global board for a screen, in the shape the display page draws. */
export async function loadGlobalDisplayBoard(
  name: string,
): Promise<{ value: DisplayBoard } | { problem: "offline" }> {
  const board = await loadGlobalBoard(false);
  if (board === null) return { problem: "offline" };
  const members: GroupMember[] = board.lines.map((line) => ({
    username: line.username,
    displayName: line.displayName,
    cardColor: line.cardColor,
    score: line.score,
    scoredAt: line.scoredAt,
    role: "member",
    isYou: false,
  }));
  return { value: { name, members } };
}
