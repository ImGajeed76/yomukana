-- A third input, `kana`, for Japanese keyboards. The reader model now holds a
-- baseline and a motor floor for it too, merged per input like the other two.
--
-- A copy from before this knows nothing of `kana`, so an input missing from
-- both copies is left out rather than written as null, and an input missing
-- from one copy is kept from the other. That way an older version of the app
-- syncing its model can never wipe out what a Japanese keyboard learned.
CREATE OR REPLACE FUNCTION keep_most_read_inputs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  method text;
  merged jsonb := '{}'::jsonb;
BEGIN
  FOREACH method IN ARRAY ARRAY['keyboard', 'touch', 'kana'] LOOP
    IF NEW.model -> method IS NULL AND OLD.model -> method IS NULL THEN
      CONTINUE;
    ELSIF coalesce((NEW.model -> method ->> 'reviews')::int, -1)
       >= coalesce((OLD.model -> method ->> 'reviews')::int, -1) THEN
      merged := merged || jsonb_build_object(method, NEW.model -> method);
    ELSE
      merged := merged || jsonb_build_object(method, OLD.model -> method);
    END IF;
  END LOOP;
  NEW.model := merged;
  RETURN NEW;
END;
$$;
