ALTER TABLE "groups" DROP CONSTRAINT "groups_badge_whole";--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_badge_color";--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_card_color";--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_whole" CHECK (("groups"."badge_tag" is null) = ("groups"."badge_color" is null)
        and ("groups"."badge_tag" is not null or "groups"."badge_emoji" is null));--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_badge_color" CHECK ("groups"."badge_color" in (
        'rose', 'orange', 'amber', 'lime', 'green', 'teal',
        'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'
      ));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_card_color" CHECK ("profiles"."card_color" in (
        'rose', 'orange', 'amber', 'lime', 'green', 'teal',
        'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'
      ));--> statement-breakpoint

-- A badge is there when it has a tag. The emoji is optional now, so it no
-- longer decides whether a worn badge is shown. Same columns, so the view that
-- reads this one, followed_badges, carries on unchanged.
CREATE OR REPLACE VIEW worn_badges AS
SELECT
  b.user_id,
  b.position,
  g.badge_emoji AS emoji,
  g.badge_tag AS tag,
  g.badge_color AS color
FROM profile_badges b
JOIN groups g ON g.group_id = b.group_id
WHERE g.badge_tag IS NOT NULL;
