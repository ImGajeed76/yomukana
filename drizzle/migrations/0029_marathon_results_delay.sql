ALTER TABLE "marathons" ADD COLUMN "results_delay_minutes" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "marathons" ADD CONSTRAINT "marathons_results_delay" CHECK ("marathons"."results_delay_minutes" in (0, 15, 60, 360, 1440));--> statement-breakpoint

-- As in 0027, with the creator's own wait after the end instead of an hour.
CREATE OR REPLACE FUNCTION marathon_open_for(marathon uuid, at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM marathon_members m
    JOIN marathons r ON r.marathon_id = m.marathon_id
    WHERE m.marathon_id = marathon
      AND m.user_id = (SELECT auth.user_id())
      AND m.entered_at IS NOT NULL
      AND now() >= r.starts_at - interval '5 minutes'
      AND now() <= r.ends_at + make_interval(mins => r.results_delay_minutes)
      AND (at IS NULL OR (at >= r.starts_at - interval '5 minutes' AND at <= r.ends_at))
  );
$$;
