-- Where everyone stands on each board, worked out by Postgres rather than by
-- the app fetching whole boards to count places in them.
--
-- Plain views, not materialized ones: ranks change whenever anyone syncs, and
-- at this size working them out on each read costs milliseconds, less than
-- keeping a stored copy fresh would. The API function only ever reads these
-- views, so if they ever get slow, either can become a materialized view or a
-- table kept up to date by triggers without the function or the app changing.
--
-- Ranks share places on equal scores, 1, 1, 3, the same as src/lib/sync/board.ts.

-- Every member of every group, with their place in it and the group's size.
CREATE VIEW group_standings AS
SELECT
  m.group_id,
  m.user_id,
  m.role,
  m.joined_at,
  p.score,
  rank() OVER (PARTITION BY m.group_id ORDER BY p.score DESC) AS rank,
  count(*) OVER (PARTITION BY m.group_id) AS member_count
FROM group_members m
JOIN profiles p ON p.user_id = m.user_id;
--> statement-breakpoint

-- Everyone on the global board, with their place and how many are on it.
CREATE VIEW global_standings AS
SELECT
  p.user_id,
  p.score,
  rank() OVER (ORDER BY p.score DESC) AS rank,
  count(*) OVER () AS listed_count
FROM profiles p
WHERE p.is_listed;
--> statement-breakpoint

-- Read by the API function only, like the tables they are built from.
REVOKE ALL ON group_standings, global_standings FROM authenticated, anonymous;
