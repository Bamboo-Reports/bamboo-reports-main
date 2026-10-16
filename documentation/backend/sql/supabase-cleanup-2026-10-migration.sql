-- Supabase cleanup after the 2026-10-16 database review.
-- Applied to BR-USER-AUTH-NEXTJS on 2026-10-16. Safe to re-run.

-- 1. Unused leftovers ---------------------------------------------------------

-- Legacy dashboard access check. Its tables (dashboard_access_log,
-- dashboard_security_state) were dropped on 2026-07-01 and nothing calls it.
drop function if exists public.check_dashboard_access(uuid, text, integer, integer);

-- Never read or written by the app; every row held the default 1000.
alter table public.profiles drop column if exists credits_remaining;

-- 2. RLS: evaluate auth.uid() once per query instead of once per row ----------
-- Same conditions as before, wrapped in (select auth.uid()) as recommended by
-- the Supabase advisor (auth_rls_initplan). Names, roles and commands unchanged.

alter policy "Profiles are viewable by owner" on public.profiles
  using ((select auth.uid()) = user_id);
alter policy "Profiles are updatable by owner" on public.profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Profiles are insertable by owner" on public.profiles
  with check (((select auth.uid()) = user_id) and (role = 'viewer'::text));

alter policy "Saved filters are private" on public.saved_filters
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their saved filters" on public.saved_filters
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their saved filters" on public.saved_filters
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete their saved filters" on public.saved_filters
  using ((select auth.uid()) = user_id);
alter policy "Users can view filters shared with them" on public.saved_filters
  using (exists (
    select 1 from public.filter_shares
    where filter_shares.filter_id = saved_filters.id
      and filter_shares.shared_with_user_id = (select auth.uid())
  ));

alter policy "Owners can manage their shares" on public.filter_shares
  using ((select auth.uid()) = owner_user_id);
alter policy "Recipients can view their shares" on public.filter_shares
  using ((select auth.uid()) = shared_with_user_id);

alter policy "Users can view their own account lists" on public.account_lists
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own account lists" on public.account_lists
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own account lists" on public.account_lists
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own account lists" on public.account_lists
  using ((select auth.uid()) = user_id);
alter policy "Users can view account lists shared with them" on public.account_lists
  using (exists (
    select 1 from public.account_list_shares
    where account_list_shares.list_id = account_lists.id
      and account_list_shares.shared_with_user_id = (select auth.uid())
  ));

alter policy "Owners can manage their account list shares" on public.account_list_shares
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
alter policy "Recipients can view their account list shares" on public.account_list_shares
  using ((select auth.uid()) = shared_with_user_id);

-- 3. Index the owner foreign keys used by the share policies above ------------

create index if not exists filter_shares_owner_user_id_idx
  on public.filter_shares (owner_user_id);
create index if not exists account_list_shares_owner_user_id_idx
  on public.account_list_shares (owner_user_id);
