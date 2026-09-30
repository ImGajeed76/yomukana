-- Achievements: who may read which, and wearing them beside group badges.
--
-- The achievements table is closed to the Data API like the group tables:
-- only the API function may say a reader earned something. What is worn is
-- read through the same two views as before, which now carry seals too, as
-- two new columns at the end so every reader of the old columns keeps
-- working. A worn badge has emoji, tag and colour and no seal; a worn seal
-- has its id and when it was earned and nothing else.

REVOKE ALL ON achievements FROM authenticated, anonymous;
--> statement-breakpoint

CREATE OR REPLACE VIEW worn_badges AS
SELECT
  b.user_id,
  b.position,
  g.badge_emoji AS emoji,
  g.badge_tag AS tag,
  g.badge_color AS color,
  NULL::text AS seal,
  NULL::timestamptz AS earned_at
FROM profile_badges b
JOIN groups g ON g.group_id = b.group_id
WHERE g.badge_tag IS NOT NULL
UNION ALL
SELECT
  b.user_id,
  b.position,
  NULL::text,
  NULL::text,
  NULL::text,
  a.achievement_id,
  a.earned_at
FROM profile_badges b
JOIN achievements a ON a.user_id = b.user_id AND a.achievement_id = b.achievement_id;
--> statement-breakpoint

CREATE OR REPLACE VIEW followed_badges AS
SELECT w.user_id, w.position, w.emoji, w.tag, w.color, w.seal, w.earned_at
FROM worn_badges w
WHERE w.user_id = (SELECT auth.user_id())
   OR w.user_id IN (SELECT f.followee_id FROM friends f WHERE f.follower_id = (SELECT auth.user_id()));
