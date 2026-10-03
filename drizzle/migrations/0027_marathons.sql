CREATE TABLE "marathon_members" (
	"marathon_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entered_at" timestamp with time zone,
	"score" double precision DEFAULT 0 NOT NULL,
	"end_score" double precision DEFAULT 0 NOT NULL,
	"scored_at" timestamp with time zone,
	"peak_score" double precision DEFAULT 0 NOT NULL,
	"peak_at" timestamp with time zone,
	CONSTRAINT "marathon_members_marathon_id_user_id_pk" PRIMARY KEY("marathon_id","user_id"),
	CONSTRAINT "marathon_members_end_score" CHECK ("marathon_members"."end_score" <= "marathon_members"."score")
);
--> statement-breakpoint
ALTER TABLE "marathon_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marathon_score_submissions" (
	"marathon_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"score" double precision NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marathon_score_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marathons" (
	"marathon_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"allows_late_entry" boolean DEFAULT true NOT NULL,
	"invite_code" text,
	"display_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marathons_name_length" CHECK (char_length("marathons"."name") between 1 and 40),
	CONSTRAINT "marathons_ends_after_start" CHECK ("marathons"."ends_at" > "marathons"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "marathons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "score_refusals" ADD COLUMN "marathon_id" uuid;--> statement-breakpoint
ALTER TABLE "marathon_members" ADD CONSTRAINT "marathon_members_marathon_id_marathons_marathon_id_fk" FOREIGN KEY ("marathon_id") REFERENCES "public"."marathons"("marathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marathon_members" ADD CONSTRAINT "marathon_members_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marathon_score_submissions" ADD CONSTRAINT "marathon_score_submissions_member" FOREIGN KEY ("marathon_id","user_id") REFERENCES "public"."marathon_members"("marathon_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marathon_members_by_reader" ON "marathon_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marathon_score_submissions_by_runner" ON "marathon_score_submissions" USING btree ("marathon_id","user_id","accepted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marathons_invite_code" ON "marathons" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "marathons_display_code" ON "marathons" USING btree ("display_code");--> statement-breakpoint
ALTER TABLE "score_refusals" ADD CONSTRAINT "score_refusals_marathon_id_marathons_marathon_id_fk" FOREIGN KEY ("marathon_id") REFERENCES "public"."marathons"("marathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Marathons are reached only through the API function, like groups. Nothing
-- is granted, and row-level security with no policy is a second lock.
REVOKE ALL ON marathons, marathon_members, marathon_score_submissions FROM authenticated, anonymous;
--> statement-breakpoint

-- A marathon always has an admin while it has members, as a group does
-- (0009): when the admin goes, whoever joined earliest takes over, and a
-- marathon left with nobody in it goes too.
CREATE OR REPLACE FUNCTION keep_marathon_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM marathon_members WHERE marathon_id = OLD.marathon_id AND is_admin) THEN
    RETURN NULL;
  END IF;
  UPDATE marathon_members SET is_admin = true
  WHERE (marathon_id, user_id) = (
    SELECT marathon_id, user_id FROM marathon_members
    WHERE marathon_id = OLD.marathon_id
    ORDER BY joined_at, user_id
    LIMIT 1
  );
  IF NOT FOUND THEN
    DELETE FROM marathons WHERE marathon_id = OLD.marathon_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER marathon_members_keep_admin AFTER DELETE ON marathon_members
  FOR EACH ROW EXECUTE FUNCTION keep_marathon_admin();
--> statement-breakpoint

-- Whether the signed-in reader may write progress to a marathon's track:
-- they are running in it, it has not been over for more than an hour, and
-- `at`, when given, is a moment inside the race. So a sentence read before
-- the start or after the end never reaches the board, and a device that was
-- offline for the last minutes still gets them in. The slack before the start
-- is MARATHON_CLOCK_SLACK_MS in src/lib/sync/marathon-rules.ts; the hour
-- after the end became the creator's choice in 0029.
--
-- SECURITY DEFINER so the row-level rules on the progress tables can look at
-- members, which signed-in readers cannot read themselves.
CREATE OR REPLACE FUNCTION marathon_open_for(marathon uuid, at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM marathon_members m
    JOIN marathons r ON r.marathon_id = m.marathon_id
    WHERE m.marathon_id = marathon
      AND m.user_id = (SELECT auth.user_id())
      AND m.entered_at IS NOT NULL
      AND now() >= r.starts_at - interval '5 minutes'
      AND now() <= r.ends_at + interval '1 hour'
      AND (at IS NULL OR (at >= r.starts_at - interval '5 minutes' AND at <= r.ends_at))
  );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION marathon_open_for(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION marathon_open_for(uuid, timestamptz) TO authenticated;
