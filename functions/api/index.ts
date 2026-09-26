// yomukana's API: the writes that need a rule checked before they happen.
//
// Everything else goes straight from the browser to the database through the
// Data API, under row-level security. This handles what the database cannot
// judge well on its own: whether a name is acceptable, and later whether a
// score is plausible and who may do what in a group. It connects as the
// database owner, so every query here scopes itself to the caller.
//
// Reached through this site's /api/v1, forwarded by middleware.ts in
// production and by the Vite proxy locally. It sees only what sync already
// sends: a profile and a score, never a sentence or a keystroke.

import { attachDatabasePool } from "@neon/functions";
import { Hono, type Context } from "hono";
import { Pool } from "pg";
import { toCodePoints } from "../../src/lib/japanese/text";
import { DISPLAY_NAME_MAX, isCardColor, type CardColor } from "../../src/lib/sync/profile-rules";
import { isValidUsername, normaliseUsername, randomUsername } from "../../src/lib/sync/username";
import { readerOf } from "./auth";
import { isOffensiveName } from "./names";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

/** Postgres' code for a unique value already taken. */
const UNIQUE_VIOLATION = "23505";
/** Random names collide rarely. A few tries is plenty, and a loop that cannot end is not. */
const NAME_ATTEMPTS = 5;

interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string | null;
  card_color: CardColor;
  score: number;
  scored_at: Date | null;
}

/** A profile as the app sees it. */
function profileOf(row: ProfileRow): Record<string, unknown> {
  return {
    username: row.username,
    displayName: row.display_name,
    cardColor: row.card_color,
    score: row.score,
    scoredAt: row.scored_at === null ? null : row.scored_at.getTime(),
  };
}

type Problem = "unauthorized" | "invalid" | "offensive" | "taken" | "not-found";

function refuse(c: Context, problem: Problem): Response {
  const status = { unauthorized: 401, invalid: 400, offensive: 400, taken: 409, "not-found": 404 }[
    problem
  ];
  return c.json({ problem }, status);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNIQUE_VIOLATION
  );
}

const app = new Hono();

app.get("/", (c) => c.json({ ok: true }));

/**
 * Makes the caller's profile if they have none, with a random name, and
 * returns it. Called on a reader's first sync.
 */
app.post("/profile/ensure", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");

  const existing = await pool.query<ProfileRow>("select * from profiles where user_id = $1", [
    userId,
  ]);
  const found = existing.rows[0];
  if (found !== undefined) return c.json(profileOf(found));

  for (let attempt = 0; attempt < NAME_ATTEMPTS; attempt++) {
    // Only the name clashing is expected and retried. Anything else propagates.
    try {
      // A page and a sync can both ask on a first sign-in, at the same moment.
      // The one that loses finds the profile the other just made, rather than
      // mistaking the clash on the reader for a clash on the name.
      const created = await pool.query<ProfileRow>(
        `insert into profiles (user_id, username) values ($1, $2)
         on conflict (user_id) do nothing returning *`,
        [userId, randomUsername()],
      );
      const row = created.rows[0];
      if (row !== undefined) return c.json(profileOf(row), 201);
      const made = await pool.query<ProfileRow>("select * from profiles where user_id = $1", [
        userId,
      ]);
      const other = made.rows[0];
      if (other !== undefined) return c.json(profileOf(other));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return refuse(c, "taken");
});

/** Changes any of the caller's name, display name and card colour. */
app.patch("/profile", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");

  const body: unknown = await c.req.json().catch(() => null);
  if (typeof body !== "object" || body === null) return refuse(c, "invalid");
  const changes = body as Record<string, unknown>;

  const set: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown): void => {
    values.push(value);
    set.push(`${column} = $${String(values.length)}`);
  };

  if ("username" in changes) {
    if (typeof changes.username !== "string" || !isValidUsername(changes.username)) {
      return refuse(c, "invalid");
    }
    const username = normaliseUsername(changes.username);
    if (isOffensiveName(username)) return refuse(c, "offensive");
    add("username", username);
  }
  if ("displayName" in changes) {
    const name = changes.displayName;
    if (name === null || name === "") {
      add("display_name", null);
    } else {
      if (typeof name !== "string") return refuse(c, "invalid");
      const trimmed = name.trim();
      // Counted the way the database's check counts, in code points.
      const length = toCodePoints(trimmed).length;
      if (length === 0 || length > DISPLAY_NAME_MAX) {
        return refuse(c, "invalid");
      }
      if (isOffensiveName(trimmed)) return refuse(c, "offensive");
      add("display_name", trimmed);
    }
  }
  if ("cardColor" in changes) {
    if (!isCardColor(changes.cardColor)) return refuse(c, "invalid");
    add("card_color", changes.cardColor);
  }
  if (set.length === 0) return refuse(c, "invalid");

  values.push(userId);
  // A name someone else holds is the one refusal that only the database can
  // see, and it says so with a unique violation.
  try {
    const updated = await pool.query<ProfileRow>(
      `update profiles set ${set.join(", ")} where user_id = $${String(values.length)} returning *`,
      values,
    );
    const row = updated.rows[0];
    return row === undefined ? refuse(c, "not-found") : c.json(profileOf(row));
  } catch (error) {
    if (isUniqueViolation(error)) return refuse(c, "taken");
    throw error;
  }
});

/**
 * A profile, for /@username. Anyone may see it, signed in or not.
 *
 * There is no private setting on purpose. Following needs nobody's approval,
 * so anyone who knows a name could follow and see the card anyway, and a
 * switch that hid it from everyone else would promise a privacy it cannot
 * keep. What keeps a reader out of view is that nobody can look up a name
 * they were not given.
 */
app.get("/u/:username", async (c) => {
  const viewer = await readerOf(c.req.raw);
  const result = await pool.query<ProfileRow & { is_followed: boolean }>(
    `select p.*, exists (
       select 1 from friends f where f.follower_id = $2 and f.followee_id = p.user_id
     ) as is_followed
     from profiles p where p.username = $1`,
    [normaliseUsername(c.req.param("username")), viewer ?? ""],
  );
  const row = result.rows[0];
  if (row === undefined) return refuse(c, "not-found");
  return c.json({ ...profileOf(row), isYou: viewer === row.user_id, isFollowed: row.is_followed });
});

export default app;
