// Where a track's progress lives on the server: the reader's own four tables,
// or a marathon's four, which hold the same rows with the marathon's id on
// each. Sync works on either through this one shape, so the rules for
// pulling, merging and pushing are written once. See sync.ts.

import type { AttemptRecord, SessionRecord } from "../db";
import type { ItemState, ReaderModel } from "../srs";
import type { SyncClient } from "./client";

/** Which progress a sync is about. */
export type Track =
  | { readonly kind: "own" }
  /** A marathon's, which counts only until `endsAt`, in epoch milliseconds. */
  | { readonly kind: "marathon"; readonly id: string; readonly endsAt: number };

export const OWN_TRACK: Track = { kind: "own" };

export interface Result<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}

export interface ItemRow {
  readonly item_id: string;
  readonly state: ItemState;
  readonly reviewed_at: string;
}

export interface AttemptRow {
  readonly attempt_id: string;
  readonly record: AttemptRecord;
  readonly finished_at: string;
}

/** One track's tables, as calls. Pulls take rows changed after `since`, a page at a time. */
export interface TrackRemote {
  pullItems(
    since: string,
    from: number,
    to: number,
  ): PromiseLike<Result<{ state: unknown; updated_at: string }[]>>;
  pullAttempts(
    since: string,
    from: number,
    to: number,
  ): PromiseLike<Result<{ record: AttemptRecord; updated_at: string }[]>>;
  pushItems(rows: readonly ItemRow[]): PromiseLike<Result<unknown[]>>;
  pushAttempts(rows: readonly AttemptRow[]): PromiseLike<Result<unknown[]>>;
  pullReader(): PromiseLike<Result<{ model: unknown }>>;
  pushReader(model: ReaderModel): PromiseLike<Result<unknown[]>>;
  pullSession(): PromiseLike<Result<{ record: SessionRecord }>>;
  pushSession(record: SessionRecord): PromiseLike<Result<unknown[]>>;
}

function ownRemote(client: SyncClient): TrackRemote {
  return {
    pullItems: (since, from, to) =>
      client
        .from("items")
        .select("state, updated_at")
        .gt("updated_at", since)
        .order("updated_at")
        .order("item_id")
        .range(from, to),
    pullAttempts: (since, from, to) =>
      client
        .from("attempts")
        .select("record, updated_at")
        .gt("updated_at", since)
        .order("updated_at")
        .order("attempt_id")
        .range(from, to),
    // An older copy is turned away by a trigger rather than by the request, so
    // a device that was offline for a week cannot undo this week. See
    // drizzle/migrations/0001_merge_rules.sql.
    pushItems: (rows) =>
      client
        .from("items")
        .upsert([...rows], { onConflict: "user_id,item_id" })
        .select("item_id"),
    pushAttempts: (rows) =>
      client
        .from("attempts")
        .upsert([...rows], { onConflict: "user_id,attempt_id", ignoreDuplicates: true })
        .select("attempt_id"),
    pullReader: () => client.from("readers").select("model").maybeSingle(),
    pushReader: (model) =>
      client.from("readers").upsert({ model }, { onConflict: "user_id" }).select("user_id"),
    pullSession: () => client.from("sessions").select("record").maybeSingle(),
    pushSession: (record) =>
      client.from("sessions").upsert({ record }, { onConflict: "user_id" }).select("user_id"),
  };
}

function marathonRemote(client: SyncClient, id: string): TrackRemote {
  return {
    pullItems: (since, from, to) =>
      client
        .from("marathon_items")
        .select("state, updated_at")
        .eq("marathon_id", id)
        .gt("updated_at", since)
        .order("updated_at")
        .order("item_id")
        .range(from, to),
    pullAttempts: (since, from, to) =>
      client
        .from("marathon_attempts")
        .select("record, updated_at")
        .eq("marathon_id", id)
        .gt("updated_at", since)
        .order("updated_at")
        .order("attempt_id")
        .range(from, to),
    // The same triggers guard these as the reader's own (0028), and the
    // row-level rules turn away anything read outside the race.
    pushItems: (rows) =>
      client
        .from("marathon_items")
        .upsert(
          rows.map((row) => ({ ...row, marathon_id: id })),
          { onConflict: "user_id,marathon_id,item_id" },
        )
        .select("item_id"),
    pushAttempts: (rows) =>
      client
        .from("marathon_attempts")
        .upsert(
          rows.map((row) => ({ ...row, marathon_id: id })),
          { onConflict: "user_id,marathon_id,attempt_id", ignoreDuplicates: true },
        )
        .select("attempt_id"),
    pullReader: () =>
      client.from("marathon_readers").select("model").eq("marathon_id", id).maybeSingle(),
    pushReader: (model) =>
      client
        .from("marathon_readers")
        .upsert({ marathon_id: id, model }, { onConflict: "user_id,marathon_id" })
        .select("marathon_id"),
    pullSession: () =>
      client.from("marathon_sessions").select("record").eq("marathon_id", id).maybeSingle(),
    pushSession: (record) =>
      client
        .from("marathon_sessions")
        .upsert({ marathon_id: id, record }, { onConflict: "user_id,marathon_id" })
        .select("marathon_id"),
  };
}

export function remoteFor(client: SyncClient, track: Track): TrackRemote {
  return track.kind === "own" ? ownRemote(client) : marathonRemote(client, track.id);
}
