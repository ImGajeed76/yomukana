// Marathons: reading races with a start and an end, made by any signed-in
// reader and joined through an invite, to run or to watch.
//
// Everything about who may do what goes through here, as for groups: the
// tables are closed to the Data API. A runner's progress on the marathon's
// own track does go through the Data API, under row-level rules that check
// they are running and the race is on (drizzle/migrations/0027_marathons.sql).
// Scores are in marathon-scores.ts. Rules: src/lib/sync/marathon-rules.ts.

import { Hono, type Context } from "hono";
import { toCodePoints } from "../../src/lib/japanese/text";
import type { Worn } from "../../src/lib/sync/badge-rules";
import {
  MARATHON_MEMBERS_MAX,
  MARATHON_NAME_MAX,
  MARATHONS_PER_READER_MAX,
  canEnter,
  isResultsDelay,
  isValidSchedule,
} from "../../src/lib/sync/marathon-rules";
import { normaliseUsername } from "../../src/lib/sync/username";
import { readerOf } from "./auth";
import { badgesFor } from "./badges";
import { DISPLAY_CODE_LENGTH, INVITE_CODE_LENGTH, isCode, isUuid, randomCode } from "./codes";
import { inTransaction, pool } from "./db";
import { isOffensiveName } from "./names";
import { refuse } from "./problems";
import type { ProfileRow } from "./profiles";

interface MarathonRow {
  marathon_id: string;
  name: string;
  starts_at: Date;
  ends_at: Date;
  allows_late_entry: boolean;
  results_delay_minutes: number;
  invite_code: string | null;
  display_code: string | null;
}

interface MemberRow extends ProfileRow {
  is_admin: boolean;
  entered_at: Date | null;
  end_score: number;
  // The marathon's score, not the profile's: the select below renames them.
  marathon_score: number;
  marathon_scored_at: Date | null;
}

/** Everyone in a marathon, with the profile each one shows and their marathon score. */
async function membersOf(marathonId: string): Promise<MemberRow[]> {
  const result = await pool.query<MemberRow>(
    `select p.*, m.is_admin, m.entered_at, m.end_score,
       m.score as marathon_score, m.scored_at as marathon_scored_at
     from marathon_members m join profiles p on p.user_id = m.user_id
     where m.marathon_id = $1`,
    [marathonId],
  );
  return result.rows;
}

/**
 * A runner as a board line. Both scores go out, with when they were sent, so
 * the board can draw the score falling between syncs. See liveScore in
 * src/lib/sync/marathon-rules.ts.
 */
function lineOf(
  row: MemberRow,
  viewer: string | null,
  badges: ReadonlyMap<string, Worn[]>,
): Record<string, unknown> {
  return {
    username: row.username,
    displayName: row.display_name,
    cardColor: row.card_color,
    score: row.marathon_score,
    endScore: row.end_score,
    scoredAt: row.marathon_scored_at?.getTime() ?? null,
    enteredAt: row.entered_at?.getTime() ?? null,
    isAdmin: row.is_admin,
    isYou: row.user_id === viewer,
    badges: badges.get(row.user_id) ?? [],
  };
}

/** A marathon's times and settings, as every answer about it carries them. */
function headerOf(row: MarathonRow): Record<string, unknown> {
  return {
    id: row.marathon_id,
    name: row.name,
    startsAt: row.starts_at.getTime(),
    endsAt: row.ends_at.getTime(),
    allowsLateEntry: row.allows_late_entry,
    resultsDelay: row.results_delay_minutes,
  };
}

/** When it starts and ends, in epoch milliseconds, as the rules take them. */
function headerTimes(row: MarathonRow): { startsAt: number; endsAt: number } {
  return { startsAt: row.starts_at.getTime(), endsAt: row.ends_at.getTime() };
}

/** The board: runners only, since watchers are not in the race, and how many watch. */
async function boardOf(
  row: MarathonRow,
  viewer: string | null,
): Promise<{ runners: Record<string, unknown>[]; watchers: number }> {
  const members = await membersOf(row.marathon_id);
  const runners = members.filter((member) => member.entered_at !== null);
  const badges = await badgesFor(runners.map((member) => member.user_id));
  return {
    runners: runners.map((member) => lineOf(member, viewer, badges)),
    watchers: members.length - runners.length,
  };
}

function checkName(value: unknown): { name: string } | { problem: "invalid" | "offensive" } {
  if (typeof value !== "string") return { problem: "invalid" };
  const name = value.trim();
  const length = toCodePoints(name).length;
  if (length === 0 || length > MARATHON_NAME_MAX) return { problem: "invalid" };
  return isOffensiveName(name) ? { problem: "offensive" } : { name };
}

async function bodyOf(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

async function marathonById(marathonId: string): Promise<MarathonRow | null> {
  if (!isUuid(marathonId)) return null;
  const result = await pool.query<MarathonRow>("select * from marathons where marathon_id = $1", [
    marathonId,
  ]);
  return result.rows[0] ?? null;
}

interface Membership {
  readonly isAdmin: boolean;
  readonly enteredAt: Date | null;
}

async function membershipOf(marathonId: string, userId: string): Promise<Membership | null> {
  if (!isUuid(marathonId)) return null;
  const result = await pool.query<{ is_admin: boolean; entered_at: Date | null }>(
    "select is_admin, entered_at from marathon_members where marathon_id = $1 and user_id = $2",
    [marathonId, userId],
  );
  const row = result.rows[0];
  return row === undefined ? null : { isAdmin: row.is_admin, enteredAt: row.entered_at };
}

async function marathonsOfReader(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "select count(*) from marathon_members where user_id = $1",
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Admin only: the guard shared by every route that changes a marathon. */
async function adminOf(c: Context): Promise<{ userId: string; marathon: MarathonRow } | Response> {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const marathonId = c.req.param("id") ?? "";
  const membership = await membershipOf(marathonId, userId);
  if (membership === null) return refuse(c, "not-found");
  if (!membership.isAdmin) return refuse(c, "forbidden");
  const marathon = await marathonById(marathonId);
  if (marathon === null) return refuse(c, "not-found");
  return { userId, marathon };
}

/** Times sent as epoch milliseconds, or null when they are not numbers. */
function timesFrom(body: Record<string, unknown>): { startsAt: number; endsAt: number } | null {
  const { startsAt, endsAt } = body;
  if (typeof startsAt !== "number" || typeof endsAt !== "number") return null;
  return { startsAt, endsAt };
}

export const marathons = new Hono();

/**
 * Each runner's score now, falling in a straight line from their last sync to
 * their score at the end, and their place by it: liveScore in
 * src/lib/sync/marathon-rules.ts, in SQL, so a list of marathons can say the
 * caller's place in each without sending every board.
 */
const LIVE_PLACES = `
  with live as (
    select m.marathon_id, m.user_id,
      case
        when m.scored_at is null then 0
        when now() >= r.ends_at or m.scored_at >= r.ends_at then m.end_score
        else m.score + (m.end_score - m.score)
          * extract(epoch from now() - m.scored_at) / extract(epoch from r.ends_at - m.scored_at)
      end as live
    from marathon_members m join marathons r on r.marathon_id = m.marathon_id
    where m.entered_at is not null
  )
  select marathon_id, user_id,
    rank() over (partition by marathon_id order by round(live) desc) as place
  from live`;

/** The marathons the caller is in, newest first, with their place in each they run in. */
marathons.get("/marathons", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const result = await pool.query<
    MarathonRow & {
      is_admin: boolean;
      entered_at: Date | null;
      runner_count: string;
      place: string | null;
    }
  >(
    `with places as (${LIVE_PLACES})
     select r.*, m.is_admin, m.entered_at, p.place,
       (select count(*) from marathon_members a
        where a.marathon_id = r.marathon_id and a.entered_at is not null) as runner_count
     from marathon_members m
     join marathons r on r.marathon_id = m.marathon_id
     left join places p on p.marathon_id = m.marathon_id and p.user_id = m.user_id
     where m.user_id = $1
     order by r.starts_at desc`,
    [userId],
  );
  return c.json(
    result.rows.map((row) => ({
      ...headerOf(row),
      isAdmin: row.is_admin,
      isRunning: row.entered_at !== null,
      runnerCount: Number(row.runner_count),
      place: row.place === null ? null : Number(row.place),
    })),
  );
});

/**
 * Makes a marathon with the caller as its admin, running in it or watching,
 * and an invite that lasts as long as it does.
 */
marathons.post("/marathons", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body = await bodyOf(c);
  const checked = checkName(body.name);
  if ("problem" in checked) return refuse(c, checked.problem);
  const times = timesFrom(body);
  if (times === null || !isValidSchedule(times, Date.now())) return refuse(c, "invalid");
  if (
    typeof body.allowsLateEntry !== "boolean" ||
    typeof body.isRunning !== "boolean" ||
    !isResultsDelay(body.resultsDelay)
  ) {
    return refuse(c, "invalid");
  }
  if ((await marathonsOfReader(userId)) >= MARATHONS_PER_READER_MAX) return refuse(c, "limit");

  const id = await inTransaction(async (client) => {
    const created = await client.query<{ marathon_id: string }>(
      `insert into marathons
         (name, starts_at, ends_at, allows_late_entry, results_delay_minutes, invite_code)
       values ($1, $2, $3, $4, $5, $6) returning marathon_id`,
      [
        checked.name,
        new Date(times.startsAt),
        new Date(times.endsAt),
        body.allowsLateEntry,
        body.resultsDelay,
        randomCode(INVITE_CODE_LENGTH),
      ],
    );
    const marathonId = created.rows[0]?.marathon_id;
    if (marathonId === undefined) throw new Error("marathon was not created");
    await client.query(
      `insert into marathon_members (marathon_id, user_id, is_admin, entered_at)
       values ($1, $2, true, case when $3 then now() end)`,
      [marathonId, userId, body.isRunning],
    );
    return marathonId;
  });
  return c.json({ id }, 201);
});

/** One marathon's board, for anyone in it. The admin also gets the invite and display links. */
marathons.get("/marathons/:id", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const membership = await membershipOf(c.req.param("id"), userId);
  if (membership === null) return refuse(c, "not-found");
  const marathon = await marathonById(c.req.param("id"));
  if (marathon === null) return refuse(c, "not-found");
  return c.json({
    ...headerOf(marathon),
    ...(await boardOf(marathon, userId)),
    isAdmin: membership.isAdmin,
    isRunning: membership.enteredAt !== null,
    enteredAt: membership.enteredAt?.getTime() ?? null,
    inviteCode: membership.isAdmin ? marathon.invite_code : null,
    displayCode: membership.isAdmin ? marathon.display_code : null,
  });
});

/**
 * Admin only: the name and whether people may join late, any time. The
 * times only before it starts: moving a race under people already running
 * it would change what their score was measured against.
 */
marathons.patch("/marathons/:id", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const body = await bodyOf(c);
  const { marathon } = admin;
  const set: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown): void => {
    values.push(value);
    set.push(`${column} = $${String(values.length)}`);
  };

  if ("name" in body) {
    const checked = checkName(body.name);
    if ("problem" in checked) return refuse(c, checked.problem);
    add("name", checked.name);
  }
  if ("allowsLateEntry" in body) {
    if (typeof body.allowsLateEntry !== "boolean") return refuse(c, "invalid");
    add("allows_late_entry", body.allowsLateEntry);
  }
  if ("resultsDelay" in body) {
    // Until it ends: after that, runners have been told when the results come.
    if (Date.now() >= marathon.ends_at.getTime()) return refuse(c, "forbidden");
    if (!isResultsDelay(body.resultsDelay)) return refuse(c, "invalid");
    add("results_delay_minutes", body.resultsDelay);
  }
  if ("startsAt" in body || "endsAt" in body) {
    const now = Date.now();
    if (now >= marathon.starts_at.getTime()) return refuse(c, "forbidden");
    const times = timesFrom({ ...headerTimes(marathon), ...body });
    if (times === null || !isValidSchedule(times, now)) return refuse(c, "invalid");
    add("starts_at", new Date(times.startsAt));
    add("ends_at", new Date(times.endsAt));
  }
  if (set.length === 0) return refuse(c, "invalid");

  values.push(marathon.marathon_id);
  const updated = await pool.query<MarathonRow>(
    `update marathons set ${set.join(", ")} where marathon_id = $${String(values.length)} returning *`,
    values,
  );
  const row = updated.rows[0];
  return row === undefined ? refuse(c, "not-found") : c.json(headerOf(row));
});

marathons.delete("/marathons/:id", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  // Members, scores and every runner's track go with it, by cascade.
  await pool.query("delete from marathons where marathon_id = $1", [admin.marathon.marathon_id]);
  return c.body(null, 204);
});

/** A new invite link. The old one stops working. */
marathons.post("/marathons/:id/invite", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const code = randomCode(INVITE_CODE_LENGTH);
  await pool.query("update marathons set invite_code = $1 where marathon_id = $2", [
    code,
    admin.marathon.marathon_id,
  ]);
  return c.json({ code });
});

marathons.delete("/marathons/:id/invite", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  await pool.query("update marathons set invite_code = null where marathon_id = $1", [
    admin.marathon.marathon_id,
  ]);
  return c.body(null, 204);
});

/** A new display link. The old one stops working. */
marathons.post("/marathons/:id/display", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const code = randomCode(DISPLAY_CODE_LENGTH);
  await pool.query("update marathons set display_code = $1 where marathon_id = $2", [
    code,
    admin.marathon.marathon_id,
  ]);
  return c.json({ code });
});

marathons.delete("/marathons/:id/display", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  await pool.query("update marathons set display_code = null where marathon_id = $1", [
    admin.marathon.marathon_id,
  ]);
  return c.body(null, 204);
});

/**
 * A watcher starts running, while the marathon lets people in. They start
 * from nothing like everyone else, from now.
 */
marathons.post("/marathons/:id/entry", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const membership = await membershipOf(c.req.param("id"), userId);
  const marathon = await marathonById(c.req.param("id"));
  if (membership === null || marathon === null) return refuse(c, "not-found");
  if (membership.enteredAt !== null) return c.json({ enteredAt: membership.enteredAt.getTime() });
  if (
    !canEnter({ ...headerTimes(marathon), allowsLateEntry: marathon.allows_late_entry }, Date.now())
  ) {
    return refuse(c, "expired");
  }
  const updated = await pool.query<{ entered_at: Date }>(
    `update marathon_members set entered_at = now()
     where marathon_id = $1 and user_id = $2 and entered_at is null returning entered_at`,
    [marathon.marathon_id, userId],
  );
  const enteredAt = updated.rows[0]?.entered_at;
  return enteredAt === undefined
    ? refuse(c, "not-found")
    : c.json({ enteredAt: enteredAt.getTime() });
});

/** Admin only: removes someone, and their track and score with them. */
marathons.delete("/marathons/:id/members/:username", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const removed = await pool.query(
    `delete from marathon_members m using profiles p
     where m.marathon_id = $1 and m.user_id = p.user_id and p.username = $2 and m.user_id <> $3`,
    [admin.marathon.marathon_id, normaliseUsername(c.req.param("username")), admin.userId],
  );
  return removed.rowCount === 0 ? refuse(c, "not-found") : c.body(null, 204);
});

/**
 * The caller leaves, with their track and score. An admin may leave too:
 * whoever joined earliest takes over, and an empty marathon is deleted, by
 * the trigger in drizzle/migrations/0027_marathons.sql.
 */
marathons.delete("/marathons/:id/membership", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const marathonId = c.req.param("id");
  if (!isUuid(marathonId)) return refuse(c, "not-found");
  await pool.query("delete from marathon_members where marathon_id = $1 and user_id = $2", [
    marathonId,
    userId,
  ]);
  return c.body(null, 204);
});

interface InviteRow extends MarathonRow {
  member_count: string;
  runner_count: string;
  is_member: boolean;
  is_runner: boolean;
}

async function inviteFor(code: string, viewer: string | null): Promise<InviteRow | null> {
  if (!isCode(code, INVITE_CODE_LENGTH)) return null;
  const result = await pool.query<InviteRow>(
    `select r.*,
       (select count(*) from marathon_members m where m.marathon_id = r.marathon_id) as member_count,
       (select count(*) from marathon_members m
        where m.marathon_id = r.marathon_id and m.entered_at is not null) as runner_count,
       exists (select 1 from marathon_members m
               where m.marathon_id = r.marathon_id and m.user_id = $2) as is_member,
       exists (select 1 from marathon_members m
               where m.marathon_id = r.marathon_id and m.user_id = $2 and m.entered_at is not null)
         as is_runner
     from marathons r where r.invite_code = $1`,
    [code, viewer ?? ""],
  );
  return result.rows[0] ?? null;
}

/**
 * What an invite leads to, for the page it opens. Anyone may ask, so someone
 * not signed in yet sees what they are about to join, and whether they could
 * still run or only watch.
 */
marathons.get("/marathon-invites/:code", async (c) => {
  const viewer = await readerOf(c.req.raw);
  const invite = await inviteFor(c.req.param("code"), viewer);
  if (invite === null) return refuse(c, "not-found");
  return c.json({
    ...headerOf(invite),
    runnerCount: Number(invite.runner_count),
    canEnter: canEnter(
      { ...headerTimes(invite), allowsLateEntry: invite.allows_late_entry },
      Date.now(),
    ),
    isMember: invite.is_member,
    isRunning: invite.is_runner,
  });
});

/**
 * Joins through an invite, to run or to watch. Running is refused once the
 * marathon no longer lets people in; watching never is. Someone already in
 * it who now asks to run is entered, as /entry does.
 */
marathons.post("/marathon-invites/:code", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const as = (await bodyOf(c)).as;
  if (as !== "runner" && as !== "watcher") return refuse(c, "invalid");
  const invite = await inviteFor(c.req.param("code"), userId);
  if (invite === null) return refuse(c, "not-found");
  const isRunning = as === "runner";
  if (
    isRunning &&
    !canEnter({ ...headerTimes(invite), allowsLateEntry: invite.allows_late_entry }, Date.now())
  ) {
    return refuse(c, "expired");
  }

  if (!invite.is_member) {
    if (Number(invite.member_count) >= MARATHON_MEMBERS_MAX) return refuse(c, "limit");
    if ((await marathonsOfReader(userId)) >= MARATHONS_PER_READER_MAX) return refuse(c, "limit");
    // A reader who has never synced has no profile, and a member row needs one.
    const hasProfile = await pool.query("select 1 from profiles where user_id = $1", [userId]);
    if (hasProfile.rowCount === 0) return refuse(c, "not-found");
  }
  await pool.query(
    `insert into marathon_members (marathon_id, user_id, entered_at)
     values ($1, $2, case when $3 then now() end)
     on conflict (marathon_id, user_id) do update
       set entered_at = coalesce(marathon_members.entered_at, excluded.entered_at)`,
    [invite.marathon_id, userId, isRunning],
  );
  return c.json({ id: invite.marathon_id }, invite.is_member ? 200 : 201);
});

/** The board for a screen: read-only, no sign-in, the names and scores runners already show. */
marathons.get("/marathon-display/:code", async (c) => {
  const code = c.req.param("code");
  if (!isCode(code, DISPLAY_CODE_LENGTH)) return refuse(c, "not-found");
  const result = await pool.query<MarathonRow>("select * from marathons where display_code = $1", [
    code,
  ]);
  const marathon = result.rows[0];
  if (marathon === undefined) return refuse(c, "not-found");
  return c.json({ ...headerOf(marathon), ...(await boardOf(marathon, null)) });
});
