// Groups: readers who all see each other on one board.
//
// Everything about a group goes through here, because every part of it is a
// rule about who may do what: only members see the board, only the admin
// invites and removes, an invite stops working when it expires. The tables
// are closed to the Data API entirely. See drizzle/schema.ts.

import { Hono, type Context } from "hono";
import type { PoolClient } from "pg";
import { toCodePoints } from "../../src/lib/japanese/text";
import {
  DEFAULT_INVITE_DAYS,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  GROUPS_PER_READER_MAX,
  isInviteDays,
} from "../../src/lib/sync/group-rules";
import { normaliseUsername } from "../../src/lib/sync/username";
import { readerOf } from "./auth";
import { DISPLAY_CODE_LENGTH, INVITE_CODE_LENGTH, isCode, isUuid, randomCode } from "./codes";
import { pool } from "./db";
import { isOffensiveName } from "./names";
import { refuse } from "./problems";
import type { ProfileRow } from "./profiles";

type Role = "admin" | "member";

interface GroupRow {
  group_id: string;
  name: string;
  invite_code: string | null;
  invite_expires_at: Date | null;
  display_code: string | null;
}

interface MemberRow extends ProfileRow {
  role: Role;
}

const DAY_MS = 86_400_000;

/** The member rows of a group with the profile each one shows. */
async function membersOf(groupId: string): Promise<MemberRow[]> {
  const result = await pool.query<MemberRow>(
    `select p.*, m.role from group_members m
     join profiles p on p.user_id = m.user_id
     where m.group_id = $1`,
    [groupId],
  );
  return result.rows;
}

/** A member as a board line. Ids stay on the server: the username is enough to link to them. */
function lineOf(row: MemberRow, viewer: string | null): Record<string, unknown> {
  return {
    username: row.username,
    displayName: row.display_name,
    cardColor: row.card_color,
    score: row.score,
    scoredAt: row.scored_at === null ? null : row.scored_at.getTime(),
    role: row.role,
    isYou: row.user_id === viewer,
  };
}

/** The invite, while it works, for the admin to show and share. */
function inviteOf(group: GroupRow): Record<string, unknown> | null {
  if (group.invite_code === null || group.invite_expires_at === null) return null;
  if (group.invite_expires_at.getTime() <= Date.now()) return null;
  return { code: group.invite_code, expiresAt: group.invite_expires_at.getTime() };
}

/** A group's name, trimmed and checked, or why it will not do. */
function checkName(value: unknown): { name: string } | { problem: "invalid" | "offensive" } {
  if (typeof value !== "string") return { problem: "invalid" };
  const name = value.trim();
  const length = toCodePoints(name).length;
  if (length === 0 || length > GROUP_NAME_MAX) return { problem: "invalid" };
  return isOffensiveName(name) ? { problem: "offensive" } : { name };
}

async function bodyOf(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** The caller's role in a group, or null when they are not in it or the id is not one. */
async function roleIn(groupId: string, userId: string): Promise<Role | null> {
  if (!isUuid(groupId)) return null;
  const result = await pool.query<{ role: Role }>(
    "select role from group_members where group_id = $1 and user_id = $2",
    [groupId, userId],
  );
  return result.rows[0]?.role ?? null;
}

async function groupsOfReader(userId: string, client: PoolClient | null = null): Promise<number> {
  const result = await (client ?? pool).query<{ count: string }>(
    "select count(*) from group_members where user_id = $1",
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Runs `work` in one transaction, so a group is never left half made. */
async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // Whatever goes wrong, the transaction is rolled back and the connection
  // returned, then the error goes on to Hono, which answers 500.
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const groups = new Hono();

/** The groups the caller is in, for the list of boards. */
groups.get("/groups", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const result = await pool.query<{
    group_id: string;
    name: string;
    role: Role;
    member_count: string;
  }>(
    `select g.group_id, g.name, m.role,
       (select count(*) from group_members all_m where all_m.group_id = g.group_id) as member_count
     from group_members m join groups g on g.group_id = m.group_id
     where m.user_id = $1
     order by m.joined_at`,
    [userId],
  );
  return c.json(
    result.rows.map((row) => ({
      id: row.group_id,
      name: row.name,
      role: row.role,
      memberCount: Number(row.member_count),
    })),
  );
});

/** Makes a group with the caller as its admin, and a first invite. */
groups.post("/groups", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const checked = checkName((await bodyOf(c)).name);
  if ("problem" in checked) return refuse(c, checked.problem);
  const { name } = checked;
  if ((await groupsOfReader(userId)) >= GROUPS_PER_READER_MAX) return refuse(c, "limit");

  const id = await inTransaction(async (client) => {
    const created = await client.query<{ group_id: string }>(
      `insert into groups (name, invite_code, invite_expires_at)
       values ($1, $2, now() + make_interval(days => $3)) returning group_id`,
      [name, randomCode(INVITE_CODE_LENGTH), DEFAULT_INVITE_DAYS],
    );
    const groupId = created.rows[0]?.group_id;
    if (groupId === undefined) throw new Error("group was not created");
    await client.query(
      "insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')",
      [groupId, userId],
    );
    return groupId;
  });
  return c.json({ id }, 201);
});

/**
 * One group's board, for its members. The admin also gets the invite and
 * display links, which only they can share or change.
 */
groups.get("/groups/:id", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const groupId = c.req.param("id");
  const role = await roleIn(groupId, userId);
  if (role === null) return refuse(c, "not-found");

  const [group, members] = await Promise.all([
    pool.query<GroupRow>("select * from groups where group_id = $1", [groupId]),
    membersOf(groupId),
  ]);
  const row = group.rows[0];
  if (row === undefined) return refuse(c, "not-found");
  const isAdmin = role === "admin";
  return c.json({
    id: row.group_id,
    name: row.name,
    role,
    members: members.map((member) => lineOf(member, userId)),
    invite: isAdmin ? inviteOf(row) : null,
    displayCode: isAdmin ? row.display_code : null,
  });
});

/** Admin only: the admin's own guard, shared by every route that changes a group. */
async function adminOf(c: Context): Promise<{ userId: string; groupId: string } | Response> {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const groupId = c.req.param("id") ?? "";
  const role = await roleIn(groupId, userId);
  if (role === null) return refuse(c, "not-found");
  if (role !== "admin") return refuse(c, "forbidden");
  return { userId, groupId };
}

groups.patch("/groups/:id", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const checked = checkName((await bodyOf(c)).name);
  if ("problem" in checked) return refuse(c, checked.problem);
  const { name } = checked;
  await pool.query("update groups set name = $1 where group_id = $2", [name, admin.groupId]);
  return c.json({ name });
});

groups.delete("/groups/:id", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  // The members go with it, by cascade.
  await pool.query("delete from groups where group_id = $1", [admin.groupId]);
  return c.body(null, 204);
});

/**
 * A new invite link. The old one stops working. With `days` it lasts that
 * long. Without, it replaces a leaked link and keeps its end, so replacing
 * does not also cut short a link the admin just set to last a month.
 */
groups.post("/groups/:id/invite", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const days = (await bodyOf(c)).days;
  if (days !== undefined && !isInviteDays(days)) return refuse(c, "invalid");
  const code = randomCode(INVITE_CODE_LENGTH);
  const updated = await pool.query<{ invite_expires_at: Date }>(
    `update groups set invite_code = $1,
       invite_expires_at = case
         when $2::int is null and invite_expires_at > now() then invite_expires_at
         else now() + make_interval(days => coalesce($2::int, $3::int))
       end
     where group_id = $4
     returning invite_expires_at`,
    [code, days ?? null, DEFAULT_INVITE_DAYS, admin.groupId],
  );
  const expiresAt = updated.rows[0]?.invite_expires_at;
  if (expiresAt === undefined) return refuse(c, "not-found");
  return c.json({ code, expiresAt: expiresAt.getTime() });
});

/**
 * Moves when the invite ends, to 1, 7 or 30 days from now, and keeps the
 * link itself, so a link already sent round keeps working. Only a link that
 * is still working can be moved: an ended one is replaced instead.
 */
groups.patch("/groups/:id/invite", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const days = (await bodyOf(c)).days;
  if (!isInviteDays(days)) return refuse(c, "invalid");
  const expiresAt = new Date(Date.now() + days * DAY_MS);
  const updated = await pool.query<{ invite_code: string }>(
    `update groups set invite_expires_at = $1
     where group_id = $2 and invite_code is not null and invite_expires_at > now()
     returning invite_code`,
    [expiresAt, admin.groupId],
  );
  const code = updated.rows[0]?.invite_code;
  if (code === undefined) return refuse(c, "not-found");
  return c.json({ code, expiresAt: expiresAt.getTime() });
});

groups.delete("/groups/:id/invite", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  await pool.query(
    "update groups set invite_code = null, invite_expires_at = null where group_id = $1",
    [admin.groupId],
  );
  return c.body(null, 204);
});

/** A new display link. The old one stops working. */
groups.post("/groups/:id/display", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const code = randomCode(DISPLAY_CODE_LENGTH);
  await pool.query("update groups set display_code = $1 where group_id = $2", [
    code,
    admin.groupId,
  ]);
  return c.json({ code });
});

groups.delete("/groups/:id/display", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  await pool.query("update groups set display_code = null where group_id = $1", [admin.groupId]);
  return c.body(null, 204);
});

/**
 * Admin only: removes someone. They are not told, and can come back only with
 * an invite that still works, so an admin who wants them gone for good makes
 * a new invite after.
 */
groups.delete("/groups/:id/members/:username", async (c) => {
  const admin = await adminOf(c);
  if (admin instanceof Response) return admin;
  const removed = await pool.query<{ user_id: string }>(
    `delete from group_members m using profiles p
     where m.group_id = $1 and m.user_id = p.user_id and p.username = $2 and m.user_id <> $3
     returning m.user_id`,
    [admin.groupId, normaliseUsername(c.req.param("username")), admin.userId],
  );
  return removed.rowCount === 0 ? refuse(c, "not-found") : c.body(null, 204);
});

/**
 * The caller leaves. An admin may leave too: the member who joined earliest
 * becomes admin, and a group left empty is deleted. A trigger does both, so
 * it also holds when someone deletes their whole account.
 */
groups.delete("/groups/:id/membership", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const groupId = c.req.param("id");
  if (!isUuid(groupId)) return refuse(c, "not-found");
  await pool.query("delete from group_members where group_id = $1 and user_id = $2", [
    groupId,
    userId,
  ]);
  return c.body(null, 204);
});

interface InviteRow {
  group_id: string;
  name: string;
  invite_expires_at: Date;
  member_count: string;
  is_member: boolean;
}

/** The group an invite leads to, while it works. */
async function inviteFor(
  code: string,
  viewer: string | null,
): Promise<InviteRow | "expired" | null> {
  if (!isCode(code, INVITE_CODE_LENGTH)) return null;
  const result = await pool.query<InviteRow>(
    `select g.group_id, g.name, g.invite_expires_at,
       (select count(*) from group_members m where m.group_id = g.group_id) as member_count,
       exists (select 1 from group_members m where m.group_id = g.group_id and m.user_id = $2)
         as is_member
     from groups g where g.invite_code = $1`,
    [code, viewer ?? ""],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return row.invite_expires_at.getTime() <= Date.now() ? "expired" : row;
}

/**
 * What an invite leads to, for the page a scanned code opens. Anyone may ask,
 * so someone who is not signed in yet sees what they are about to join.
 */
groups.get("/join/:code", async (c) => {
  const viewer = await readerOf(c.req.raw);
  const invite = await inviteFor(c.req.param("code"), viewer);
  if (invite === null) return refuse(c, "not-found");
  if (invite === "expired") return refuse(c, "expired");
  return c.json({
    id: invite.group_id,
    name: invite.name,
    memberCount: Number(invite.member_count),
    isMember: invite.is_member,
  });
});

groups.post("/join/:code", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const invite = await inviteFor(c.req.param("code"), userId);
  if (invite === null) return refuse(c, "not-found");
  if (invite === "expired") return refuse(c, "expired");
  if (invite.is_member) return c.json({ id: invite.group_id });
  if (Number(invite.member_count) >= GROUP_MEMBERS_MAX) return refuse(c, "limit");
  if ((await groupsOfReader(userId)) >= GROUPS_PER_READER_MAX) return refuse(c, "limit");

  // A reader who has never synced has no profile, and a member row needs one.
  const hasProfile = await pool.query("select 1 from profiles where user_id = $1", [userId]);
  if (hasProfile.rowCount === 0) return refuse(c, "not-found");
  await pool.query(
    `insert into group_members (group_id, user_id) values ($1, $2)
     on conflict do nothing`,
    [invite.group_id, userId],
  );
  return c.json({ id: invite.group_id }, 201);
});

/**
 * A board for a screen in a classroom: read-only, and no sign-in, because the
 * screen belongs to nobody. Only the names and scores the members already
 * show each other.
 */
groups.get("/display/:code", async (c) => {
  const code = c.req.param("code");
  if (!isCode(code, DISPLAY_CODE_LENGTH)) return refuse(c, "not-found");
  const group = await pool.query<GroupRow>("select * from groups where display_code = $1", [code]);
  const row = group.rows[0];
  if (row === undefined) return refuse(c, "not-found");
  const members = await membersOf(row.group_id);
  return c.json({ name: row.name, members: members.map((member) => lineOf(member, null)) });
});
