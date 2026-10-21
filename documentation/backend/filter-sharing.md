# Filter Sharing

> **Scope:** The `filter_shares` Supabase table, its RLS policies, and the lookup functions behind sharing by email. For the base saved-filter JSON structure, see [Saved Filters](supabase-saved-filters.md).

---

## 1. Filter Sharing

Lets the owner of a saved filter share it with a specific teammate by email. The recipient gets read access to that one filter; nothing else.

### Schema (`public.filter_shares`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `filter_id` | `uuid` | FK to `public.saved_filters`, cascades on delete |
| `owner_user_id` | `uuid` | FK to `auth.users` |
| `shared_with_user_id` | `uuid` | FK to `auth.users` |
| `shared_with_email` | `text` | Denormalized, so the owner's UI can show who a share was sent to without a join |
| `created_at` | `timestamptz` | |

`UNIQUE (filter_id, shared_with_user_id)`: a filter can only be shared with the same user once.

Migration: `sql/filter-shares-migration.sql`.

### RLS Model

Sharing by email needs a way to look up a user's ID from an email address without exposing the entire `profiles` table to every authenticated user. This is solved with two `SECURITY DEFINER` SQL functions instead of a broad SELECT policy:

| Function | Purpose | Exposure |
|----------|---------|----------|
| `lookup_profile_by_email(input_email)` | Resolves one profile by exact (case-insensitive) email match, for the "share with" input | Returns at most one row matching the queried email; caller must be authenticated |
| `lookup_shared_filter_owner_emails()` | Resolves the emails of everyone who has shared a filter with the caller | Scoped to rows in `filter_shares` where `shared_with_user_id = auth.uid()`; never returns unrelated profiles |

Both are `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT EXECUTE ... TO authenticated`, and both set `search_path = ''` to avoid search-path hijacking in a `SECURITY DEFINER` function. This pattern (narrow RPC instead of a permissive RLS SELECT policy) is the template to follow for any future "look up another user by X" feature.

`saved_filters` gets one added policy: a recipient can `SELECT` a filter if a matching row exists in `filter_shares` for them. This is additive; it does not touch the owner's existing full-access policy on their own filters.

### Reading This as a Migration Order Dependency

`filter-shares-migration.sql` assumes `public.saved_filters` and `public.profiles` already exist (see [Supabase Auth Setup](supabase-auth-setup.md) and [Saved Filters](supabase-saved-filters.md)). Apply migrations in this order for a fresh project (files are in `documentation/backend/sql/` unless noted):

1. `supabase-auth-setup` (create `profiles` and `set_updated_at()`), with `lib/tour/migration.sql` run before its column grants, since they name `tour_completed_at` / `tour_version`. On an existing project without `role`, `profiles-role-migration.sql` goes here too, also after the tour migration.
2. `supabase-saved-filters` (`saved_filters`).
3. `filter-shares-migration.sql` (needs `saved_filters` and `profiles`; defines `lookup_profile_by_email`).
4. `account-lists-migration.sql` (only needs `auth.users`; defines its own trigger function).
5. `account-list-shares-migration.sql` (needs `account_lists` from 4 and `lookup_profile_by_email` from 3).
6. `user-exports-schema.sql` and `rate-limits-migration.sql` (each only needs `auth.users`; independent).
7. `rate-limits-prune-cron-migration.sql` (needs `rate_limit_counters` from 6; enables pg_cron and schedules the daily prune).
8. `supabase-security-hardening-migration.sql`: it alters `set_updated_at()`, re-grants the tour columns, and enables RLS / revokes grants on `profiles`, `saved_filters`, `filter_shares` and `user_exports`, so all of those must already exist.
9. `supabase-2026-10-cleanup-migration.sql` last: it rewrites the policies from steps 1 to 5 to evaluate `auth.uid()` once per query, adds the share owner indexes, and drops leftovers (`user_favorites`, `check_dashboard_access()`, `profiles.credits_remaining`).

The favorites feature (`user_favorites`) was removed in October 2026; its original migration is in `documentation/archive/sql/`.

---

## Related Files

| File | Purpose |
|------|---------|
| `sql/filter-shares-migration.sql` | `filter_shares` table, RLS policies, lookup functions |
| `documentation/backend/supabase-saved-filters.md` | Base `saved_filters` JSON structure |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table and auth setup |
| `sql/supabase-2026-10-cleanup-migration.sql` | Current form of the share policies and owner indexes |
