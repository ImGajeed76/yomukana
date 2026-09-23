CREATE TABLE "attempts" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"attempt_id" text NOT NULL,
	"record" jsonb NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_user_id_attempt_id_pk" PRIMARY KEY("user_id","attempt_id")
);
--> statement-breakpoint
ALTER TABLE "attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"user_id" text DEFAULT (auth.user_id()) NOT NULL,
	"item_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "readers" (
	"user_id" text PRIMARY KEY DEFAULT (auth.user_id()) NOT NULL,
	"model" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "readers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"user_id" text PRIMARY KEY DEFAULT (auth.user_id()) NOT NULL,
	"record" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "attempts_changed" ON "attempts" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "items_changed" ON "items" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id() = "attempts"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "attempts"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "attempts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "attempts"."user_id")) WITH CHECK ((select auth.user_id() = "attempts"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "attempts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "attempts"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id() = "items"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "items"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "items"."user_id")) WITH CHECK ((select auth.user_id() = "items"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "items" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "items"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "readers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id() = "readers"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "readers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "readers"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "readers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "readers"."user_id")) WITH CHECK ((select auth.user_id() = "readers"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "readers" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "readers"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id() = "sessions"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "sessions"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "sessions"."user_id")) WITH CHECK ((select auth.user_id() = "sessions"."user_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "sessions"."user_id"));