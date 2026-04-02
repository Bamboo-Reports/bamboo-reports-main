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

-- 3. Enable RLS
ALTER TABLE public.filter_shares ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Owners can manage (insert, update, delete) their shares
CREATE POLICY "Owners can manage their shares"
  ON public.filter_shares FOR ALL
  USING (auth.uid() = owner_user_id);

-- Recipients can view shares directed at them
CREATE POLICY "Recipients can view their shares"
  ON public.filter_shares FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- 5. Allow reading shared filters (recipients need SELECT on saved_filters for shared ones)
CREATE POLICY "Users can view filters shared with them"
  ON public.saved_filters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.filter_shares
      WHERE filter_shares.filter_id = saved_filters.id
        AND filter_shares.shared_with_user_id = auth.uid()
    )
  );

-- 6. Allow authenticated users to look up profiles by email (for sharing)
-- Note: This broadens the existing profiles SELECT policy.
-- If this is too broad, consider using a database function instead.
CREATE POLICY "Authenticated users can look up profiles by email"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
