-- Notification center support for weekly sheet refresh imports.
-- This migration supports field-level change events across all import tables
-- (`accounts`, `centers`, `services`, `functions`, `tech`, `prospects`).
-- The tables are stored in the dedicated `audit` schema.

create schema if not exists audit;

do $$
begin
  if to_regclass('public.import_runs') is not null
     and to_regclass('audit.import_runs') is null then
    alter table public.import_runs set schema audit;
  end if;

  if to_regclass('public.field_change_events') is not null
     and to_regclass('audit.field_change_events') is null then
    alter table public.field_change_events set schema audit;
  end if;

  if to_regclass('public.notification_reads') is not null
     and to_regclass('audit.notification_reads') is null then
    alter table public.notification_reads set schema audit;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.account_change_events') is not null then
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'account_change_events'
        and c.relkind = 'v'
    ) then
      drop view public.account_change_events;
    end if;
  end if;

  if to_regclass('public.account_change_events') is not null then
    drop table public.account_change_events;
  end if;
end
$$;

create table if not exists audit.import_runs (
  id bigserial primary key,
  source text not null,
  target_tables_json text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  tables_loaded integer not null default 0,
  change_events_logged integer not null default 0,
  error_message text
);

create table if not exists audit.field_change_events (
  id bigserial primary key,
  import_run_id bigint not null references audit.import_runs(id) on delete cascade,
  table_name text not null default 'accounts',
  record_uuid text,
  record_identity text,
  record_label text,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

alter table audit.field_change_events
  add column if not exists table_name text;

alter table audit.field_change_events
  add column if not exists record_uuid text;

alter table audit.field_change_events
  add column if not exists record_identity text;

alter table audit.field_change_events
  add column if not exists record_label text;

alter table audit.field_change_events
  alter column table_name set default 'accounts';

update audit.field_change_events
set table_name = 'accounts'
where table_name is null;

update audit.field_change_events
set record_label = coalesce(record_label, record_identity)
where record_label is null;

update audit.field_change_events
set record_identity = concat('uuid:', record_uuid)
where record_identity is null and record_uuid is not null;

alter table audit.field_change_events
  drop column if exists account_uuid;

alter table audit.field_change_events
  drop column if exists account_global_legal_name;

-- user_id should store Supabase auth.users.id UUID.
-- No FK can be added here because users live in a separate Supabase database.
create table if not exists audit.notification_reads (
  id bigserial primary key,
  user_id uuid not null,
  change_event_id bigint not null references audit.field_change_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, change_event_id)
);

create index if not exists field_change_events_changed_at_idx
  on audit.field_change_events (changed_at desc);

create index if not exists field_change_events_identity_field_idx
  on audit.field_change_events (table_name, record_identity, field_name, changed_at desc);

create index if not exists field_change_events_table_changed_idx
  on audit.field_change_events (table_name, changed_at desc);

create index if not exists field_change_events_record_uuid_idx
  on audit.field_change_events (record_uuid, changed_at desc);

create index if not exists notification_reads_user_read_at_idx
  on audit.notification_reads (user_id, read_at desc);
