# Favorites and Filter Sharing

> **Scope:** The `user_favorites` and `filter_shares` Supabase tables, their RLS policies, and the client hooks built on top of them. For the base saved-filter JSON structure, see [Saved Filters](supabase-saved-filters.md).

---

## 1. User Favorites

Lets a signed-in user star an account, center, or prospect and revisit it later. Private per user; no sharing.

### Schema (`public.user_favorites`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK to `auth.users`, cascades on delete |
| `entity_type` | `text` | `'account' \| 'center' \| 'prospect'` (CHECK constraint) |
| `entity_id` | `text` | The entity's identity value (e.g. `account_global_legal_name`, `cn_unique_key`, `ps_unique_key`) |
| `title` | `text` | Denormalized display label, so the favorites list renders without re-joining the warehouse |
| `subtitle` | `text \| null` | Denormalized secondary line |
| `created_at` | `timestamptz` | |

`UNIQUE (user_id, entity_type, entity_id)` prevents duplicate favorites; the hook relies on this constraint via `upsert(..., ignoreDuplicates: true)` instead of checking existence first.

RLS: every policy scopes to `auth.uid() = user_id`. Full CRUD, no cross-user visibility. Migration: `sql/user-favorites-migration.sql`.

### Client Hook: `useFavorites`

`hooks/use-favorites.ts` owns the full favorites lifecycle:

- Tracks the current Supabase session internally (does not take `userId` as a prop) via `getSession()` + `onAuthStateChange`.
- `loadFavorites()` fetches all rows for the current user, newest first. **Fails open**: a query error (for example, the migration hasn't been applied yet) logs via `devError` and leaves `favorites` as an empty array rather than throwing, so the rest of the app keeps working.
- `isFavorite(type, id)` — O(1) lookup against a `Set` built from `favoriteKeys` (`useMemo`).
- `toggleFavorite(item)` — the primary entry point for star/unstar UI. Guards against a double-click race with `togglingRef` (a `Set` of in-flight keys): a second toggle on the same entity while one is still in flight is ignored rather than double-adding or double-removing.
- `addFavorites(items)` / `removeFavorite(type, id)` / `removeFavorites(items)` / `clearFavorites()` — bulk and single operations, each firing a PostHog event (`FAVORITE_ADDED` / `FAVORITE_REMOVED`) with `bulk: items.length > 1` on multi-item calls.

All mutation methods return `boolean` (or `{ ok, added } | null` for `toggleFavorite`) instead of throwing, so callers can show a toast on failure without a try/catch.

---

## 2. Filter Sharing

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

`UNIQUE (filter_id, shared_with_user_id)` — a filter can only be shared with the same user once.

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

`filter-shares-migration.sql` assumes `public.saved_filters` and `public.profiles` already exist (see [Supabase Auth Setup](supabase-auth-setup.md) and [Saved Filters](supabase-saved-filters.md)). Apply migrations in this order for a fresh project: `supabase-auth-setup` → `supabase-saved-filters` → `filter-shares-migration` → `user-favorites-migration` (the last two are independent of each other).

---

## Related Files

| File | Purpose |
|------|---------|
| `hooks/use-favorites.ts` | Favorites state, CRUD, toggle-race guard |
| `sql/user-favorites-migration.sql` | `user_favorites` table, index, RLS policies |
| `sql/filter-shares-migration.sql` | `filter_shares` table, RLS policies, lookup functions |
| `documentation/backend/supabase-saved-filters.md` | Base `saved_filters` JSON structure |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table and auth setup |
| `lib/analytics/events.ts` | `FAVORITE_ADDED` / `FAVORITE_REMOVED` event definitions |
