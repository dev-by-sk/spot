-- Friends Social Layer: Schema Changes
-- Run against Supabase SQL editor

-- ── Alter users table ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
-- profile_private column already exists per CLAUDE.md, ensure it has default
ALTER TABLE users ALTER COLUMN profile_private SET DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- ── New follows table ──
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, status);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, status);

-- ── RLS on follows ──
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Follower can insert a follow
CREATE POLICY follows_insert ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);

-- Both parties can read their own follow relationships
CREATE POLICY follows_select ON follows FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Follower can delete (unfollow), or following user can delete (reject request)
CREATE POLICY follows_delete ON follows FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Following user can update status (accept/reject request)
CREATE POLICY follows_update ON follows FOR UPDATE
  USING (auth.uid() = following_id)
  WITH CHECK (auth.uid() = following_id);

-- ── RPC: check_username_available ──
CREATE OR REPLACE FUNCTION check_username_available(desired_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF desired_username !~ '^[a-z][a-z0-9_]{2,19}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM users WHERE username = desired_username
  );
END;
$$;

-- ── RPC: set_username ──
CREATE OR REPLACE FUNCTION set_username(new_username TEXT, p_first_name TEXT DEFAULT NULL, p_last_name TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF new_username !~ '^[a-z][a-z0-9_]{2,19}$' THEN
    RAISE EXCEPTION 'Invalid username format';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE username = new_username) THEN
    RAISE EXCEPTION 'Username already taken';
  END IF;

  UPDATE users
  SET username = new_username,
      first_name = COALESCE(p_first_name, first_name),
      last_name = COALESCE(p_last_name, last_name),
      display_name = COALESCE(
        NULLIF(TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), ''),
        display_name,
        split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
      )
  WHERE id = auth.uid();
END;
$$;

-- ── RPC: get_social_counts ──
CREATE OR REPLACE FUNCTION get_social_counts(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  f_count BIGINT;
  fg_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO f_count
  FROM follows
  WHERE following_id = target_user_id AND status = 'accepted';

  SELECT COUNT(*) INTO fg_count
  FROM follows
  WHERE follower_id = target_user_id AND status = 'accepted';

  RETURN json_build_object('followers_count', f_count, 'following_count', fg_count);
END;
$$;

-- ── RPC: get_mutual_count ──
CREATE OR REPLACE FUNCTION get_mutual_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt BIGINT;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM follows f1
  JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
  WHERE f1.follower_id = auth.uid()
    AND f1.status = 'accepted'
    AND f2.status = 'accepted';
  RETURN cnt;
END;
$$;

-- ── RPC: get_pending_request_count ──
CREATE OR REPLACE FUNCTION get_pending_request_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt BIGINT;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM follows
  WHERE following_id = auth.uid() AND status = 'pending';
  RETURN cnt;
END;
$$;
