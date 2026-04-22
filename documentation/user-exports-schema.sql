-- =====================================================================
-- user_exports: audit log of data exports triggered from the dashboard
-- =====================================================================
-- Run this against the Supabase project (SQL Editor).
-- Also create a PRIVATE Storage bucket named `user-exports` in the
-- Supabase dashboard (Storage → New bucket → toggle OFF "Public bucket")
-- and add the policies at the bottom of this file.

create table if not exists public.user_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  filename text not null,
  file_size_bytes bigint not null,
  storage_path text not null,

  datasets text[] not null,
  row_counts jsonb not null,
  total_rows integer not null,

  filters_applied jsonb,
  is_filtered boolean not null default false,

  client_ip text,
  user_agent text
);

create index if not exists user_exports_user_id_created_at_idx
  on public.user_exports (user_id, created_at desc);

alter table public.user_exports enable row level security;

drop policy if exists "users read own exports" on public.user_exports;
create policy "users read own exports"
  on public.user_exports for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own exports" on public.user_exports;
create policy "users insert own exports"
  on public.user_exports for insert
  with check (auth.uid() = user_id);

-- =====================================================================
-- Storage bucket policies (bucket: user-exports, private)
-- =====================================================================
-- Object path convention: {user_id}/{export_id}.zip
-- The first folder segment must equal the authenticated user's UUID.

drop policy if exists "users read own export objects" on storage.objects;
create policy "users read own export objects"
  on storage.objects for select
  using (
    bucket_id = 'user-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Uploads are done server-side with the service-role key, which bypasses
-- RLS, so no insert policy is required for anon/authenticated roles.
