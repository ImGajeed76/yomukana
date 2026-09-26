-- The score changed formula and scale (see src/lib/stats/score.ts): what used
-- to be about 20,000 for a steady learner is now about 2,000, and no rule
-- turns one into the other. A board mixing the two would rank people by
-- which app they last synced from, and a best score on the old scale would
-- hold every reader's checks against a number they can never reach again.
-- So the synced scores start over. Nothing on any reader's device changes:
-- their next sync sends their score on the new scale.
UPDATE profiles SET score = 0, scored_at = NULL, peak_score = 0, peak_at = NULL;
--> statement-breakpoint
DELETE FROM score_submissions;
