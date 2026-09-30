CREATE TABLE "achievements" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "achievements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "profile_badges_position";--> statement-breakpoint
ALTER TABLE "profile_badges" DROP CONSTRAINT "profile_badges_user_id_group_id_pk";--> statement-breakpoint
ALTER TABLE "profile_badges" ALTER COLUMN "group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_user_id_position_pk" PRIMARY KEY("user_id","position");--> statement-breakpoint
ALTER TABLE "profile_badges" ADD COLUMN "achievement_id" text;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_achievement_earned" FOREIGN KEY ("user_id","achievement_id") REFERENCES "public"."achievements"("user_id","achievement_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_badges_group" ON "profile_badges" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_badges_achievement" ON "profile_badges" USING btree ("user_id","achievement_id");--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_one_thing" CHECK (("profile_badges"."group_id" is null) <> ("profile_badges"."achievement_id" is null));