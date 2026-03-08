-- Atomically follow a user, setting status based on their current privacy setting.
-- Prevents TOCTOU race where profile_private changes between the client's
-- privacy check and the insert.
CREATE OR REPLACE FUNCTION follow_user(target_user_id UUID)
RETURNS TEXT  -- returns 'accepted' | 'pending'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_is_private BOOLEAN;
BEGIN
  -- Prevent self-follow
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  -- Atomically read the target's privacy setting
  SELECT profile_private INTO v_is_private
  FROM users
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_status := CASE WHEN v_is_private THEN 'pending' ELSE 'accepted' END;

  INSERT INTO follows (follower_id, following_id, status)
  VALUES (auth.uid(), target_user_id, v_status)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  RETURN v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION follow_user(UUID) TO authenticated;
