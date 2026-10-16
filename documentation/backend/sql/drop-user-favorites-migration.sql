-- Drop the retired favorites table.
--
-- The favorites feature was removed from the app on 2026-10-16. Nothing reads
-- or writes public.user_favorites any more. Dropping the table also drops its
-- RLS policies, index and grants. Applied to BR-USER-AUTH-NEXTJS on 2026-10-16.
--
-- Fresh projects: run this after supabase-security-hardening-migration.sql,
-- which still references user_favorites in its grant statements.

drop table if exists public.user_favorites;
