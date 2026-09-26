// The connection to the synced copy: Neon Auth for the account, the Neon Data
// API for the rows.
//
// Which Neon branch they point at comes from the build: `.env.local` names the
// `dev` branch for `bun run dev`, and Vercel's settings name `production` for
// the live site. So testing never touches a real reader's progress.
//
// Auth is reached through this site's own address, `/api/auth`, which Vercel
// (middleware.ts) and the dev server (vite.config.ts) forward to Neon Auth. The
// session is a cookie, and Safari throws away cookies from any site other
// than the one the reader is on, so a cookie from Neon's own address was gone
// the moment after signing in. Through `/api/auth` it is this site's cookie.
// The Data API does not need this: it is sent a token, not a cookie.
//
// Both URLs are public on purpose. They name where to knock, not a way in: the
// Data API only answers with a token from signing in, and Postgres row-level
// security decides from that token which rows it may touch. The database
// connection string, which is a way in, never reaches the browser. See
// drizzle/schema.ts.

import type { createClient as CreateClient } from "@neondatabase/neon-js";
import { PUBLIC_NEON_DATA_API_URL } from "$env/static/public";
import type { AttemptRecord, SessionRecord } from "../db";
import type { ItemState, ReaderModel } from "../srs";

/** Where auth is reached from the browser: this site, forwarded to Neon Auth. */
export function authUrl(): string {
  return `${location.origin}/api/auth`;
}
const DATA_API_URL = PUBLIC_NEON_DATA_API_URL;

/** A table as the Data API sees it. `user_id` is never sent: the server fills it in. */
interface Table<Row, Insert> {
  Row: Row & { user_id: string; updated_at: string };
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
}

/**
 * The tables in drizzle/schema.ts, typed for the client.
 *
 * Written out by hand rather than generated, because there are four of them and
 * the columns that matter are JSON the app already has types for. Reads come
 * back as `unknown` JSON and go through the same revive step as anything else
 * that crossed a wire.
 */
interface Database {
  public: {
    Tables: {
      items: Table<
        { item_id: string; state: unknown; reviewed_at: string },
        { item_id: string; state: ItemState; reviewed_at: string }
      >;
      attempts: Table<
        { attempt_id: string; record: AttemptRecord; finished_at: string },
        { attempt_id: string; record: AttemptRecord; finished_at: string }
      >;
      readers: Table<{ model: unknown }, { model: ReaderModel }>;
      sessions: Table<{ record: SessionRecord }, { record: SessionRecord }>;
      // Everything but the score is written through the API function, which
      // checks names first. The Data API may only touch the score.
      profiles: Table<
        {
          username: string;
          display_name: string | null;
          card_color: string;
          score: number;
          scored_at: string | null;
        },
        { score?: number; scored_at?: string }
      >;
      friends: Table<{ follower_id: string; followee_id: string }, { followee_id: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      find_profile: {
        Args: { name: string };
        Returns: { user_id: string; username: string }[];
      };
    };
  };
}

// Inferred on purpose: the SDK does not export the type of its own client, and
// the one it returns is chosen by an overload on the arguments.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function build(createClient: typeof CreateClient) {
  return createClient<Database>({ auth: { url: authUrl() }, dataApi: { url: DATA_API_URL } });
}

export type SyncClient = ReturnType<typeof build>;

let connecting: Promise<SyncClient> | null = null;

/**
 * The client, loaded the first time something asks for it.
 *
 * Loaded on demand rather than imported, so a reader who never turns sync on
 * never downloads the SDK and the page never contacts the server for them.
 */
export function connect(): Promise<SyncClient> {
  connecting ??= import("@neondatabase/neon-js").then((module) => build(module.createClient));
  return connecting;
}
