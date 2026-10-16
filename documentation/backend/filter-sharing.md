# Filter Sharing

> **Scope:** The `filter_shares` Supabase table, its RLS policies, and the client hook built on top of it. For the base saved-filter JSON structure, see [Saved Filters](supabase-saved-filters.md).

---

## Retired: User Favorites

The favorites feature (star an account, center or prospect and revisit it from a list) was removed from the app on 2026-10-16. The `public.user_favorites` table and `sql/user-favorites-migration.sql` are kept only because `sql/supabase-security-hardening-migration.sql` still references the table; nothing in the app reads or writes it. Drop the table once you no longer need the old rows.

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

Migration: `sql/filter-shares-migration.sql` (also adds `profiles_email_lower_idx` on `lower(email)` for the lookup below).

### RLS Model

Sharing by email needs a way to look up a user's ID from an email address without exposing the entire `profiles` table to every authenticated user. This is solved with two `SECURITY DEFINER` SQL functions instead of a broad SELECT policy:

| Function | Purpose | Exposure |
|----------|---------|----------|
| `lookup_profile_by_email(input_email)` | Resolves one profile by exact (case-insensitive) email match, for the "share with" input | Returns at most one row matching the queried email; caller must be authenticated |
| `lookup_shared_filter_owner_emails()` | Resolves the emails of everyone who has shared a filter with the caller | Scoped to rows in `filter_shares` where `shared_with_user_id = auth.uid()`; never returns unrelated profiles |

Both are `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT EXECUTE ... TO authenticated`, and both set `search_path = ''` to avoid search-path hijacking in a `SECURITY DEFINER` function. This pattern (narrow RPC instead of a permissive RLS SELECT policy) is the template to follow for any future "look up another user by X" feature.

`saved_filters` gets one added policy: a recipient can `SELECT` a filter if a matching row exists in `filter_shares` for them. This is additive; it does not touch the owner's existing full-access policy on their own filters.

Account list sharing (`account_list_shares`, see [Account Lists](account-lists.md)) reuses this model: the same `lookup_profile_by_email` for the share input, a recipient `SELECT` policy on `account_lists`, and its own scoped `lookup_shared_account_list_owner_emails()` RPC.

`sql/supabase-security-hardening-migration.sql` re-creates both lookup functions, revokes all `anon` table access on `profiles`, `saved_filters`, `filter_shares`, `user_favorites` and `user_exports`, and re-grants `select, insert, update, delete` on `saved_filters`, `filter_shares` and `user_favorites` to `authenticated`.

### Reading This as a Migration Order Dependency

`filter-shares-migration.sql` assumes `public.saved_filters` and `public.profiles` already exist (see [Supabase Auth Setup](supabase-auth-setup.md) and [Saved Filters](supabase-saved-filters.md)). Apply migrations in this order for a fresh project: `supabase-auth-setup`, then `supabase-saved-filters`, then `filter-shares-migration` and `user-favorites-migration` (independent of each other; the latter only because the hardening migration references `user_favorites`), then `account-lists-migration` followed by `account-list-shares-migration` (which needs `lookup_profile_by_email` from the filter-shares migration). Run `supabase-security-hardening-migration` last.

---

## Related Files

| File | Purpose |
|------|---------|
| `hooks/use-saved-filters.ts` | Saved filters CRUD plus share, unshare and "Shared with me" loading (calls both lookup RPCs) |
| `sql/user-favorites-migration.sql` | Retired `user_favorites` table (still referenced by the hardening migration) |
| `sql/filter-shares-migration.sql` | `filter_shares` table, RLS policies, lookup functions |
| `sql/supabase-security-hardening-migration.sql` | Grant tightening and RLS re-enable across the user-data tables |
| `documentation/backend/supabase-saved-filters.md` | Base `saved_filters` JSON structure |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table and auth setup |
