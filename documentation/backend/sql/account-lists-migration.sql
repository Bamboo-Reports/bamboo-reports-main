-- Account Lists Migration
-- Stores client-provided account lists (uploaded and mapped to warehouse
-- account names) so they can be applied as a filter, reused across saved
-- filters and updated in place.

CREATE TABLE IF NOT EXISTS public.account_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Exact account_global_legal_name values, JSON array of strings.
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  account_count INTEGER NOT NULL DEFAULT 0,
  -- Uploaded names that could not be mapped, kept for reference.
  unmatched JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_lists_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT account_lists_accounts_is_array CHECK (jsonb_typeof(accounts) = 'array'),
  CONSTRAINT account_lists_unmatched_is_array CHECK (jsonb_typeof(unmatched) = 'array')
);

CREATE INDEX IF NOT EXISTS account_lists_user_idx
  ON public.account_lists (user_id, created_at DESC);

-- Keep updated_at fresh. Reuses the saved_filters trigger function when it
-- exists; otherwise defines an equivalent one.
CREATE OR REPLACE FUNCTION public.set_account_lists_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_lists_set_updated_at ON public.account_lists;
CREATE TRIGGER account_lists_set_updated_at
  BEFORE UPDATE ON public.account_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_account_lists_updated_at();

ALTER TABLE public.account_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own account lists" ON public.account_lists;
CREATE POLICY "Users can view their own account lists"
  ON public.account_lists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own account lists" ON public.account_lists;
CREATE POLICY "Users can insert their own account lists"
  ON public.account_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own account lists" ON public.account_lists;
CREATE POLICY "Users can update their own account lists"
  ON public.account_lists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own account lists" ON public.account_lists;
CREATE POLICY "Users can delete their own account lists"
  ON public.account_lists FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON public.account_lists FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_lists TO authenticated;
