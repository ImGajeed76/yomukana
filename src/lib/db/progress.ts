// Reading and writing the reader's progress.
//
// Writes happen between sentences, never during one: the whole point of a
// keystroke-timed trainer is that nothing expensive shares a frame with a
// keystroke. See CLAUDE.md 1.8.

import { EMPTY_STORE, INITIAL_READER, type ItemId, type ItemState, type ItemStore } from "../srs";
import { READER_KEY, openProgressDb, type AttemptRecord, type ProgressDb } from "./schema";

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
      items: new Map(items.map((item) => [item.id, item])),
      reader: reader ?? INITIAL_READER,
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

  /**
   * Deletes everything. There is no server copy, so this cannot be undone and
   * the caller must confirm it first. See CLAUDE.md 12.4.
   */
  async clear(): Promise<void> {
    this.#store = EMPTY_STORE;
    if (this.#db === null) return;

    const transaction = this.#db.transaction(["items", "reader", "attempts"], "readwrite");
    void transaction.objectStore("items").clear();
    void transaction.objectStore("reader").clear();
    void transaction.objectStore("attempts").clear();
    await transaction.done;
  }
}
