# Bamboo Reports: Security Fix Verification Report

**Date:** 2026-06-29
**Project:** BR-USER-AUTH-NEXTJS (Supabase id `qeidxxszpbzfdnqqmdkw`)
**Scope:** Verify that the Supabase hardening (owner-scoped `profiles` access) and the saved-filters RPC replacement were applied correctly, and audit the rest of the database for any further data leaks.
**Result:** PASS on every check. The broader audit found no additional leaks. No code, migrations, or database state were modified during verification.

## Summary

| # | Area | Check | Result |
|---|------|-------|--------|
| 1 | Database | RLS enabled on the 5 tables | PASS |
| 2 | Database | `profiles` SELECT policy is owner-scoped, no `(true)` | PASS |
| 3 | Database | No `authenticated` UPDATE on `role` / `credits_remaining` | PASS |
| 4 | Database | `lookup_shared_filter_owner_emails()` definer, search_path, body, grants | PASS |
| 5 | Database | `user_exports` has no browser grants | PASS |
| - | Live REST | Authenticated `GET /profiles` returns only the caller's row | PASS |
| 6 | Code | `use-saved-filters.ts` uses the scoped RPC, no cross-user profiles read | PASS |
| 7 | Code | Unit tests pass | PASS |
| 8 | Audit | No other table, view, schema, or function leaks data (see Appendix) | PASS |

## Method

Database checks were run as read-only `SELECT` queries against system catalogs through the Supabase SQL Editor (role `postgres`). The live REST check was run from the running app at `http://localhost:3000` using the active authenticated browser session (no passwords were entered or handled). Code and test checks were run against the connected repository.

## Database checks (live state)

### 1. RLS enabled on all 5 tables: PASS

`pg_class.relrowsecurity` is `true` for `profiles`, `saved_filters`, `filter_shares`, `user_favorites`, and `user_exports`.

```json
[
  { "tbl": "filter_shares",  "rls": true },
  { "tbl": "profiles",       "rls": true },
  { "tbl": "saved_filters",  "rls": true },
  { "tbl": "user_exports",   "rls": true },
  { "tbl": "user_favorites", "rls": true }
]
```

### 2. `profiles` SELECT policy is owner-scoped: PASS

There is exactly one SELECT policy on `profiles`, scoped to the owner. No policy uses `(true)` or otherwise grants broad read.

```json
{
  "cmd": "SELECT",
  "pol": "Profiles are viewable by owner",
  "tbl": "profiles",
  "roles": ["authenticated"],
  "qual": "(auth.uid() = user_id)",
  "wcheck": null
}
```

The other `profiles` policies are also owner-scoped: INSERT `with_check ((auth.uid() = user_id) AND (role = 'viewer'::text))`, and UPDATE `qual / with_check (auth.uid() = user_id)`.

### 3. No `authenticated` UPDATE on `role` or `credits_remaining`: PASS

Column-level UPDATE grants held by `authenticated` on `profiles` are exactly the six allowed columns. `role` and `credits_remaining` are not present. There is no table-level UPDATE grant (the only table-level grant for `authenticated` is `SELECT`).

```
email, first_name, last_name, phone, tour_completed_at, tour_version
```

### 4. `lookup_shared_filter_owner_emails()` function: PASS

The function exists, is `SECURITY DEFINER`, sets `search_path` to the empty string, filters on the caller via `fs.shared_with_user_id = auth.uid()`, and grants EXECUTE to `authenticated` only (no `anon`, no PUBLIC).

```sql
CREATE OR REPLACE FUNCTION public.lookup_shared_filter_owner_emails()
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct p.user_id, p.email
  from public.profiles as p
  join public.filter_shares as fs on fs.owner_user_id = p.user_id
  where fs.shared_with_user_id = auth.uid()
$function$
```

ACL: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. The absence of an `anon` entry and of a PUBLIC entry confirms EXECUTE is revoked from `anon` and PUBLIC (PUBLIC's default execute grant was removed).

### 5. `user_exports` has no browser grants: PASS

Querying `information_schema.role_table_grants` for grantees `anon`, `authenticated`, and `public` on `user_exports` returned an empty set (`[]`).

## Live REST behavior

An unfiltered `GET /rest/v1/profiles?select=*` was issued with `Prefer: count=exact` using a real authenticated session from the running app. The response returned only the caller's own row, with an exact total count of 1. Before the fix, this request would have returned every user's row.

Verified under two accounts:

```json
// abhishekf@researchnxt.com
{ "status": 200, "contentRange": "0-0/1", "rowCount": 1, "distinctUserIdCount": 1, "onlyOwnRow": true }

// ops@researchnxt.com  (userId 57715b89-46c3-484e-a69c-ab0ff56dbace)
{ "status": 200, "contentRange": "0-0/1", "rowCount": 1, "distinctUserIdCount": 1, "onlyOwnRow": true }
```

The SELECT policy keys off `auth.uid() = user_id` with no admin or role exception, so any authenticated user is constrained to their own row.

## Code checks

### 6. `hooks/use-saved-filters.ts` uses the scoped RPC: PASS

The shared-filters path calls the security-definer RPC and no longer performs a cross-user profiles read.

```ts
// Resolve owner emails via a security-definer RPC scoped to filters
// actually shared with the caller. Direct profile reads are owner-only,
// so a cross-user .from("profiles") read here would return nothing.
const { data: ownerProfiles } = await supabase.rpc(
  "lookup_shared_filter_owner_emails"
)
```

A grep of the file confirms the only occurrence of `.from("profiles")` is inside the explanatory comment above. There is no `.from("profiles").select(...).in("user_id", ...)` call.

### 7. Unit tests: PASS

```
npx vitest run tests/unit/supabase-security-migration.test.ts tests/unit/profiles-role-migration.test.ts

 ok tests/unit/profiles-role-migration.test.ts (2 tests)
 ok tests/unit/supabase-security-migration.test.ts (6 tests)

 Test Files  2 passed (2)
      Tests  8 passed (8)
```

## Appendix: Broader leak audit (all tables, views, functions, schemas)

Scope of this appendix: confirm nothing else is leaking beyond the five tables above. This was a read-only catalog and REST audit.

### Public schema is the full app surface

The `public` schema contains exactly five tables and no views or materialized views: `profiles`, `saved_filters`, `filter_shares`, `user_favorites`, `user_exports`. Every one has RLS enabled, none grants any privilege to `anon`, and all policies are owner-scoped (`auth.uid() = user_id`, `owner_user_id`, or `shared_with_user_id`). `user_exports` has no browser-role grants at all. No table has a broad `(true)` read policy.

### Only the public schema is exposed via the REST Data API

A live REST probe confirmed which schemas PostgREST exposes. Requests for tables in other schemas are rejected:

```
GET /rest/v1/subscription  (Accept-Profile: realtime) -> 406  schema not exposed
GET /rest/v1/objects       (Accept-Profile: storage)  -> 406  schema not exposed
GET /rest/v1/profiles      (public)                    -> 200
```

The Supabase-managed `realtime` and `storage` schemas hold internal tables (some with RLS off, for example `realtime.subscription` and `realtime.schema_migrations`), but they are not reachable through the REST Data API and are accessed only through their own dedicated, authenticated endpoints. They contain no application user data.

### SECURITY DEFINER functions

Two application functions are `SECURITY DEFINER`: `lookup_profile_by_email` and `lookup_shared_filter_owner_emails`. Both set `search_path` to the empty string, both grant EXECUTE to `authenticated` only (no `anon`, no PUBLIC), and both read minimal, caller-scoped data. No `SECURITY DEFINER` function anywhere is executable by `anon` or PUBLIC.

`lookup_profile_by_email` returns only `user_id` and `email` on an exact email match, requires `auth.uid() is not null`, and is limited to one row:

```sql
select p.user_id, p.email
from public.profiles as p
where auth.uid() is not null
  and lower(p.email) = lower(trim(input_email))
limit 1
```

Note (informational, not a finding): this lets an authenticated user confirm whether a given exact email has an account and resolve its `user_id`. That is inherent to the share-by-email feature and exposes no other profile fields. Add rate limiting if email enumeration is a concern.

### Audit result

No additional data leaks were found. The only REST-exposed schema is `public`, every table there is RLS-protected and owner-scoped with no anonymous access, and no definer function is callable anonymously.

## Conclusion

All database, live REST, and code checks pass. The `profiles` table is no longer readable across users, column-level write access excludes `role` and `credits_remaining`, the saved-filters feature uses a properly scoped security-definer RPC, and the supporting unit tests pass. The fix is correctly applied. The broader audit confirmed that the only REST-exposed schema is `public`, every table there is RLS-protected and owner-scoped with no anonymous access, and no `SECURITY DEFINER` function is callable anonymously, so no additional data leaks exist.
