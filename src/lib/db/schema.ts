// The reader's progress on their own machine. Nothing here leaves the browser.
//
// Progress is irreplaceable: there is no server copy to restore from. Migrations
// are forward-only and must never drop review history. See CLAUDE.md 0.

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { ItemId, ItemState, ReaderModel } from "../srs";

export const DATABASE_NAME = "yomukana";

/**
 * Each marathon a reader runs in has a database of its own, with the same
 * stores: a track that starts from nothing, kept apart so nothing read there
 * changes their own progress, and nothing of theirs leaks into the race.
 */
const MARATHON_PREFIX = `${DATABASE_NAME}-marathon-`;

export function marathonDatabaseName(marathonId: string): string {
  return `${MARATHON_PREFIX}${marathonId}`;
}

/**
 * The marathons with a track on this device, by id. Asked of the browser
 * rather than kept in a list, so a list can never disagree with what is
 * there. Empty where the browser cannot say, which only means a streak
 * counts this device's own reading alone.
 */
export async function marathonDatabases(): Promise<string[]> {
  // Firefox before 126 has no databases(), and any browser can refuse
  // storage outright. Neither is something the reader can fix.
  try {
    const databases = await indexedDB.databases();
    return databases
      .map((database) => database.name ?? "")
      .filter((name) => name.startsWith(MARATHON_PREFIX))
      .map((name) => name.slice(MARATHON_PREFIX.length));
  } catch {
    return [];
  }
}
/**
 * Bump this whenever a store or an index is added.
 *
 * A browser that already holds the database at the old version never runs the
 * upgrade, so a new store simply is not there and every transaction touching it
 * throws. Each step is additive and guarded by the version it arrived in, so a
 * reader coming from any earlier version ends up in the same place with their
 * history intact. See CLAUDE.md 0 on migrations being forward-only.
 */
export const DATABASE_VERSION = 3;

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
   * The reader's score once this sentence was graded, on the scale before
   * September 2026. Kept as it was written, never shown: it measured
   * something else, and no rule turns it into today's number.
   */
  readonly score?: number;
  /**
   * The reader's score once this sentence was graded, on today's scale (see
   * src/lib/stats/score.ts). Storing it per attempt is what makes a score
   * chart possible at all: item states hold only what is true now, so the
   * past cannot be recomputed. Optional because older attempts do not have one.
   */
  readonly readingScore?: number;
}

/**
 * Where the reader is between sessions.
 *
 * The band used to live only in memory, so every reload put a reader who had
 * worked up to band six back on band zero material and made them climb again.
 * The cooldown went with it, so sentences they had just read came straight back
 * the next day.
 */
export interface SessionRecord {
  readonly band: number;
  readonly easyStreak: number;
  readonly hardStreak: number;
  /** Sentence id to when it was last read, in epoch milliseconds. */
  readonly seenAt: readonly (readonly [string, number])[];
}

/** The single key the session record is stored under. */
export const SESSION_KEY = "session";

/**
 * Where syncing with the server left off.
 *
 * Two different clocks on purpose. What was pulled is tracked by the server's
 * own timestamps, so "what changed since I last looked" never depends on this
 * device's clock agreeing with another's. What was pushed is tracked by this
 * device's own review times, which only ever need to agree with themselves.
 */
export interface SyncRecord {
  /**
   * The email this device is signed in with, or null if it is not.
   *
   * Kept here so a reader who never turned sync on never loads the sync code or
   * talks to the server at all, not even to ask whether they are signed in.
   */
  readonly account: string | null;
  /** When the last sync finished, in epoch milliseconds. */
  readonly syncedAt: number | null;
  /** The newest server change already pulled, per table, as the server wrote it. */
  readonly pulledUpTo: Readonly<Record<string, string>>;
  /** The newest local review or attempt already pushed, in epoch milliseconds. */
  readonly pushedUpTo: number;
  /**
   * What pages last showed from the server, by page, so they can draw it at
   * once next time and correct it when the server answers. The server is a
   * round trip to Frankfurt away, and waiting for it on every visit is what
   * made the boards feel slow.
   *
   * Kept in this record so it belongs to the account: signing out, or in as
   * someone else, starts from NEVER_SYNCED and drops it. Its shape is the
   * sync code's business, not storage's.
   */
  readonly shown?: Readonly<Record<string, unknown>>;
}

/** The single key the sync record is stored under. */
export const SYNC_KEY = "sync";

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
  session: {
    key: string;
    value: SessionRecord;
  };
  meta: {
    key: string;
    value: SyncRecord;
  };
}

export type ProgressDb = IDBPDatabase<KakukanaDb>;

/** The single key the reader model is stored under. */
export const READER_KEY = "reader";

/**
 * Opens the reader's database, or a marathon's when named, or returns null
 * when the browser will not give us one.
 *
 * Private windows, blocked site data and some embedded webviews all refuse
 * IndexedDB, and no amount of care prevents it. The app has to keep working
 * without persistence rather than show the reader an error they cannot act on.
 * This is the exception CLAUDE.md 5.6 allows.
 */
export async function openProgressDb(name: string = DATABASE_NAME): Promise<ProgressDb | null> {
  try {
    return await openDB<KakukanaDb>(name, DATABASE_VERSION, {
      // A marathon's track is deleted whole when it ends or the reader leaves
      // it, and an open connection would hold that off until the tab closes.
      // So a track gives way. The reader's own database never does: nothing
      // deletes it while the app is open.
      blocking(_current, _next, event) {
        if (name !== DATABASE_NAME) (event.target as IDBDatabase).close();
      },
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("items", { keyPath: "id" });
          db.createObjectStore("reader");
          const attempts = db.createObjectStore("attempts", { autoIncrement: true });
          attempts.createIndex("by-finished", "finishedAt");
        }
        if (oldVersion < 2) {
          db.createObjectStore("session");
        }
        if (oldVersion < 3) {
          db.createObjectStore("meta");
        }
      },
    });
  } catch {
    return null;
  }
}
