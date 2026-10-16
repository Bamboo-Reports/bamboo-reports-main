-- Daily cleanup of expired rate-limit counters (pg_cron).
-- Applied to BR-USER-AUTH-NEXTJS on 2026-10-16. Safe to re-run.
--
-- rate_limit_counters is the Supabase fallback store for lib/rate-limit/server.ts
-- (used when Upstash Redis is not configured). Every (user, bucket, window)
-- leaves a row behind and only the current window is ever read, so old rows
-- are dead weight. The longest window is 1 hour (exports), so deleting rows
-- older than 1 day never affects a live limit. The delete uses
-- rate_limit_counters_window_start_idx.

-- Enable Supabase Cron (pg_cron), as in https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Every day at 03:17 UTC. cron.schedule with an existing job name updates it,
-- so re-running this file does not create duplicates.
select cron.schedule(
  'prune-rate-limit-counters',
  '17 3 * * *',
  $$delete from public.rate_limit_counters where window_start < now() - interval '1 day'$$
);

-- To stop it: select cron.unschedule('prune-rate-limit-counters');
