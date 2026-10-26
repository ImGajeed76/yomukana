ALTER TABLE "profiles" ADD COLUMN "score_curve" double precision[];--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "curve_at" timestamp with time zone;--> statement-breakpoint

-- A score as it is at `as_of`, falling from the one last sent along the curve
-- sent with it. The same as scoreAt in src/lib/sync/score-curve.ts, so a board
-- ranks by the number it shows; change both together.
CREATE FUNCTION live_score(
  score double precision,
  scored_at timestamp with time zone,
  curve double precision[],
  curve_at timestamp with time zone,
  as_of timestamp with time zone DEFAULT now()
) RETURNS double precision
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  -- CURVE_DAYS.
  curve_days constant integer[] := ARRAY[1, 3, 7, 14, 30, 90];
  from_at timestamp with time zone := scored_at;
  from_score double precision := score;
  point_at timestamp with time zone;
  point double precision;
BEGIN
  IF scored_at IS NULL OR curve IS NULL OR curve_at IS NULL OR as_of <= scored_at THEN
    RETURN score;
  END IF;
  FOR i IN 1 .. array_length(curve_days, 1) LOOP
    -- Whole days of 86,400 seconds, as the app counts them, not calendar days.
    point_at := curve_at + curve_days[i] * interval '86400 seconds';
    CONTINUE WHEN point_at <= scored_at;
    point := least(coalesce(curve[i], from_score), from_score);
    IF as_of <= point_at THEN
      RETURN from_score + (point - from_score)
        * extract(epoch FROM as_of - from_at) / extract(epoch FROM point_at - from_at);
    END IF;
    from_at := point_at;
    from_score := point;
  END LOOP;
  RETURN from_score;
END;
$$;
--> statement-breakpoint

-- The standings rank by the score as it is now. Compared as shown, in whole
-- numbers, as src/lib/sync/board.ts does.
CREATE OR REPLACE VIEW group_standings AS
SELECT
  group_id,
  user_id,
  role,
  joined_at,
  score,
  rank() OVER (PARTITION BY group_id ORDER BY round(score) DESC) AS rank,
  count(*) OVER (PARTITION BY group_id) AS member_count
FROM (
  SELECT m.group_id, m.user_id, m.role, m.joined_at,
    live_score(p.score, p.scored_at, p.score_curve, p.curve_at) AS score
  FROM group_members m
  JOIN profiles p ON p.user_id = m.user_id
) live;
--> statement-breakpoint

CREATE OR REPLACE VIEW global_standings AS
SELECT
  user_id,
  score,
  rank() OVER (ORDER BY round(score) DESC) AS rank,
  count(*) OVER () AS listed_count
FROM (
  SELECT p.user_id, live_score(p.score, p.scored_at, p.score_curve, p.curve_at) AS score
  FROM profiles p
  WHERE p.is_listed
) live;
--> statement-breakpoint

-- Read by the API function only, like the views that use it.
REVOKE ALL ON FUNCTION live_score FROM PUBLIC;