-- Get followers of any user (for viewing another user's follower list)
-- Only returns followers visible to the caller (public profiles and accepted follows)
CREATE OR REPLACE FUNCTION get_user_followers(target_user_id UUID)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, profile_private BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.profile_private
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = target_user_id
    AND f.status = 'accepted'
    AND u.deleted_at IS NULL
  ORDER BY f.created_at DESC;
END;
$$;

-- Get following list of any user
CREATE OR REPLACE FUNCTION get_user_following(target_user_id UUID)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, profile_private BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.profile_private
  FROM follows f
  JOIN users u ON u.id = f.following_id
  WHERE f.follower_id = target_user_id
    AND f.status = 'accepted'
    AND u.deleted_at IS NULL
  ORDER BY f.created_at DESC;
END;
$$;

-- Look up a user's public profile by username
CREATE OR REPLACE FUNCTION get_user_by_username(target_username TEXT)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, profile_private BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.profile_private
  FROM users u
  WHERE u.username = target_username
    AND u.deleted_at IS NULL
  LIMIT 1;
END;
$$;
