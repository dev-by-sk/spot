-- RPC to fetch pending follow requests with follower profile data
-- Bypasses users RLS so the follower's profile info is readable

CREATE OR REPLACE FUNCTION get_pending_follow_requests()
RETURNS TABLE(
  id UUID,
  follower_id UUID,
  username TEXT,
  display_name TEXT,
  profile_private BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.follower_id, u.username, u.display_name, u.profile_private, f.created_at
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = auth.uid()
    AND f.status = 'pending'
    AND u.deleted_at IS NULL
  ORDER BY f.created_at DESC;
END;
$$;
