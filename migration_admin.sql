-- 1. Add role flags to profiles
ALTER TABLE profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN is_beta boolean NOT NULL DEFAULT false,
  ADD COLUMN exclude_from_leaderboard boolean NOT NULL DEFAULT false;

-- 2. Feature flags table (single row, JSONB)
CREATE TABLE feature_flags (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  flags jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO feature_flags (id, flags) VALUES (1, '{}');

-- 3. RLS on feature_flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature flags"
  ON feature_flags FOR SELECT USING (true);

CREATE POLICY "Only admins can update feature flags"
  ON feature_flags FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- 4. Replace existing profiles update policy so admins can update any row
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Update own profile or admin updates any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 5. Trigger to prevent non-admins from modifying role fields
CREATE OR REPLACE FUNCTION protect_profile_role_fields()
RETURNS TRIGGER AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  SELECT is_admin INTO caller_is_admin FROM profiles WHERE id = auth.uid();

  IF NOT COALESCE(caller_is_admin, false) THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_beta IS DISTINCT FROM OLD.is_beta
       OR NEW.exclude_from_leaderboard IS DISTINCT FROM OLD.exclude_from_leaderboard THEN
      RAISE EXCEPTION 'Only admins can modify role fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_role_fields_trigger ON profiles;
CREATE TRIGGER protect_profile_role_fields_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role_fields();
