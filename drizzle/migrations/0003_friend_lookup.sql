-- Friends: who can reach profiles and friends, and the one way to find someone.

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, friends TO authenticated;
--> statement-breakpoint

CREATE TRIGGER profiles_stamp BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
--> statement-breakpoint

-- Finds a reader by their exact name, and nothing else.
--
-- Row-level security hides every profile a reader has not added, which is the
-- point: there is no list of everyone to scroll. But adding someone needs
-- their id first, so this looks one name up past that rule. It answers only an
-- exact match and only with the id and the name, never the score: the score
-- becomes visible once they are added, through the ordinary rules.
--
-- SECURITY DEFINER runs it as its owner so it can see past row-level security.
-- The fixed search_path stops a caller pointing it at a table of their own.
CREATE OR REPLACE FUNCTION find_profile(name text)
RETURNS TABLE (user_id text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT profiles.user_id, profiles.username
  FROM profiles
  WHERE profiles.username = lower(trim(name));
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION find_profile(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION find_profile(text) TO authenticated;
