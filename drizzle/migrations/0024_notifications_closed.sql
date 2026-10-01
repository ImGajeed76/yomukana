-- Notifications: closed to the Data API like the group tables. Subscriptions
-- carry keys a push service trusts, settings say when a reader can be woken,
-- and nudges say who reached whom; only the API function reads or writes them.

REVOKE ALL ON push_subscriptions FROM authenticated, anonymous;
--> statement-breakpoint
REVOKE ALL ON notification_settings FROM authenticated, anonymous;
--> statement-breakpoint
REVOKE ALL ON nudges FROM authenticated, anonymous;
