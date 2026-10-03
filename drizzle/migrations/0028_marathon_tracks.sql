CREATE TABLE "marathon_attempts" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"marathon_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"record" jsonb NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marathon_attempts_user_id_marathon_id_attempt_id_pk" PRIMARY KEY("user_id","marathon_id","attempt_id")
);
--> statement-breakpoint
ALTER TABLE "marathon_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marathon_items" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"marathon_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marathon_items_user_id_marathon_id_item_id_pk" PRIMARY KEY("user_id","marathon_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "marathon_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marathon_readers" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"marathon_id" uuid NOT NULL,
	"model" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marathon_readers_user_id_marathon_id_pk" PRIMARY KEY("user_id","marathon_id")
);
--> statement-breakpoint
ALTER TABLE "marathon_readers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marathon_sessions" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"marathon_id" uuid NOT NULL,
	"record" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marathon_sessions_user_id_marathon_id_pk" PRIMARY KEY("user_id","marathon_id")
);
--> statement-breakpoint
ALTER TABLE "marathon_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marathon_attempts" ADD CONSTRAINT "marathon_attempts_member" FOREIGN KEY ("marathon_id","user_id") REFERENCES "public"."marathon_members"("marathon_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marathon_items" ADD CONSTRAINT "marathon_items_member" FOREIGN KEY ("marathon_id","user_id") REFERENCES "public"."marathon_members"("marathon_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marathon_readers" ADD CONSTRAINT "marathon_readers_member" FOREIGN KEY ("marathon_id","user_id") REFERENCES "public"."marathon_members"("marathon_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marathon_sessions" ADD CONSTRAINT "marathon_sessions_member" FOREIGN KEY ("marathon_id","user_id") REFERENCES "public"."marathon_members"("marathon_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marathon_attempts_changed" ON "marathon_attempts" USING btree ("user_id","marathon_id","updated_at");--> statement-breakpoint
CREATE INDEX "marathon_attempts_by_reader" ON "marathon_attempts" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE INDEX "marathon_items_changed" ON "marathon_items" USING btree ("user_id","marathon_id","updated_at");--> statement-breakpoint
CREATE POLICY "marathon_track_select" ON "marathon_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id()) = "marathon_attempts"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_delete" ON "marathon_attempts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id()) = "marathon_attempts"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_insert" ON "marathon_attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id()) = "marathon_attempts"."user_id" and marathon_open_for("marathon_attempts"."marathon_id", "marathon_attempts"."finished_at"));--> statement-breakpoint
CREATE POLICY "marathon_track_update" ON "marathon_attempts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id()) = "marathon_attempts"."user_id") WITH CHECK ((select auth.user_id()) = "marathon_attempts"."user_id" and marathon_open_for("marathon_attempts"."marathon_id", "marathon_attempts"."finished_at"));--> statement-breakpoint
CREATE POLICY "marathon_track_select" ON "marathon_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id()) = "marathon_items"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_delete" ON "marathon_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id()) = "marathon_items"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_insert" ON "marathon_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id()) = "marathon_items"."user_id" and marathon_open_for("marathon_items"."marathon_id", "marathon_items"."reviewed_at"));--> statement-breakpoint
CREATE POLICY "marathon_track_update" ON "marathon_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id()) = "marathon_items"."user_id") WITH CHECK ((select auth.user_id()) = "marathon_items"."user_id" and marathon_open_for("marathon_items"."marathon_id", "marathon_items"."reviewed_at"));--> statement-breakpoint
CREATE POLICY "marathon_track_select" ON "marathon_readers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id()) = "marathon_readers"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_delete" ON "marathon_readers" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id()) = "marathon_readers"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_insert" ON "marathon_readers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id()) = "marathon_readers"."user_id" and marathon_open_for("marathon_readers"."marathon_id", null));--> statement-breakpoint
CREATE POLICY "marathon_track_update" ON "marathon_readers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id()) = "marathon_readers"."user_id") WITH CHECK ((select auth.user_id()) = "marathon_readers"."user_id" and marathon_open_for("marathon_readers"."marathon_id", null));--> statement-breakpoint
CREATE POLICY "marathon_track_select" ON "marathon_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id()) = "marathon_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_delete" ON "marathon_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id()) = "marathon_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "marathon_track_insert" ON "marathon_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id()) = "marathon_sessions"."user_id" and marathon_open_for("marathon_sessions"."marathon_id", null));--> statement-breakpoint
CREATE POLICY "marathon_track_update" ON "marathon_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id()) = "marathon_sessions"."user_id") WITH CHECK ((select auth.user_id()) = "marathon_sessions"."user_id" and marathon_open_for("marathon_sessions"."marathon_id", null));--> statement-breakpoint

-- Reached through the Data API like the reader's own progress, under the
-- row-level rules above.
GRANT SELECT, INSERT, UPDATE, DELETE ON marathon_items, marathon_attempts, marathon_readers, marathon_sessions TO authenticated;
--> statement-breakpoint

-- The same merge rules as the reader's own tables (0001, 0004): newest review
-- wins, a finished sentence is never rewritten, each input kept from the copy
-- that has read more, every change stamped with the server's clock.
CREATE TRIGGER marathon_items_1_keep_newest BEFORE UPDATE ON marathon_items
  FOR EACH ROW EXECUTE FUNCTION keep_newest_review();
--> statement-breakpoint
CREATE TRIGGER marathon_items_2_stamp BEFORE INSERT OR UPDATE ON marathon_items
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER marathon_attempts_1_keep_first BEFORE UPDATE ON marathon_attempts
  FOR EACH ROW EXECUTE FUNCTION keep_first_record();
--> statement-breakpoint
CREATE TRIGGER marathon_attempts_2_stamp BEFORE INSERT ON marathon_attempts
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER marathon_readers_1_keep_most_read BEFORE UPDATE ON marathon_readers
  FOR EACH ROW EXECUTE FUNCTION keep_most_read_inputs();
--> statement-breakpoint
CREATE TRIGGER marathon_readers_2_stamp BEFORE INSERT OR UPDATE ON marathon_readers
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER marathon_sessions_stamp BEFORE INSERT OR UPDATE ON marathon_sessions
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
