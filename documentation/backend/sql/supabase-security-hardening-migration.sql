-- Supabase security hardening for existing Bamboo Reports projects.
-- Safe to run repeatedly.
--
-- Prerequisite: assumes the base RLS policies from profiles-role-migration.sql,
-- filter-shares-migration.sql, supabase-saved-filters.md, and
-- user-exports-schema.sql are already in place (owner-scoped INSERT/UPDATE on
-- profiles, per-user policies on saved_filters/filter_shares/user_favorites).
-- This file tightens grants and reads on top of those; it does not recreate them.

-- Profiles must only be directly readable by their owner. Email-based sharing
-- uses the narrowly scoped RPC below instead of broad table access.
drop policy if exists "Authenticated users can look up profiles by email"
  on public.profiles;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.lookup_profile_by_email(input_email text)
returns table(user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.email
  from public.profiles as p
  where auth.uid() is not null
    and lower(p.email) = lower(trim(input_email))
  limit 1
$$;

revoke all on function public.lookup_profile_by_email(text) from public, anon;
grant execute on function public.lookup_profile_by_email(text) to authenticated;

-- Resolve the owner emails of filters shared with the caller, without granting
-- cross-user reads on profiles. Scoped to rows the caller is already entitled to
-- see via filter_shares, so it leaks nothing beyond the share relationship.
create or replace function public.lookup_shared_filter_owner_emails()
returns table(user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.user_id, p.email
  from public.profiles as p
  join public.filter_shares as fs on fs.owner_user_id = p.user_id
  where fs.shared_with_user_id = auth.uid()
$$;

revoke all on function public.lookup_shared_filter_owner_emails() from public, anon;
grant execute on function public.lookup_shared_filter_owner_emails() to authenticated;

-- Trigger functions should not resolve objects through a caller-controlled
-- search path.
alter function public.set_updated_at() set search_path = '';

-- RLS is the sole protection on PostgREST-exposed tables, so enforce that it is
-- enabled regardless of which base migrations ran. Idempotent.
alter table public.profiles enable row level security;
alter table public.saved_filters enable row level security;
alter table public.filter_shares enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_exports enable row level security;

-- Remove Supabase's broad default table grants, then grant only the operations
-- used by browser clients. Service-role server operations continue to bypass
-- these grants and RLS.
revoke all on table
  public.profiles,
  public.saved_filters,
  public.filter_shares,
  public.user_favorites,
  public.user_exports
from anon;

revoke all on table
  public.profiles,
  public.saved_filters,
  public.filter_shares,
  public.user_favorites,
  public.user_exports
from authenticated;

grant select on table public.profiles to authenticated;
grant insert (user_id, first_name, last_name, email, phone)
  on public.profiles to authenticated;
grant update (
  first_name,
  last_name,
  email,
  phone,
  tour_completed_at,
  tour_version
)
  on public.profiles to authenticated;

grant select, insert, update, delete
  on table public.saved_filters to authenticated;
grant select, insert, update, delete
  on table public.filter_shares to authenticated;
grant select, insert, update, delete
  on table public.user_favorites to authenticated;

-- Export records and objects are accessed only through authenticated Next.js
-- routes backed by the service role and short-lived signed URLs.
drop policy if exists "users read own exports" on public.user_exports;
drop policy if exists "users insert own exports" on public.user_exports;
drop policy if exists "users read own export objects" on storage.objects;
