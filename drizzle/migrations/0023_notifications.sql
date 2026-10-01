CREATE TABLE "notification_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"is_reminder_on" boolean DEFAULT true NOT NULL,
	"reminder_minute" smallint DEFAULT 1140 NOT NULL,
	"can_be_nudged" boolean DEFAULT true NOT NULL,
	"shows_nudges" boolean DEFAULT true NOT NULL,
	"reminded_on" date,
	CONSTRAINT "notification_settings_minute" CHECK ("notification_settings"."reminder_minute" between 0 and 1439),
	CONSTRAINT "notification_settings_locale" CHECK ("notification_settings"."locale" in ('en', 'de', 'ja'))
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nudges" (
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"day" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nudges_from_user_id_to_user_id_day_pk" PRIMARY KEY("from_user_id","to_user_id","day")
);
--> statement-breakpoint
ALTER TABLE "nudges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_from_user_id_profiles_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_to_user_id_profiles_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nudges_to" ON "nudges" USING btree ("to_user_id","day");--> statement-breakpoint
CREATE INDEX "push_subscriptions_by_reader" ON "push_subscriptions" USING btree ("user_id");