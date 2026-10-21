-- Daily cleanup of expired rate-limit counters with Supabase Cron (pg_cron).
-- Records a job already live on BR-USER-AUTH-NEXTJS (applied 2026-10-16).
-- Safe to re-run. Run after rate-limits-migration.sql.
--
-- rate_limit_counters is the fallback store for lib/rate-limit/server.ts when
-- Upstash Redis is not configured. Only the current window is ever read, and
-- the longest window is one hour (exports), so deleting rows older than a day
-- never affects a live limit. The delete uses rate_limit_counters_window_start_idx.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Every day at 03:17 UTC. Scheduling an existing job name updates it, so
-- re-running this file does not create a duplicate.
select cron.schedule(
  'prune-rate-limit-counters',
  '17 3 * * *',
  $$delete from public.rate_limit_counters where window_start < now() - interval '1 day'$$
);

-- To stop it: select cron.unschedule('prune-rate-limit-counters');
