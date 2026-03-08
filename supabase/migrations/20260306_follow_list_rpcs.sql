-- RPCs to fetch follower/following lists, bypassing RLS on users table
-- (client-side embedded joins fail because users RLS blocks reading other users' rows)

CREATE OR REPLACE FUNCTION get_followers()
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, profile_private BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.profile_private
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = auth.uid()
    AND f.status = 'accepted'
  ORDER BY f.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_following()
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, profile_private BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.profile_private
  FROM follows f
  JOIN users u ON u.id = f.following_id
  WHERE f.follower_id = auth.uid()
    AND f.status = 'accepted'
  ORDER BY f.created_at DESC;
END;
$$;
