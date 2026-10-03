CREATE TABLE "score_refusals" (
	"user_id" text NOT NULL,
	"score" double precision NOT NULL,
	"refused_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_refusals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "score_refusals" ADD CONSTRAINT "score_refusals_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_refusals_by_reader" ON "score_refusals" USING btree ("user_id","refused_at");--> statement-breakpoint

-- Closed to the Data API like score_submissions: only the API function reads or writes it.
REVOKE ALL ON score_refusals FROM authenticated, anonymous;
