# User Exports & Audit Log

Every export triggered from the dashboard is generated server-side, archived to Supabase Storage, and logged to the `public.user_exports` table with full audit metadata. Users can re-download any past export from the **My exports** dialog in the header dropdown.

## High-level flow

```
ExportDialog
  └─ POST /api/exports/generate
       ├─ auth: resolveAuthenticatedUserId(token)
       ├─ role: profiles.role must pass canExportData() (admin), else 403
       ├─ body validation, dataset access check, hourly export rate limit (429)
       ├─ buildServerExport()     ── SELECT * from each selected table, scoped by
       │                              the `filters` body when present, otherwise
       │                              by the client-supplied name/key lists
       ├─ ExcelJS → xlsx Buffer
       ├─ supabase.storage.upload('user-exports', {user_id}/{export_id}.xlsx)
       ├─ INSERT INTO public.user_exports
       └─ 201 { id, filename, downloadPath }

ExportsDialog ("My exports")
  └─ GET /api/exports              ── lists the signed-in user's rows (per-minute rate limit)
  └─ GET /api/exports/{id}/download
       ├─ auth + per-minute rate limit
       ├─ lookup row (must belong to caller)
       └─ 302 redirect to a 60 s Supabase Storage signed URL
```

## Key files

| Path | Purpose |
|------|---------|
| `lib/exports/server-builder.ts` | Full-schema SELECT * + ExcelJS XLSX assembly |
| `app/api/exports/generate/route.ts` | POST: builds, uploads, logs |
| `app/api/exports/route.ts` | GET: lists a user's past exports |
| `app/api/exports/[id]/download/route.ts` | GET: signed-URL redirect for re-download |
| `lib/exports/request-client.ts` | Client helper: calls `/api/exports/generate` |
| `components/export/export-dialog.tsx` | "Export" dialog that kicks off the request |
| `components/exports/exports-dialog.tsx` | "My exports" listing dialog |
| `lib/supabase/server.ts` | Service-role Supabase client (for Storage ops) |
| `lib/request/client-info.ts` | Extracts IP + UA from Next.js `Request` |
| `documentation/backend/sql/user-exports-schema.sql` | Table, RLS enablement, grant revocation DDL |

## Database schema

Table: `public.user_exports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK, matches the filename used in Storage |
| `user_id` | `uuid` | FK → `auth.users(id)` on delete cascade |
| `created_at` | `timestamptz` | Insert time |
| `filename` | `text` | `dashboard-export-YYYY-MM-DDTHH-MM-SS.xlsx` |
| `file_size_bytes` | `bigint` | Size of the uploaded XLSX |
| `storage_path` | `text` | `{user_id}/{export_id}.xlsx` in `user-exports` bucket |
| `datasets` | `text[]` | Which datasets were selected |
| `row_counts` | `jsonb` | `{ accounts: 123, centers: 45, ... }` |
| `total_rows` | `integer` | Sum of `row_counts` |
| `filters_applied` | `jsonb` | Snapshot of active dashboard filters at export time |
| `is_filtered` | `boolean` | `true` when filters were applied |
| `client_ip` | `text` | Real public IP (from `x-forwarded-for` + a client-side ipify fallback for localhost) |
| `user_agent` | `text` | `User-Agent` header |

RLS is enabled with no browser policies: the earlier "users read own exports" / "users insert own exports" policies are dropped (by `sql/user-exports-schema.sql` itself and again by `sql/supabase-security-hardening-migration.sql`), and all table grants are revoked from `anon` and `authenticated`. The table is reachable only through the Next.js routes above, which use the Supabase **service-role key** (bypasses RLS) and scope every read and write to the authenticated `user_id`.

Storage: private bucket `user-exports`, path convention `{user_id}/{export_id}.xlsx`. There is no storage RLS policy either (the old "users read own export objects" SELECT policy is dropped); uploads and signed download URLs are created server-side with the service-role key.

## Setup

Required per environment:

1. Run `documentation/backend/sql/user-exports-schema.sql` against the Supabase project (SQL Editor, paste, Run).
2. In **Supabase Dashboard → Storage**, create a **private** bucket named exactly `user-exports`.
3. Add env var `SUPABASE_SERVICE_ROLE_KEY`: the service-role secret key from Supabase → Project Settings → API. Server-only (do not prefix with `NEXT_PUBLIC_`).
4. Optional: set `EXPORT_RATE_LIMIT_PER_HOUR` (default 20 exports per user per rolling hour) and `DATA_RATE_LIMIT_PER_MIN` (default 60, used by the list and download routes).

## Implementation notes

- **Why server-side?** Keeps ExcelJS off the client bundle, and lets exports include every column (`SELECT *`) without bloating the dashboard's payloads, which select narrow column lists for speed.
- **Admin only.** The generate route resolves the caller's `profiles.role` with the service-role client before reading the body and returns 403 (`Export access denied`) unless `canExportData()` passes. The list and download routes have no role check; they only return the caller's own rows.
- **Filter preservation.** When the body carries a `filters` object (the dashboard filter state), the server validates it with `parseFilters` and rebuilds the accounts/centers/services/prospects queries from it; this takes precedence over the key lists. Otherwise the client's `accountNames`, `centerKeys`, `prospectKeys` and `keylessProspectIds` lists are used in `= ANY(...)` clauses to constrain the SELECT. Each list is capped at `MAX_FILTER_VALUES` (5000) entries by the Zod schema (larger bodies get a 400). When the user hasn't filtered, the lists are `null` and the server exports the full tables.
- **Rate limits.** Generate counts the caller's `user_exports` rows from the last hour and returns 429 once `EXPORT_RATE_LIMIT_PER_HOUR` (default 20) is reached; the check fails open on lookup errors. The list (`exports:list`) and download (`exports:download`) routes use `enforceRateLimit` from `lib/rate-limit/server.ts`, a per-minute budget (`DATA_RATE_LIMIT_PER_MIN`, default 60).
- **Deployment access enforcement.** Export availability is not just a UI concern. `app/api/exports/generate/route.ts` checks `lib/config/dashboard-access.ts` and rejects requests for datasets that are not procured for the current deployment.
- **Non-blocking progress bar.** The export dialog runs a staged ramp (Fetching → Generating → Uploading) while the request is in flight, then snaps to 100 % on response.
- **Re-download via signed URL.** `/api/exports/{id}/download` verifies ownership and returns a 302 to a 60-second Supabase Storage signed URL. Short TTL is fine because the browser follows the redirect immediately.
- **PostgREST direct fetch for reads.** The listing and download-lookup routes talk to PostgREST directly (service-role key in `apikey` + `Authorization` headers) instead of supabase-js's `.select().eq()` chain. This side-steps a quirk where the newer `sb_secret_...` key format returned empty rows through supabase-js despite inserts/Storage working fine.
- **IP capture.** `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` are tried first; if the request came from localhost, the client-supplied public IP (fetched from api.ipify.org before the POST) is used instead.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Supabase server config missing` / `Missing Supabase server env vars` | `SUPABASE_SERVICE_ROLE_KEY` not set | Add the env var and restart the dev server |
| `Export access denied` (403) | Caller's `profiles.role` is not `admin` | Promote the user to `admin` in `public.profiles` |
| `Export rate limit reached` (429) | More than `EXPORT_RATE_LIMIT_PER_HOUR` exports in the last hour | Wait, or raise the env var |
| `Failed to archive export` | Storage bucket missing or wrong name | Create a private bucket named exactly `user-exports` |
| `Failed to record export: relation "public.user_exports" does not exist` | Schema SQL not run | Run `documentation/backend/sql/user-exports-schema.sql` |
| `Centers export is Not Procured.` (or similar) | The dataset is disabled in `lib/config/dashboard-access.ts` for this deployment | Re-enable the dataset in config, or remove it from the export selection |
| My exports dialog is empty despite rows in DB | Stale dev-server module cache | Hard-refresh the page; restart `next dev` |
| Re-download 404 | User signed in as a different account than when the export was made | Users only see their own exports by design |
