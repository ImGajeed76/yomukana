-- How two devices' copies of the same progress are reconciled.
--
-- Enforced here, in the database, rather than trusted to each client. A phone
-- that was offline for a week and then syncs is a client with old data and a
-- perfectly valid token, and nothing it sends should be able to undo what the
-- reader did on another device in the meantime.

-- The Data API reaches these tables as the `authenticated` role. Row-level
-- security then narrows every statement to the reader's own rows.
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON items, attempts, readers, sessions TO authenticated;
--> statement-breakpoint

-- Every change is stamped with the server's clock, so "what changed since I
-- last looked" does not depend on two devices agreeing about the time.
CREATE OR REPLACE FUNCTION stamp_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- An item is only ever replaced by a copy that was reviewed more recently.
-- Returning NULL skips the update altogether, so a stale copy changes nothing,
-- not even the timestamp that would make other devices fetch it again.
CREATE OR REPLACE FUNCTION keep_newest_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reviewed_at <= OLD.reviewed_at THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- A finished sentence is a fact. Once recorded it is never rewritten.
CREATE OR REPLACE FUNCTION keep_first_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- The reader model holds a baseline and a motor floor per input, and each input
-- is kept from whichever copy has seen more reads on it. Merged per input, so a
-- device that has only ever been a keyboard cannot wipe out what a phone
-- learned, and the other way round.
CREATE OR REPLACE FUNCTION keep_most_read_inputs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  method text;
  merged jsonb := '{}'::jsonb;
BEGIN
  FOREACH method IN ARRAY ARRAY['keyboard', 'touch'] LOOP
    IF coalesce((NEW.model -> method ->> 'reviews')::int, 0)
       >= coalesce((OLD.model -> method ->> 'reviews')::int, 0) THEN
      merged := merged || jsonb_build_object(method, NEW.model -> method);
    ELSE
      merged := merged || jsonb_build_object(method, OLD.model -> method);
    END IF;
  END LOOP;
  NEW.model := merged;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Triggers on one table fire in name order, so the rule that may skip a change
-- is numbered to run before the stamp that would record it.
CREATE TRIGGER items_1_keep_newest BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION keep_newest_review();
--> statement-breakpoint
CREATE TRIGGER items_2_stamp BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER attempts_1_keep_first BEFORE UPDATE ON attempts
  FOR EACH ROW EXECUTE FUNCTION keep_first_record();
--> statement-breakpoint
CREATE TRIGGER attempts_2_stamp BEFORE INSERT ON attempts
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER readers_1_keep_most_read BEFORE UPDATE ON readers
  FOR EACH ROW EXECUTE FUNCTION keep_most_read_inputs();
--> statement-breakpoint
CREATE TRIGGER readers_2_stamp BEFORE INSERT OR UPDATE ON readers
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint
CREATE TRIGGER sessions_stamp BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
