-- Fix: profiles UPDATE policy had no WITH CHECK clause.
-- PostgreSQL fell back to USING (auth.uid() = id) as WITH CHECK, which allowed
-- any user to UPDATE profiles SET role='admin' on their own row — gaining admin
-- access on every table that checks profiles.role for authorization.

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );
