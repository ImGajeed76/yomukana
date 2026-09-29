ALTER TABLE "profiles" ADD COLUMN "streak_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "streak_alive_until" timestamp with time zone;