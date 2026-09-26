ALTER TABLE "profiles" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "card_color" text DEFAULT 'green' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_display_name_length" CHECK (char_length("profiles"."display_name") between 1 and 32);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_card_color" CHECK ("profiles"."card_color" in ('green', 'blue', 'violet', 'rose', 'amber', 'slate'));