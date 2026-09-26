-- Groups are reached only through the API function, which connects as the
-- database owner. Nothing is granted to signed-in readers, and row-level
-- security with no policy is a second lock on the same door.
REVOKE ALL ON groups, group_members FROM authenticated, anonymous;
--> statement-breakpoint

-- A group always has an admin while it has members.
--
-- A member row goes when its reader leaves, is removed, or deletes their
-- account, and the last of those happens through a cascade no application
-- code sees. So this runs after any removal: if the group now has members
-- and no admin, the one who joined earliest becomes admin. If it has no
-- members, the group goes too, invite and display links with it.
CREATE OR REPLACE FUNCTION keep_group_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = OLD.group_id AND role = 'admin') THEN
    RETURN NULL;
  END IF;
  UPDATE group_members SET role = 'admin'
  WHERE (group_id, user_id) = (
    SELECT group_id, user_id FROM group_members
    WHERE group_id = OLD.group_id
    ORDER BY joined_at, user_id
    LIMIT 1
  );
  IF NOT FOUND THEN
    DELETE FROM groups WHERE group_id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER group_members_keep_admin AFTER DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION keep_group_admin();
