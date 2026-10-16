# Account Lists

Clients often hand over their own account list and want the dashboard stats limited to it. Account lists are a first-class object (like LinkedIn Sales Navigator lists): upload once, apply from the sidebar, reuse inside any saved filter, update in place.

## Data

Supabase table `account_lists` (migration: `sql/account-lists-migration.sql`), owner-scoped by RLS.

| Column | Notes |
| :--- | :--- |
| `id`, `user_id` | Owner is the uploader. |
| `name` | Shown in the sidebar picker and the manage dialog. |
| `accounts` | JSON array of exact `account_global_legal_name` values. |
| `account_count` | Denormalized length of `accounts`. |
| `unmatched` | Uploaded names that were not mapped, kept for reference. |
| `source_file` | Original file name, if uploaded from a file. |

The warehouse is not touched. Lists live next to saved filters in the Supabase user-data store.

## Flow

1. **Upload** (`components/filters/account-list-upload-dialog.tsx`): drop a CSV/TSV/TXT/XLSX or paste names (spreadsheets are read client-side with ExcelJS, which cannot read the legacy `.xls` format, so those are rejected with a "save as .xlsx or CSV" message). The name column is auto-detected (`lib/accounts/account-list-parser.ts`) and names are de-duplicated.
2. **Match** (`POST /api/accounts/match`, `lib/accounts/account-match.ts`): each name is resolved to a warehouse account by exact name, alias, suffix-insensitive key, or offered fuzzy candidates. Statuses: matched, review, not found. At most 1000 names per call (`MAX_MATCH_NAMES`), 20 calls per minute per user (`accounts:match` bucket); the account and alias name rows behind the index are cached for 24 h under `account-match:index-rows` (see [Caching and Rate Limiting](caching-and-rate-limiting.md)).
3. **Review**: per-row picker (`components/filters/account-picker.tsx`) to confirm, change or clear the mapping. Unmapped rows go to `unmatched`.
4. **Save list**: creates a row in `account_lists`, or replaces the accounts of an existing list when opened from "Update from a new file". "Save and apply" also adds the list to the current filters.

## Filtering

Two filter keys on `Filters` work together:

- `accountListValues`: the selected lists (`FilterValue[]`, value = list id, include or exclude).
- `accountNameValues`: exact account names, derived from the lists on the client (`expandAccountLists` in `lib/accounts/account-lists.ts`). This is what the SQL builder (`valueClause`) and the client engine (`createValueMatcher`) use. Like the name keyword search it bypasses the GCC visibility clause.

Expansion happens whenever the sidebar selection changes (`withAccountLists`) and whenever a saved filter is loaded (`handleLoadSavedFilters`), so list edits reach saved filters that reference them. A saved filter that references a list the viewer cannot see (deleted, or shared by someone else) keeps the names it was saved with. The server never reads `account_lists`; it only sees names, so response caching keyed on filters stays correct.

## UI

- Sidebar, account section: "Account List" picker (`components/filters/account-list-picker.tsx`), rendered with the shared `EnhancedMultiSelect` (chips, include/exclude, search) and showing the account count.
- Saved filters panel: the upload icon button (next to Save) opens "Account Lists" (`components/filters/account-lists-dialog.tsx`) to upload, apply, rename, update from a file, inspect accounts and unmatched names, share, or delete. Lists shared with the caller appear in a separate "Shared with me" section.
- Saved filter cards and the summary PDF show the list as a count ("2 lists, 340 accounts") rather than every name.

## Provider

`contexts/account-lists-context.tsx` loads the caller's own lists plus the lists shared with them once, and exposes `refresh`, `createList`, `updateList`, `deleteList`, `shareList`, `unshareList` and `getListShares`. If the shares query fails (for example the shares migration is not applied yet) the error is logged and the caller's own lists still load. It is mounted in `app/providers.tsx` so the sidebar picker, the upload dialog, the manage dialog and the filters hook all see the same state.

## Sharing

`account_list_shares` (migration: `sql/account-list-shares-migration.sql`) mirrors `filter_shares`: owners share a list by email (`lookup_profile_by_email`; sharing with yourself or sharing twice is rejected, the latter via the `UNIQUE(list_id, shared_with_user_id)` constraint), recipients get read-only SELECT on the list through an RLS policy, and owner emails for the "Shared with me" section come from `lookup_shared_account_list_owner_emails` (falling back to "a teammate"). Shared lists appear in the sidebar picker and can be applied, inspected and used in saved filters; only the owner can rename, update, share or delete.

## Follow-ups

- Server-side expansion if lists ever need to be applied without the client (scheduled exports, API consumers).
