CREATE TABLE "friends" (
	"follower_id" text DEFAULT (auth.user_id()) NOT NULL,
	"followee_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "friends_not_self" CHECK ("friends"."follower_id" <> "friends"."followee_id")
);
--> statement-breakpoint
ALTER TABLE "friends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY DEFAULT (auth.user_id()) NOT NULL,
	"username" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"scored_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_format" CHECK ("profiles"."username" ~ '^[a-z0-9_-]{3,20}$')
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_follower_id_profiles_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_followee_id_profiles_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username" ON "profiles" USING btree ("username");--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "friends" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.user_id() = "friends"."follower_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "friends" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "friends"."follower_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "friends" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "friends"."follower_id")) WITH CHECK ((select auth.user_id() = "friends"."follower_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "friends" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "friends"."follower_id"));--> statement-breakpoint
CREATE POLICY "profiles_read_own_and_added" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."user_id" = (select auth.user_id()) or exists (
        select 1 from friends
        where friends.follower_id = (select auth.user_id())
          and friends.followee_id = "profiles"."user_id"
      ));--> statement-breakpoint
CREATE POLICY "profiles_insert_own" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.user_id() = "profiles"."user_id"));--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.user_id() = "profiles"."user_id")) WITH CHECK ((select auth.user_id() = "profiles"."user_id"));--> statement-breakpoint
CREATE POLICY "profiles_delete_own" ON "profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.user_id() = "profiles"."user_id"));