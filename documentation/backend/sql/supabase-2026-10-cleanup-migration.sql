-- Supabase cleanup, October 2026.
-- Records changes already live on BR-USER-AUTH-NEXTJS (applied 2026-10-16).
-- Safe to re-run. On a fresh project, run it after every other file in this
-- folder, since it alters objects they create.

-- 1. Retired favorites feature -------------------------------------------------
-- The app no longer reads or writes public.user_favorites. Dropping the table
-- also drops its policies, index and grants.
drop table if exists public.user_favorites;

-- 2. Unused leftovers ----------------------------------------------------------
-- Legacy dashboard access check. Its tables were dropped on 2026-07-01 and
-- nothing calls it.
drop function if exists public.check_dashboard_access(uuid, text, integer, integer);

-- Never read or written by the app.
alter table public.profiles drop column if exists credits_remaining;

-- 3. RLS: evaluate auth.uid() once per query, not once per row ------------------
-- Same conditions as the base migrations, with auth.uid() wrapped in a
-- subselect as the Supabase advisor recommends (auth_rls_initplan).

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

-- 4. Index the owner columns the share policies filter on ----------------------
create index if not exists filter_shares_owner_user_id_idx
  on public.filter_shares (owner_user_id);
create index if not exists account_list_shares_owner_user_id_idx
  on public.account_list_shares (owner_user_id);

-- 5. Account list grants match the other browser tables (2026-10-21) ----------
-- The account list migrations only revoked Supabase's default grants from anon,
-- so authenticated kept TRUNCATE, TRIGGER and REFERENCES as well. Reset to the
-- four operations the app uses, as the hardening migration does elsewhere.
revoke all on table public.account_lists, public.account_list_shares
  from anon, authenticated;
grant select, insert, update, delete
  on table public.account_lists, public.account_list_shares to authenticated;
