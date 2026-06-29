-- Filter Shares Migration
-- Enables users to share saved filter configurations with specific teammates by email.

-- 1. Create filter_shares table
CREATE TABLE IF NOT EXISTS public.filter_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id UUID NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(filter_id, shared_with_user_id)
);

-- 2. Performance index
CREATE INDEX IF NOT EXISTS filter_shares_shared_with_idx
  ON public.filter_shares (shared_with_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS filter_shares_filter_idx
  ON public.filter_shares (filter_id);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));

-- 3. Enable RLS
ALTER TABLE public.filter_shares ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Owners can manage (insert, update, delete) their shares
DROP POLICY IF EXISTS "Owners can manage their shares" ON public.filter_shares;
CREATE POLICY "Owners can manage their shares"
  ON public.filter_shares FOR ALL
  USING (auth.uid() = owner_user_id);

-- Recipients can view shares directed at them
DROP POLICY IF EXISTS "Recipients can view their shares" ON public.filter_shares;
CREATE POLICY "Recipients can view their shares"
  ON public.filter_shares FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- 5. Allow reading shared filters (recipients need SELECT on saved_filters for shared ones)
DROP POLICY IF EXISTS "Users can view filters shared with them" ON public.saved_filters;
CREATE POLICY "Users can view filters shared with them"
  ON public.saved_filters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.filter_shares
      WHERE filter_shares.filter_id = saved_filters.id
        AND filter_shares.shared_with_user_id = auth.uid()
    )
  );

-- 6. Keep direct profile reads owner-scoped. Email-based sharing uses the
-- narrowly scoped function below.
DROP POLICY IF EXISTS "Authenticated users can look up profiles by email" ON public.profiles;

-- 7. Case-insensitive exact profile lookup for sharing.
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(input_email TEXT)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.user_id, p.email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(p.email) = lower(trim(input_email))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_email(TEXT) TO authenticated;

-- 8. Resolve owner emails of filters shared with the caller, scoped to the
-- share relationship so it never exposes unrelated profiles.
CREATE OR REPLACE FUNCTION public.lookup_shared_filter_owner_emails()
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT p.user_id, p.email
  FROM public.profiles AS p
  JOIN public.filter_shares AS fs ON fs.owner_user_id = p.user_id
  WHERE fs.shared_with_user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.lookup_shared_filter_owner_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_shared_filter_owner_emails() TO authenticated;
