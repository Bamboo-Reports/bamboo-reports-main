# Supabase Auth & Profiles Setup

This guide details the authentication setup using Supabase, including the necessary environment variables, the `profiles` table schema, Row Level Security (RLS) policies, and integration patterns.

> **Role:** Managing user identities and associating them with application-specific data (like profiles and saved filters).

---

## 1. Environment Variables

Ensure these are set in your `.env.local` (for local development) and your deployment environment (Vercel).

| Variable | Description | Required |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | The unique API URL for your Supabase project. | **Yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public API key (safe for browser use). Used by the client to authenticate. | **Yes** |

---

## 2. Table: `profiles`

This table extends the default `auth.users` table provided by Supabase. It stores application-specific user data that `auth.users` does not handle.

### 2.1 Schema Definition

Run this SQL in the Supabase SQL Editor to create the table.

```sql
create table if not exists public.profiles (
  -- PK linked to Supabase Auth User ID
  id uuid primary key default gen_random_uuid(),
  
  -- Foreign Key to auth.users. 
  -- ON DELETE CASCADE ensures profile is removed if the user account is deleted.
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- User Details
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for faster lookups by user_id
create unique index if not exists profiles_user_id_key on public.profiles(user_id);
```

### 2.2 Row Level Security (RLS) Policies

RLS is **mandatory**. Without it, the table is publicly inaccessible or (if misconfigured) publicly writable. These policies ensure users can only access their own data.

```sql
-- 1. Enable RLS
alter table public.profiles enable row level security;

-- 2. View Policy: Users can only see their own profile
create policy "Profiles are viewable by owner"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

-- 3. Insert Policy: Users can create their own profile
-- (Usually triggered by a signup flow or a trigger on auth.users).
-- New self-service profiles must start as viewers.
create policy "Profiles are insertable by owner"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id and role = 'viewer');

-- 4. Update Policy: Users can update their own profile
create policy "Profiles are updatable by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5. Column Privileges: authenticated users can manage profile details,
-- but cannot set or update role from the browser.
revoke insert, update on public.profiles from authenticated;
grant insert (user_id, first_name, last_name, email, phone) on public.profiles to authenticated;
grant update (first_name, last_name, email, phone) on public.profiles to authenticated;
```

### 2.3 Auto-Update Trigger

Automatically updates the `updated_at` column when a row is modified.

```sql
-- Function to set timestamp
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger definition
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
```

### 2.4 Add Roles to Existing `profiles` Tables

If your `profiles` table already exists without the `role` column, run this migration:

```sql
alter table public.profiles add column if not exists role text;

update public.profiles
set role = 'viewer'
where role is null;

alter table public.profiles
alter column role set default 'viewer';

alter table public.profiles
alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('viewer', 'admin'));
  end if;
end $$;

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id and role = 'viewer');

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke insert, update on public.profiles from authenticated;
grant insert (user_id, first_name, last_name, email, phone) on public.profiles to authenticated;
grant update (first_name, last_name, email, phone) on public.profiles to authenticated;
```

Then assign your test/admin user from the Supabase SQL Editor, service-role code, or another trusted admin path:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

Do not expose role promotion through browser Supabase clients. Authenticated users intentionally do not receive `insert` or `update` privileges on the `role` column.

You can also run the same SQL from: `documentation/sql/profiles-role-migration.sql`.

---

## 3. Integration Logic

### 3.1 Client-Side (Next.js)
The application uses `@supabase/auth-helpers-nextjs` or `@supabase/ssr` (depending on the version) to handle sessions.

- **Authentication Flow:** Users sign in via Supabase Auth.
- **Session Management:** The client receives a JWT.
- **Profile Fetching:**
    - On load, the app can fetch the user's profile using `supabase.from('profiles').select('*').single()`.
    - Because of RLS, this query requires no `where` clause security-wise, but `eq('user_id', user.id)` is good practice.
    - Use `profile.role` for UI hints only. Server endpoints must re-check role permissions before protected operations such as exports.

### 3.2 Server-Side (Actions/API)
When accessing data server-side (e.g., in `app/actions.ts` or API routes):
1.  Verify the session using `supabase.auth.getSession()`.
2.  Use the `user.id` from the session to perform operations on the `profiles` table.

---

## 4. Maintenance & Debugging

-   **Duplicate Users:** The `profiles_user_id_key` unique index prevents multiple profile rows for a single auth user.
-   **Email Sync:** Note that `email` in `public.profiles` is redundant with `auth.users.email`. If a user changes their email in Auth, a trigger or manual update is needed to sync it here.
