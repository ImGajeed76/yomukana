// Reading and writing the reader's progress.
//
// Writes happen between sentences, never during one: the whole point of a
// keystroke-timed trainer is that nothing expensive shares a frame with a
// keystroke. See CLAUDE.md 1.8.

import {
  EMPTY_STORE,
  readerFrom,
  type ItemId,
  type ItemState,
  type ItemStore,
  type ReaderModel,
} from "../srs";
import {
  READER_KEY,
  SESSION_KEY,
  SYNC_KEY,
  openProgressDb,
  type AttemptRecord,
  type ProgressDb,
  type SessionRecord,
  type SyncRecord,
} from "./schema";

/** Progress that arrived from another device, to be folded into this one. */
export interface Incoming {
  readonly items: readonly ItemState[];
  readonly attempts: readonly AttemptRecord[];
  readonly reader: ReaderModel | null;
  readonly session: SessionRecord | null;
}

/**
 * How two copies of the same thing become one.
 *
 * Handed in rather than known here, so the storage layer stays about storage
 * and the rules live in one place, next to their tests. See sync/merge.ts.
 */
export interface MergeRules {
  readonly item: (local: ItemState | undefined, remote: ItemState) => ItemState;
  readonly reader: (local: ReaderModel, remote: ReaderModel) => ReaderModel;
  readonly session: (
    local: SessionRecord | null,
    remote: SessionRecord | null,
  ) => SessionRecord | null;
  /** Names an attempt the same way on every device, to spot one already here. */
  readonly attemptId: (record: AttemptRecord) => string;
}

/** A sync that has never run: nothing pulled, nothing pushed. */
export const NEVER_SYNCED: SyncRecord = {
  account: null,
  syncedAt: null,
  pulledUpTo: {},
  pushedUpTo: 0,
};

/**
 * Reads an item as it was stored, whatever version wrote it.
 *
 * Items written before reading time existed have only their recognition
 * latency. Their reading time is that latency with the starting keyboard floor
 * taken off, since every reader then was at a keyboard. It is an estimate, and
 * the next clean read of the item replaces it with a measured one.
 */
function itemFrom(stored: ItemState): ItemState {
  const item: Omit<ItemState, "meanReadingMs"> & { meanReadingMs?: number | null } = stored;
  if (item.meanReadingMs !== undefined) return stored;

  const meanReadingMs =
    item.meanLatencyMs === null
      ? null
      : Math.max(0, item.meanLatencyMs - KEYBOARD_FLOOR_ESTIMATE_MS);
  return { ...item, meanReadingMs };
}

/** What a keyboard reader's reach for a key is assumed to cost, before measuring. */
const KEYBOARD_FLOOR_ESTIMATE_MS = 250;

export interface ProgressExport {
  readonly version: number;
  readonly exportedAt: number;
  readonly items: readonly ItemState[];
  readonly reader: ItemStore["reader"];
  readonly attempts: readonly AttemptRecord[];
}

/**
 * The reader's progress, backed by IndexedDB when the browser allows it and by
 * memory alone when it does not. Callers do not branch on which they got: an
 * in-memory session still works, it just forgets when the tab closes.
 */
export class Progress {
  #db: ProgressDb | null = null;
  #store: ItemStore = EMPTY_STORE;

  /** Whether writes will survive the tab closing. */
  get isPersistent(): boolean {
    return this.#db !== null;
  }

  get store(): ItemStore {
    return this.#store;
  }

  async load(): Promise<ItemStore> {
    this.#db = await openProgressDb();
    if (this.#db === null) return this.#store;

    const [items, reader] = await Promise.all([
      this.#db.getAll("items"),
      this.#db.get("reader", READER_KEY),
    ]);

    this.#store = {
      items: new Map(items.map((item) => [item.id, itemFrom(item)])),
      reader: readerFrom(reader),
    };
    return this.#store;
  }

  /**
   * Replaces the in-memory store and writes only what changed.
   *
   * The caller knows which items a sentence touched, so a session of hundreds of
   * sentences never rewrites the reader's whole history.
   */
  async commit(store: ItemStore, changed: Iterable<ItemId>, attempt: AttemptRecord): Promise<void> {
    this.#store = store;
    if (this.#db === null) return;

    const transaction = this.#db.transaction(["items", "reader", "attempts"], "readwrite");
    const items = transaction.objectStore("items");

    for (const id of changed) {
      const state = store.items.get(id);
      if (state !== undefined) void items.put(state);
    }
    void transaction.objectStore("reader").put(store.reader, READER_KEY);
    void transaction.objectStore("attempts").add(attempt);

    await transaction.done;
  }

  /** Where the reader left off, or nothing if they have not been here before. */
  async session(): Promise<SessionRecord | null> {
    if (this.#db === null) return null;
    return (await this.#db.get("session", SESSION_KEY)) ?? null;
  }

  /** Writes where the reader is. Called at a sentence boundary, never during one. */
  async saveSession(record: SessionRecord): Promise<void> {
    if (this.#db === null) return;
    await this.#db.put("session", record, SESSION_KEY);
  }

  /** Finished sentences, most recent first. */
  async recentAttempts(limit: number): Promise<AttemptRecord[]> {
    if (this.#db === null) return [];

    const attempts: AttemptRecord[] = [];
    const index = this.#db.transaction("attempts").store.index("by-finished");

    let cursor = await index.openCursor(null, "prev");
    while (cursor !== null && attempts.length < limit) {
      attempts.push(cursor.value);
      cursor = await cursor.continue();
    }
    return attempts;
  }

  /** Everything the reader has, in one object they can save to a file. */
  async exportAll(): Promise<ProgressExport> {
    const attempts = this.#db === null ? [] : await this.#db.getAll("attempts");

    return {
      version: 1,
      exportedAt: Date.now(),
      items: [...this.#store.items.values()],
      reader: this.#store.reader,
      attempts,
    };
  }

  /** Where syncing left off on this device. */
  async syncState(): Promise<SyncRecord> {
    if (this.#db === null) return NEVER_SYNCED;
    return (await this.#db.get("meta", SYNC_KEY)) ?? NEVER_SYNCED;
  }

  async saveSyncState(record: SyncRecord): Promise<void> {
    if (this.#db === null) return;
    await this.#db.put("meta", record, SYNC_KEY);
  }

  /** What a page last showed from the server under `key`. See SyncRecord.shown. */
  async lastShown(key: string): Promise<unknown> {
    return (await this.syncState()).shown?.[key];
  }

  /** Remembers what a page showed from the server, for the signed-in account only. */
  async saveShown(key: string, value: unknown): Promise<void> {
    if (this.#db === null) return;
    // Read and written in one transaction, so a sync finishing meanwhile does
    // not have its progress marks overwritten with the ones from before it.
    const transaction = this.#db.transaction("meta", "readwrite");
    const state = (await transaction.store.get(SYNC_KEY)) ?? NEVER_SYNCED;
    if (state.account !== null) {
      await transaction.store.put({ ...state, shown: { ...state.shown, [key]: value } }, SYNC_KEY);
    }
    await transaction.done;
  }

  /** Everything reviewed on this device after `after`, in epoch milliseconds. */
  async itemsReviewedAfter(after: number): Promise<ItemState[]> {
    if (this.#db === null) return [];
    const items = await this.#db.getAll("items");
    return items.map(itemFrom).filter((item) => (item.card.last_review?.getTime() ?? 0) > after);
  }

  /** Attempts finished after `after`, in epoch milliseconds. */
  async attemptsFinishedAfter(after: number): Promise<AttemptRecord[]> {
    if (this.#db === null) return [];
    return this.#db.getAllFromIndex("attempts", "by-finished", IDBKeyRange.lowerBound(after, true));
  }

  /**
   * Folds another device's progress into this one, and returns the result.
   *
   * One transaction: read what is here, decide, write, so a sentence the reader
   * finishes while this is running cannot be overwritten by an older copy that
   * was decided against before it landed.
   */
  async merge(incoming: Incoming, rules: MergeRules): Promise<ItemStore> {
    if (this.#db === null) return this.#store;

    const transaction = this.#db.transaction(
      ["items", "reader", "attempts", "session"],
      "readwrite",
    );
    const items = transaction.objectStore("items");
    for (const remote of incoming.items) {
      const stored = await items.get(remote.id);
      const local = stored === undefined ? undefined : itemFrom(stored);
      const kept = rules.item(local, remote);
      if (kept !== local) await items.put(kept);
    }

    const attempts = transaction.objectStore("attempts");
    const byFinished = attempts.index("by-finished");
    for (const remote of incoming.attempts) {
      const sameMoment = await byFinished.getAll(remote.finishedAt);
      const id = rules.attemptId(remote);
      if (!sameMoment.some((record) => rules.attemptId(record) === id)) await attempts.add(remote);
    }

    const readers = transaction.objectStore("reader");
    if (incoming.reader !== null) {
      const local = readerFrom(await readers.get(READER_KEY));
      await readers.put(rules.reader(local, incoming.reader), READER_KEY);
    }

    const sessions = transaction.objectStore("session");
    if (incoming.session !== null) {
      const local = (await sessions.get(SESSION_KEY)) ?? null;
      const merged = rules.session(local, incoming.session);
      if (merged !== null) await sessions.put(merged, SESSION_KEY);
    }

    await transaction.done;
    return this.load();
  }

  /**
   * Deletes everything. There is no server copy, so this cannot be undone and
   * the caller must confirm it first. See CLAUDE.md 12.4.
   */
  async clear(): Promise<void> {
    this.#store = EMPTY_STORE;
    if (this.#db === null) return;

    const transaction = this.#db.transaction(
      ["items", "reader", "attempts", "session", "meta"],
      "readwrite",
    );
    void transaction.objectStore("items").clear();
    void transaction.objectStore("reader").clear();
    void transaction.objectStore("attempts").clear();
    void transaction.objectStore("session").clear();
    // Forgetting where sync left off too, so a later sign-in uploads from
    // scratch rather than assuming the server already has what was deleted.
    void transaction.objectStore("meta").clear();
    await transaction.done;
  }
}
