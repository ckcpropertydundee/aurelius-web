-- Fix: tenant_invitations table was fully exposed to unauthenticated users.
-- The public_read_invite_by_token policy used USING: true with the public role,
-- meaning any anon API call could retrieve all rows (emails, tokens, landlord IDs).
-- The client never queries this table directly; the send-invite Edge Function
-- uses the service role. Replace with scoped policies only.

DROP POLICY IF EXISTS "public_read_invite_by_token" ON tenant_invitations;

CREATE POLICY "landlord_read_own_invitations" ON tenant_invitations
  FOR SELECT
  USING (landlord_id = auth.uid());

CREATE POLICY "admin_read_all_invitations" ON tenant_invitations
  FOR SELECT
  USING (
    (SELECT role FROM users WHERE id = (auth.uid())::text)
    = ANY (ARRAY['admin', 'master admin'])
  );
