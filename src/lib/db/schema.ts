// The reader's progress on their own machine. Nothing here leaves the browser.
//
// Progress is irreplaceable: there is no server copy to restore from. Migrations
// are forward-only and must never drop review history. See CLAUDE.md 0.

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { ItemId, ItemState, ReaderModel } from "../srs";

export const DATABASE_NAME = "yomukana";
export const DATABASE_VERSION = 1;

/** One finished sentence, kept for the stats page. */
export interface AttemptRecord {
  readonly sentenceId: string;
  /** Epoch milliseconds, so records survive a timezone change. */
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly keyCount: number;
  readonly errors: number;
  /** Segments settled, the unit reading speed is counted in. */
  readonly segments: number;
  /**
   * The reader's score once this sentence was graded.
   *
   * Optional because attempts recorded before scores existed do not have one.
   * Storing it per attempt is what makes a score chart possible at all: item
   * states hold only what is true now, so the past cannot be recomputed.
   */
  readonly score?: number;
}

export interface KakukanaDb extends DBSchema {
  items: {
    key: ItemId;
    value: ItemState;
  };
  reader: {
    key: string;
    value: ReaderModel;
  };
  attempts: {
    key: number;
    value: AttemptRecord;
    indexes: { "by-finished": number };
  };
}

export type ProgressDb = IDBPDatabase<KakukanaDb>;

/** The single key the reader model is stored under. */
export const READER_KEY = "reader";

/**
 * Opens the database, or returns null when the browser will not give us one.
 *
 * Private windows, blocked site data and some embedded webviews all refuse
 * IndexedDB, and no amount of care prevents it. The app has to keep working
 * without persistence rather than show the reader an error they cannot act on.
 * This is the exception CLAUDE.md 5.6 allows.
 */
export async function openProgressDb(): Promise<ProgressDb | null> {
  try {
    return await openDB<KakukanaDb>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("items", { keyPath: "id" });
          db.createObjectStore("reader");
          const attempts = db.createObjectStore("attempts", { autoIncrement: true });
          attempts.createIndex("by-finished", "finishedAt");
        }
      },
    });
  } catch {
    return null;
  }
}
