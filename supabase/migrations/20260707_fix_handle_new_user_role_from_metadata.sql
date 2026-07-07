-- CRITICAL FIX: handle_new_user trigger previously read raw_user_meta_data->>'role'
-- and wrote it directly to public.users and public.profiles. This allowed anyone
-- who called the Supabase Auth signup API directly with data: { role: 'admin' }
-- to create a legitimate admin row, bypassing all access controls.
--
-- Fix: new signups always get role = 'tenant', regardless of what is in metadata.
-- The send-invite Edge Function now explicitly sets the correct role after creating
-- the invite, using the service role key (server-side only).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at)
  VALUES (
    lower(new.id::text),
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'tenant',
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(new.raw_user_meta_data->>'full_name', public.users.full_name);

  INSERT INTO public.profiles (id, email, full_name, role, company_name, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'tenant',
    new.raw_user_meta_data->>'company_name',
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name    = COALESCE(new.raw_user_meta_data->>'full_name', public.profiles.full_name),
        company_name = COALESCE(new.raw_user_meta_data->>'company_name', public.profiles.company_name);

  RETURN new;
END;
$$;
