CREATE TABLE "score_submissions" (
	"user_id" text NOT NULL,
	"score" double precision NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "score_submissions" ADD CONSTRAINT "score_submissions_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_submissions_by_reader" ON "score_submissions" USING btree ("user_id","accepted_at");