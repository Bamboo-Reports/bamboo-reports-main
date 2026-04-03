-- Notification simplification: replace per-event notification_reads with
-- a single high-water-mark timestamp per user.
--
-- Before running: ensure audit schema and tables exist
-- (see account-notifications-migration.sql).

-- 1. Create the new per-user state table.
create table if not exists audit.user_notification_state (
  user_id uuid primary key,
  last_read_at timestamptz not null default '1970-01-01T00:00:00Z'
);

-- 2. Seed from existing notification_reads (one row per user, latest read_at).
insert into audit.user_notification_state (user_id, last_read_at)
select user_id, max(read_at)
from audit.notification_reads
group by user_id
on conflict (user_id) do update
  set last_read_at = greatest(
    audit.user_notification_state.last_read_at,
    excluded.last_read_at
  );

-- 3. Index for fast unread queries (covers the common query pattern).
create index if not exists field_change_events_table_changed_at_idx
  on audit.field_change_events (table_name, changed_at desc);

-- 4. Clean up events older than 90 days (optional, run periodically).
-- delete from audit.field_change_events
-- where changed_at < now() - interval '90 days';

-- 5. After verification, drop the old per-event reads table:
-- drop table if exists audit.notification_reads;
