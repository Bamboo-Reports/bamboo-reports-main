-- =====================================================================
-- rate_limit_counters: per-user, per-endpoint fixed-window request counters
-- =====================================================================
-- Run this against the Supabase project (SQL Editor).
--
-- Backs the per-user rate limiting in lib/rate-limit/server.ts. Rows are
-- written and read only by authenticated Next.js routes using the service
-- role, so browser roles get no direct access. Counters are keyed by a
-- fixed window start (computed server-side); old windows can be pruned by a
-- scheduled job (see the delete at the bottom) without affecting live limits.

create table if not exists public.rate_limit_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket_key, window_start)
);

create index if not exists rate_limit_counters_window_start_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;

-- Counters are server-managed via the service role only. Browser roles never
-- touch this table directly.
revoke all on table public.rate_limit_counters from anon, authenticated;

-- =====================================================================
-- increment_rate_limit: atomically bump and return a window's counter
-- =====================================================================
-- Upserts the (user, bucket, window) counter by 1 and returns the new value.
-- security definer so it runs with the owner's rights regardless of the
-- caller; only the service role may execute it.

create or replace function public.increment_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_window_start timestamptz
) returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limit_counters as r (user_id, bucket_key, window_start, count)
  values (p_user_id, p_bucket, p_window_start, 1)
  on conflict (user_id, bucket_key, window_start)
  do update set count = r.count + 1
  returning r.count;
$$;

revoke all on function public.increment_rate_limit(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(uuid, text, timestamptz) to service_role;

-- =====================================================================
-- Optional pruning (run on a schedule, e.g. pg_cron). Safe to skip; stale
-- windows are simply never read once their window has passed.
-- =====================================================================
-- delete from public.rate_limit_counters where window_start < now() - interval '1 day';
