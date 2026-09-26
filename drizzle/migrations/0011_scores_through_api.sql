-- Scores go through the API function now, which checks each one against how
-- fast a real reader can possibly improve before accepting it. So the Data
-- API may no longer write a score at all, and the log the checks read is
-- closed to it too. See functions/api/scores.ts.
REVOKE UPDATE (score, scored_at) ON profiles FROM authenticated;
--> statement-breakpoint
REVOKE ALL ON score_submissions FROM authenticated, anonymous;
--> statement-breakpoint

-- The global board reads the best listed scores, so it gets an index that
-- holds only the listed ones.
CREATE INDEX profiles_listed_by_score ON profiles (score DESC) WHERE is_listed;
