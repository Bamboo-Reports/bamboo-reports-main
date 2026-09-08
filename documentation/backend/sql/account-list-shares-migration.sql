-- Account List Shares Migration
-- Lets users share an account list with teammates by email, mirroring
-- filter_shares. Requires account-lists-migration.sql and
-- filter-shares-migration.sql (for lookup_profile_by_email).

CREATE TABLE IF NOT EXISTS public.account_list_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.account_lists(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS account_list_shares_shared_with_idx
  ON public.account_list_shares (shared_with_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_list_shares_list_idx
  ON public.account_list_shares (list_id);

ALTER TABLE public.account_list_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage their account list shares" ON public.account_list_shares;
CREATE POLICY "Owners can manage their account list shares"
  ON public.account_list_shares FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Recipients can view their account list shares" ON public.account_list_shares;
CREATE POLICY "Recipients can view their account list shares"
  ON public.account_list_shares FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- Recipients can read (not edit) lists shared with them.
DROP POLICY IF EXISTS "Users can view account lists shared with them" ON public.account_lists;
CREATE POLICY "Users can view account lists shared with them"
  ON public.account_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_list_shares
      WHERE account_list_shares.list_id = account_lists.id
        AND account_list_shares.shared_with_user_id = auth.uid()
    )
  );

REVOKE ALL ON public.account_list_shares FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_list_shares TO authenticated;

-- Owner emails of lists shared with the caller, scoped to the share relationship.
CREATE OR REPLACE FUNCTION public.lookup_shared_account_list_owner_emails()
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT p.user_id, p.email
  FROM public.profiles AS p
  JOIN public.account_list_shares AS s ON s.owner_user_id = p.user_id
  WHERE s.shared_with_user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.lookup_shared_account_list_owner_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_shared_account_list_owner_emails() TO authenticated;
