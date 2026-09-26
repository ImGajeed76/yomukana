ALTER TABLE "profiles" ADD COLUMN "peak_score" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "peak_at" timestamp with time zone;