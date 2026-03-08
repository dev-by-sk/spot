-- Phase 1: Username Setup + Profile Identity
-- Run against Supabase SQL editor

-- ── Alter users table ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ALTER COLUMN profile_private SET DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

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

GRANT EXECUTE ON FUNCTION check_username_available(TEXT) TO authenticated;

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

  IF EXISTS (SELECT 1 FROM users WHERE username = new_username AND id != auth.uid()) THEN
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

GRANT EXECUTE ON FUNCTION set_username(TEXT, TEXT, TEXT) TO authenticated;
