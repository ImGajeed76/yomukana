CREATE INDEX "friends_by_followee" ON "friends" USING btree ("followee_id");--> statement-breakpoint

-- The merge-rule triggers (0001) use only built-ins, which Postgres always
-- finds in pg_catalog. Pinning an empty search path means nothing a caller
-- sets can change what a name in them refers to.
ALTER FUNCTION stamp_updated_at() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION keep_newest_review() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION keep_first_record() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION keep_most_read_inputs() SET search_path = '';
