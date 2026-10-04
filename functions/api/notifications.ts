// Push notifications: a reminder when a reader's day is not done yet, and
// nudges from friends, people who follow each other. Both only for a reader
// who said yes on a device, and both through the browser maker's push
// service, which sees an encrypted message and where to deliver it, nothing
// else.
//
// A reminder goes out at the reader's own time in their own time zone, once
// a day at most, and only if today's goal is not met. A nudge goes to a
// friend whose streak is at risk today, from their afternoon on, once a day
// from each person at most, and never to someone who said no.

import { Hono, type Context } from "hono";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import webpush from "web-push";
import { m } from "../../src/lib/paraglide/messages.js";
import { DAY_GOAL } from "../../src/lib/stats/streak";
import { normaliseUsername } from "../../src/lib/sync/username";
import { readerOf } from "./auth";
import { pool } from "./db";
import { refuse } from "./problems";

type Locale = "en" | "de" | "ja";

const LOCALES: readonly Locale[] = ["en", "de", "ja"];

/** A reader's afternoon starts here: no nudges before it, in their time zone. */
const NUDGE_FROM_HOUR = 14;

/** Friends shown to nudge at once. */
const NUDGEABLE_MAX = 3;

/** For the follow list: more than anyone follows back, as a bound on one query. */
const FOLLOW_LIST_MAX = 200;

/** How wide a quarter-hour schedule tick reaches: reminders due in it go out. */
const TICK_MINUTES = 15;

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
webpush.setVapidDetails("https://yomukana.app", PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY ?? "");

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

function isTimeZone(value: unknown): value is string {
  return typeof value === "string" && Intl.supportedValuesOf("timeZone").includes(value);
}

/**
 * A reader's reading day, today, as Postgres reckons it in their time zone:
 * the date four hours ago, local, so it turns at 4 am as the streak does.
 */
const TODAY_IN = (zone: string): string =>
  `((now() at time zone ${zone}) - interval '4 hours')::date`;

/** Sentences a reader finished on their reading day today, in marathons too. */
const READ_TODAY = (user: string, zone: string): string =>
  `(select count(*) from (
       select finished_at from attempts where user_id = ${user}
       union all
       select finished_at from marathon_attempts where user_id = ${user}
     ) a
     where ((a.finished_at at time zone ${zone}) - interval '4 hours')::date = ${TODAY_IN(zone)})`;

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Push {
  readonly title: string;
  readonly body: string;
  /** Replaces an earlier notification of the same kind rather than piling up. */
  readonly tag: string;
}

/**
 * Sends one message to every device a reader said yes on, and says how many
 * push services took it. A device the push service says is gone is
 * forgotten, so it is not tried again.
 */
async function pushTo(userId: string, push: Push): Promise<number> {
  const subscriptions = await pool.query<SubscriptionRow>(
    "select endpoint, p256dh, auth from push_subscriptions where user_id = $1",
    [userId],
  );
  let delivered = 0;
  await Promise.all(
    subscriptions.rows.map(async (row) => {
      const sent = await webpush
        .sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ ...push, url: "/" }),
        )
        .then(() => null)
        .catch((error: unknown) => error);
      const status =
        typeof sent === "object" && sent !== null && "statusCode" in sent ? sent.statusCode : null;
      if (sent === null) {
        delivered += 1;
      } else if (status === 404 || status === 410) {
        await pool.query("delete from push_subscriptions where endpoint = $1", [row.endpoint]);
      } else {
        console.error("push failed", status);
      }
    }),
  );
  return delivered;
}

async function bodyOf(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

export const notifications = new Hono();

/** The public half of the key pushes are signed with, which a browser needs to subscribe. */
notifications.get("/push/key", (c) => c.json({ publicKey: PUBLIC_KEY }));

/**
 * A test push to the caller's own devices, from the settings, so a reader
 * can see that pushes reach them. Says how many push services took it: none
 * means the problem is between the server and the push service, one or more
 * with nothing on screen means it is on the device. Only ever to the caller.
 */
notifications.post("/push/test", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const locale = await pool.query<{ locale: Locale }>(
    "select locale from notification_settings where user_id = $1",
    [userId],
  );
  const inLocale = { locale: locale.rows[0]?.locale ?? "en" };
  const delivered = await pushTo(userId, {
    title: m.push_test_title({}, inLocale),
    body: m.push_test_body({}, inLocale),
    tag: "test",
  });
  return c.json({ delivered });
});

/**
 * This device says yes: where to reach it, and the reader's time zone and
 * language, which the reminder is timed and written in.
 */
notifications.put("/push/subscription", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body = await bodyOf(c);
  const subscription = body.subscription as
    { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !isTimeZone(body.timeZone) ||
    !isLocale(body.locale)
  ) {
    return refuse(c, "invalid");
  }
  await pool.query(
    `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = $2, p256dh = $3, auth = $4`,
    [endpoint, userId, p256dh, auth],
  );
  await pool.query(
    `insert into notification_settings (user_id, time_zone, locale) values ($1, $2, $3)
     on conflict (user_id) do update set time_zone = $2, locale = $3`,
    [userId, body.timeZone, body.locale],
  );
  return c.body(null, 204);
});

/** This device says no again. */
notifications.delete("/push/subscription", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const endpoint = (await bodyOf(c)).endpoint;
  if (typeof endpoint !== "string") return refuse(c, "invalid");
  await pool.query("delete from push_subscriptions where endpoint = $1 and user_id = $2", [
    endpoint,
    userId,
  ]);
  return c.body(null, 204);
});

interface SettingsRow {
  is_reminder_on: boolean;
  reminder_minute: number;
  can_be_nudged: boolean;
  shows_nudges: boolean;
}

function settingsOf(row: SettingsRow | undefined): Record<string, unknown> {
  return {
    isReminderOn: row?.is_reminder_on ?? true,
    reminderMinute: row?.reminder_minute ?? 1140,
    canBeNudged: row?.can_be_nudged ?? true,
    showsNudges: row?.shows_nudges ?? true,
  };
}

notifications.get("/notifications", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const result = await pool.query<SettingsRow>(
    `select is_reminder_on, reminder_minute, can_be_nudged, shows_nudges
     from notification_settings where user_id = $1`,
    [userId],
  );
  return c.json(settingsOf(result.rows[0]));
});

/** Changes any of the four, leaving the rest as they are. */
notifications.patch("/notifications", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const body = await bodyOf(c);
  const { isReminderOn, reminderMinute, canBeNudged, showsNudges } = body;
  const isFlag = (value: unknown): boolean => value === undefined || typeof value === "boolean";
  if (
    !isFlag(isReminderOn) ||
    !isFlag(canBeNudged) ||
    !isFlag(showsNudges) ||
    (reminderMinute !== undefined &&
      (typeof reminderMinute !== "number" ||
        !Number.isInteger(reminderMinute) ||
        reminderMinute < 0 ||
        reminderMinute > 1439))
  ) {
    return refuse(c, "invalid");
  }
  const result = await pool.query<SettingsRow>(
    `insert into notification_settings (user_id, is_reminder_on, reminder_minute, can_be_nudged, shows_nudges)
     values ($1, coalesce($2, true), coalesce($3, 1140), coalesce($4, true), coalesce($5, true))
     on conflict (user_id) do update set
       is_reminder_on = coalesce($2, notification_settings.is_reminder_on),
       reminder_minute = coalesce($3, notification_settings.reminder_minute),
       can_be_nudged = coalesce($4, notification_settings.can_be_nudged),
       shows_nudges = coalesce($5, notification_settings.shows_nudges)
     returning is_reminder_on, reminder_minute, can_be_nudged, shows_nudges`,
    [
      userId,
      isReminderOn ?? null,
      reminderMinute ?? null,
      canBeNudged ?? null,
      showsNudges ?? null,
    ],
  );
  return c.json(settingsOf(result.rows[0]));
});

interface NudgeableRow {
  user_id: string;
  username: string;
  display_name: string | null;
  card_color: string;
  streak_days: number;
  locale: Locale;
}

/**
 * Friends of the caller who can be nudged right now, or the one named: they
 * follow each other,
 * a streak running, today not done, their afternoon, nudges allowed, a
 * device to reach, and not nudged by the caller today already.
 */
async function nudgeable(
  callerId: string,
  username: string | null,
  limit: number = NUDGEABLE_MAX,
): Promise<NudgeableRow[]> {
  const result = await pool.query<NudgeableRow>(
    `select p.user_id, p.username, p.display_name, p.card_color, p.streak_days, s.locale
     from friends f
     join profiles p on p.user_id = f.followee_id
     -- Friends both ways: following needs no approval, so a one-way follow
     -- would let a stranger nudge someone every day.
     join friends back on back.follower_id = p.user_id and back.followee_id = $1
     join notification_settings s on s.user_id = p.user_id and s.can_be_nudged
     where f.follower_id = $1
       and ($2::text is null or p.username = $2)
       and p.streak_days > 0 and p.streak_alive_until > now()
       and exists (select 1 from push_subscriptions ps where ps.user_id = p.user_id)
       and extract(hour from now() at time zone s.time_zone) >= $3
       and ${READ_TODAY("p.user_id", "s.time_zone")} < $4
       and not exists (
         select 1 from nudges n
         where n.from_user_id = $1 and n.to_user_id = p.user_id and n.day = ${TODAY_IN("s.time_zone")}
       )
     order by p.streak_days desc
     limit $5`,
    [callerId, username, NUDGE_FROM_HOUR, DAY_GOAL, limit],
  );
  return result.rows;
}

/**
 * Who the caller could nudge now. For the dialog after their own goal, the
 * few with the longest streaks, and nobody when they turned suggestions off.
 * With `?all`, for the follow list, every one of them: a button there is
 * something the reader goes looking for, not a suggestion put to them.
 */
notifications.get("/nudgeable", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const isAll = c.req.query("all") !== undefined;
  if (!isAll) {
    const own = await pool.query<{ shows_nudges: boolean }>(
      "select shows_nudges from notification_settings where user_id = $1",
      [userId],
    );
    if (own.rows[0]?.shows_nudges === false) return c.json([]);
  }
  const rows = await nudgeable(userId, null, isAll ? FOLLOW_LIST_MAX : NUDGEABLE_MAX);
  return c.json(
    rows.map((row) => ({
      username: row.username,
      displayName: row.display_name,
      cardColor: row.card_color,
      streak: row.streak_days,
    })),
  );
});

/** Nudges one of them. Refused when they could not be nudged right now. */
notifications.post("/nudge", async (c) => {
  const userId = await readerOf(c.req.raw);
  if (userId === null) return refuse(c, "unauthorized");
  const username = (await bodyOf(c)).username;
  if (typeof username !== "string") return refuse(c, "invalid");
  const target = (await nudgeable(userId, normaliseUsername(username)))[0];
  if (target === undefined) return refuse(c, "limit");

  const sender = await pool.query<{ username: string; display_name: string | null }>(
    "select username, display_name from profiles where user_id = $1",
    [userId],
  );
  const name = sender.rows[0]?.display_name ?? sender.rows[0]?.username ?? "";
  const inserted = await pool.query(
    `insert into nudges (from_user_id, to_user_id, day)
     select $1, $2, ${TODAY_IN("s.time_zone")} from notification_settings s where s.user_id = $2
     on conflict do nothing`,
    [userId, target.user_id],
  );
  // Two taps at once: the second finds the first's row and sends nothing.
  if (inserted.rowCount === 0) return refuse(c, "limit");

  const locale = target.locale;
  await pushTo(target.user_id, {
    title: m.push_nudge_title({ name }, { locale }),
    body: m.push_nudge_body({ days: String(target.streak_days) }, { locale }),
    tag: "nudge",
  });
  return c.body(null, 204);
});

interface DueRow {
  user_id: string;
  locale: Locale;
  streak_days: number;
  is_streak_alive: boolean;
  day: string;
}

/**
 * The quarter-hour schedule: everyone whose reminder time falls in this tick,
 * who has not been reminded today and has not met today's goal.
 */
notifications.post("/cron/reminders", async (c) => {
  const delivery = await parseTriggerDelivery(c.req.raw);
  if (!delivery.ok) return c.text(delivery.error, delivery.error === "invalid_body" ? 400 : 401);

  const due = await pool.query<DueRow>(
    `select * from (
       select s.user_id, s.locale, p.streak_days,
         (p.streak_alive_until is not null and p.streak_alive_until > now()) as is_streak_alive,
         ${TODAY_IN("s.time_zone")} as day,
         (extract(hour from now() at time zone s.time_zone) * 60
           + extract(minute from now() at time zone s.time_zone))::int as minute_now,
         s.reminder_minute, s.reminded_on, s.time_zone
       from notification_settings s
       join profiles p on p.user_id = s.user_id
       where s.is_reminder_on
         and exists (select 1 from push_subscriptions ps where ps.user_id = s.user_id)
     ) r
     where r.minute_now >= r.reminder_minute and r.minute_now < r.reminder_minute + $1
       and (r.reminded_on is null or r.reminded_on < r.day)
       and ${READ_TODAY("r.user_id", "r.time_zone")} < $2`,
    [TICK_MINUTES, DAY_GOAL],
  );

  await Promise.all(
    due.rows.map(async (row) => {
      // Marked first, so a slow push service cannot have the next tick send it twice.
      await pool.query("update notification_settings set reminded_on = $2 where user_id = $1", [
        row.user_id,
        row.day,
      ]);
      const { locale } = row;
      await pushTo(row.user_id, {
        title: m.push_reminder_title({}, { locale }),
        body:
          row.is_streak_alive && row.streak_days > 0
            ? m.push_reminder_body_streak({ days: String(row.streak_days) }, { locale })
            : m.push_reminder_body({}, { locale }),
        tag: "reminder",
      });
    }),
  );
  return c.json({ reminded: due.rows.length });
});
