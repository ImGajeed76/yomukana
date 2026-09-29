CREATE TABLE "profile_badges" (
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "profile_badges_user_id_group_id_pk" PRIMARY KEY("user_id","group_id"),
	CONSTRAINT "profile_badges_position_range" CHECK ("profile_badges"."position" between 0 and 2)
);
--> statement-breakpoint
ALTER TABLE "profile_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "badge_emoji" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "badge_tag" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "badge_color" text;--> statement-breakpoint
ALTER TABLE "profile_badges" ADD CONSTRAINT "profile_badges_membership" FOREIGN KEY ("group_id","user_id") REFERENCES "public"."group_members"("group_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_badges_position" ON "profile_badges" USING btree ("user_id","position");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_whole" CHECK (("groups"."badge_emoji" is null) = ("groups"."badge_tag" is null)
        and ("groups"."badge_tag" is null) = ("groups"."badge_color" is null));--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_emoji_length" CHECK (char_length("groups"."badge_emoji") between 1 and 8);--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_tag_length" CHECK (char_length("groups"."badge_tag") between 2 and 4);--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_color" CHECK ("groups"."badge_color" in ('green', 'blue', 'violet', 'rose', 'amber', 'slate'));