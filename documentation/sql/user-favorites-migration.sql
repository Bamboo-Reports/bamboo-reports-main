-- User Favorites Migration
-- Lets each user star accounts/centers/prospects and revisit them. Private per user.

-- 1. Create user_favorites table
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'center', 'prospect')),
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

-- 2. Performance index
CREATE INDEX IF NOT EXISTS user_favorites_user_created_idx
  ON public.user_favorites (user_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (private per user, full CRUD scoped to auth.uid())
CREATE POLICY "Favorites are private"
  ON public.user_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their favorites"
  ON public.user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their favorites"
  ON public.user_favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their favorites"
  ON public.user_favorites FOR DELETE
  USING (auth.uid() = user_id);
