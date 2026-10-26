ALTER TABLE "marathon_score_submissions" ADD COLUMN "best" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "score_submissions" ADD COLUMN "best" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Rows already there get the best among the reader's rows up to them, and
-- their recorded peak from the moment of that peak on. Rows deleted before
-- this ran are gone, so this is a floor, and the next new best fixes it.
UPDATE "score_submissions" s SET "best" = r.best
FROM (
  SELECT user_id, accepted_at, max(score) OVER (PARTITION BY user_id ORDER BY accepted_at) AS best
  FROM "score_submissions"
) r
WHERE r.user_id = s.user_id AND r.accepted_at = s.accepted_at;--> statement-breakpoint
UPDATE "score_submissions" s SET "best" = greatest(s.best, p.peak_score)
FROM "profiles" p
WHERE p.user_id = s.user_id AND p.peak_at IS NOT NULL AND s.accepted_at >= p.peak_at;--> statement-breakpoint
UPDATE "marathon_score_submissions" s SET "best" = r.best
FROM (
  SELECT marathon_id, user_id, accepted_at,
    max(score) OVER (PARTITION BY marathon_id, user_id ORDER BY accepted_at) AS best
  FROM "marathon_score_submissions"
) r
WHERE r.marathon_id = s.marathon_id AND r.user_id = s.user_id AND r.accepted_at = s.accepted_at;--> statement-breakpoint
UPDATE "marathon_score_submissions" s SET "best" = greatest(s.best, m.peak_score)
FROM "marathon_members" m
WHERE m.marathon_id = s.marathon_id AND m.user_id = s.user_id
  AND m.peak_at IS NOT NULL AND s.accepted_at >= m.peak_at;