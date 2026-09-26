-- Names and profiles are written by the API function, never straight from the
-- browser, so the name filter and the rules there cannot be stepped around by
-- talking to the Data API directly. The function connects as the database
-- owner and scopes every write to the signed-in reader itself.
--
-- A signed-in reader can still read their own profile and the profiles they
-- follow, as before, and still send their own score, until score submission
-- moves into the function as well.
REVOKE INSERT, UPDATE ON profiles FROM authenticated;
--> statement-breakpoint
GRANT UPDATE (score, scored_at) ON profiles TO authenticated;
