// One round of sync: pull what other devices wrote, fold it in, push what this
// device has that the server does not.
//
// Runs between sentences, never during one. It reads and writes IndexedDB in
// bulk, which is exactly the work the keystroke path must never share a frame
// with. See CLAUDE.md 1.9.

import {
  NEVER_SYNCED,
  type AttemptRecord,
  type MergeRules,
  type Progress,
  type SyncRecord,
} from "../db";
import { readerFrom, type ItemState } from "../srs";
import { scoreOf } from "../stats/score";
import { connect, type SyncClient } from "./client";
import { publishScore } from "./friends";
import {
  attemptIdOf,
  lastReviewOf,
  mergeReaders,
  mergeSessions,
  newerItem,
  reviveItem,
} from "./merge";

export type SyncOutcome =
  /** Everything is up to date both ways. */
  | "synced"
  /** This device was never signed in, so there was nothing to do. */
  | "off"
  /** It was signed in, and the server no longer thinks so. */
  | "expired"
  /** The server could not be reached, or refused. Nothing was lost; it retries next time. */
  | "failed";

const RULES: MergeRules = {
  item: newerItem,
  reader: mergeReaders,
  session: mergeSessions,
  attemptId: attemptIdOf,
};

/** Rows asked for per request, on both pull and push. */
const PAGE_SIZE = 500;

/**
 * How far back past the last pull the next one starts.
 *
 * A row's `updated_at` is when its transaction started, not when it became
 * visible, so a slow write from another device can land with a timestamp just
 * behind one this device already pulled past. Merging is idempotent, so reading
 * a minute of rows twice costs a few bytes and missing one costs a review.
 */
const PULL_OVERLAP_MS = 60_000;

interface Result<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}

/** The data from a Data API call, or a thrown error for the outer catch to report. */
function must<T>(result: Result<T>): T {
  if (result.error !== null) throw new Error(result.error.message);
  if (result.data === null) throw new Error("empty response");
  return result.data;
}

function overlapped(since: string | undefined): string {
  if (since === undefined) return new Date(0).toISOString();
  return new Date(Date.parse(since) - PULL_OVERLAP_MS).toISOString();
}

/** The newest `updated_at` among rows, or `fallback` if there were none. */
function newestOf(
  rows: readonly { updated_at: string }[],
  fallback: string | undefined,
): string | undefined {
  return rows.at(-1)?.updated_at ?? fallback;
}

async function pullItems(
  client: SyncClient,
  since: string | undefined,
): Promise<{ items: ItemState[]; upTo: string | undefined }> {
  const items: ItemState[] = [];
  let upTo = since;
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = must(
      await client
        .from("items")
        .select("state, updated_at")
        .gt("updated_at", overlapped(since))
        .order("updated_at")
        .order("item_id")
        .range(from, from + PAGE_SIZE - 1),
    );
    for (const row of rows) items.push(reviveItem(row.state));
    upTo = newestOf(rows, upTo);
    if (rows.length < PAGE_SIZE) return { items, upTo };
  }
}

async function pullAttempts(
  client: SyncClient,
  since: string | undefined,
): Promise<{ attempts: AttemptRecord[]; upTo: string | undefined }> {
  const attempts: AttemptRecord[] = [];
  let upTo = since;
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = must(
      await client
        .from("attempts")
        .select("record, updated_at")
        .gt("updated_at", overlapped(since))
        .order("updated_at")
        .order("attempt_id")
        .range(from, from + PAGE_SIZE - 1),
    );
    for (const row of rows) attempts.push(row.record);
    upTo = newestOf(rows, upTo);
    if (rows.length < PAGE_SIZE) return { attempts, upTo };
  }
}

/** Splits rows into requests small enough to send. */
function* pages<T>(rows: readonly T[]): Generator<T[]> {
  for (let from = 0; from < rows.length; from += PAGE_SIZE)
    yield rows.slice(from, from + PAGE_SIZE);
}

async function pushItems(client: SyncClient, progress: Progress, after: number): Promise<void> {
  const items = await progress.itemsReviewedAfter(after);
  for (const page of pages(items)) {
    const rows = page.map((state) => ({
      item_id: state.id,
      state,
      reviewed_at: new Date(lastReviewOf(state)).toISOString(),
    }));
    // An older copy is turned away by a trigger rather than by the request, so
    // a device that was offline for a week cannot undo this week. See
    // drizzle/migrations/0001_merge_rules.sql.
    must(
      await client.from("items").upsert(rows, { onConflict: "user_id,item_id" }).select("item_id"),
    );
  }
}

async function pushAttempts(client: SyncClient, progress: Progress, after: number): Promise<void> {
  const attempts = await progress.attemptsFinishedAfter(after);
  for (const page of pages(attempts)) {
    const rows = page.map((record) => ({
      attempt_id: attemptIdOf(record),
      record,
      finished_at: new Date(record.finishedAt).toISOString(),
    }));
    must(
      await client
        .from("attempts")
        .upsert(rows, { onConflict: "user_id,attempt_id", ignoreDuplicates: true })
        .select("attempt_id"),
    );
  }
}

async function pushReader(client: SyncClient, progress: Progress): Promise<void> {
  must(
    await client
      .from("readers")
      .upsert({ model: progress.store.reader }, { onConflict: "user_id" })
      .select("user_id"),
  );
}

async function pushSession(client: SyncClient, progress: Progress): Promise<void> {
  const session = await progress.session();
  if (session === null) return;
  must(
    await client
      .from("sessions")
      .upsert({ record: session }, { onConflict: "user_id" })
      .select("user_id"),
  );
}

/**
 * Brings this device and the server level with each other.
 *
 * Pull first, then push, so what goes up has already been merged with what came
 * down and the server gets the reader's whole progress rather than one device's.
 */
export async function sync(progress: Progress): Promise<SyncOutcome> {
  const state = await progress.syncState();
  if (state.account === null) return "off";

  // The network is the one thing here that fails for reasons nobody can
  // prevent: a train, a tunnel, a server restarting. The reader's progress is
  // already safe in IndexedDB, so a failure only means the copy is behind.
  try {
    const client = await connect();
    const session = await client.auth.getSession();
    if (session.data?.user == null) return "expired";

    // Taken before reading anything to push, so a sentence finished while this
    // runs is newer than the mark and goes up next time rather than never.
    const startedAt = Date.now();

    const [pulledItems, pulledAttempts, reader, remoteSession] = await Promise.all([
      pullItems(client, state.pulledUpTo.items),
      pullAttempts(client, state.pulledUpTo.attempts),
      client.from("readers").select("model").maybeSingle(),
      client.from("sessions").select("record").maybeSingle(),
    ]);
    const readerRow = reader.error === null ? reader.data : null;
    const sessionRow = remoteSession.error === null ? remoteSession.data : null;

    await progress.merge(
      {
        items: pulledItems.items,
        attempts: pulledAttempts.attempts,
        reader: readerRow === null ? null : readerFrom(readerRow.model),
        session: sessionRow?.record ?? null,
      },
      RULES,
    );

    // All at once: none of them depends on another, and each is a round trip
    // to Frankfurt, so one after the other they added up to seconds. The
    // score is worked out after the merge, so friends see everything just
    // pulled in too.
    await Promise.all([
      pushItems(client, progress, state.pushedUpTo),
      pushAttempts(client, progress, state.pushedUpTo),
      pushReader(client, progress),
      pushSession(client, progress),
      publishScore(client, scoreOf(progress.store, new Date())),
    ]);

    // The reader may have signed out or deleted everything while this ran.
    // Writing the old record back would sign them in again.
    const now = await progress.syncState();
    if (now.account !== state.account) return "off";

    const pulledUpTo: Record<string, string> = { ...state.pulledUpTo };
    if (pulledItems.upTo !== undefined) pulledUpTo.items = pulledItems.upTo;
    if (pulledAttempts.upTo !== undefined) pulledUpTo.attempts = pulledAttempts.upTo;
    await progress.saveSyncState({
      ...now,
      pulledUpTo,
      pushedUpTo: startedAt,
      syncedAt: Date.now(),
    });
    return "synced";
  } catch (error) {
    console.warn("sync failed", error);
    return "failed";
  }
}

/** What a device that just signed in as `account` should remember about syncing. */
export function signedInRecord(previous: SyncRecord, account: string): SyncRecord {
  // Same account: carry on where it left off. A different one: start over, so
  // everything on this device goes up to the new account and everything the new
  // account has comes down.
  if (previous.account === account) return previous;
  return { ...NEVER_SYNCED, account };
}
