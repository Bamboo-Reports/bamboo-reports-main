-- Add role support to profiles and default everyone to viewer.
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

-- Keep self-service profile writes from changing authorization roles.
-- Browser clients can create/update profile details, but role promotion must
-- happen through the SQL Editor, service-role code, or another trusted admin path.
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
grant update (
  first_name,
  last_name,
  email,
  phone,
  tour_completed_at,
  tour_version
) on public.profiles to authenticated;

-- Promote your test user to admin from a trusted SQL/admin context (replace placeholder).
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
