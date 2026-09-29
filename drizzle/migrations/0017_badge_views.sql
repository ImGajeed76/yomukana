-- Group badges: who may read which.
--
-- Worn badges are shown on the card at /@username, which anyone can open, and
-- on every board. The table itself stays closed to the Data API like the group
-- tables; what may be read goes through these two views.

REVOKE ALL ON profile_badges FROM authenticated, anonymous;
--> statement-breakpoint

-- Every badge anyone wears, in the order they chose. Only the emoji, tag and
-- colour: never the group's name, which stays inside the group. A badge its
-- group has taken back is not shown, even for the moment before the function
-- clears it away. Read by the API function only.
CREATE VIEW worn_badges AS
SELECT
  b.user_id,
  b.position,
  g.badge_emoji AS emoji,
  g.badge_tag AS tag,
  g.badge_color AS color
FROM profile_badges b
JOIN groups g ON g.group_id = b.group_id
WHERE g.badge_emoji IS NOT NULL;
--> statement-breakpoint

REVOKE ALL ON worn_badges FROM authenticated, anonymous;
--> statement-breakpoint

-- The same, for the following board, which reads profiles straight through the
-- Data API: the badges of the reader and of the people they follow, the same
-- people whose profiles they can read. A view runs as its owner, so it can see
-- past the closed tables, and this WHERE clause is its whole rule.
CREATE VIEW followed_badges AS
SELECT w.user_id, w.position, w.emoji, w.tag, w.color
FROM worn_badges w
WHERE w.user_id = (SELECT auth.user_id())
   OR w.user_id IN (SELECT f.followee_id FROM friends f WHERE f.follower_id = (SELECT auth.user_id()));
--> statement-breakpoint

REVOKE ALL ON followed_badges FROM anonymous;
--> statement-breakpoint
GRANT SELECT ON followed_badges TO authenticated;
