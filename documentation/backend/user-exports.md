# User Exports & Audit Log

Every export triggered from the dashboard is generated server-side, archived to Supabase Storage, and logged to the `public.user_exports` table with full audit metadata. Users can re-download any past export from the **My exports** dialog in the header dropdown.

## High-level flow

```
ExportDialog
  └─ POST /api/exports/generate
       ├─ auth: resolveAuthenticatedUserId(token)
       ├─ role: profiles.role must be admin (canExportData), else 403
       ├─ datasets: must be enabled in lib/config/dashboard-access.ts, else 403
       ├─ hourly cap: count of the caller's user_exports rows, else 429
       ├─ buildServerExport()     ── SELECT * from each selected table, either
       │                              through the SQL filter engine (body.filters)
       │                              or constrained by the client-supplied key lists
       ├─ ExcelJS to xlsx Buffer
       ├─ supabase.storage.upload('user-exports', {user_id}/{export_id}.xlsx)
       ├─ INSERT INTO public.user_exports
       └─ 201 { id, filename, downloadPath }

ExportsDialog ("My exports")
  └─ GET /api/exports              ── lists the signed-in user's rows (newest 200)
  └─ GET /api/exports/{id}/download
       ├─ auth
       ├─ lookup row (must belong to caller, else 404)
       └─ 302 redirect to a 60 s Supabase Storage signed URL
          (or { url } JSON when the request sends Accept: application/json)
```

## Key files

| Path | Purpose |
|------|---------|
| `lib/exports/server-builder.ts` | Full-schema SELECT * + ExcelJS XLSX assembly |
| `app/api/exports/generate/route.ts` | POST: builds, uploads, logs |
| `app/api/exports/route.ts` | GET: lists a user's past exports |
| `app/api/exports/[id]/download/route.ts` | GET: signed-URL redirect for re-download |
| `lib/exports/request-client.ts` | Client helpers: `requestServerExport` (calls `/api/exports/generate`) and `resolveExportDownloadUrl` (fetches the signed URL as JSON) |
| `components/exports/export-dialog.tsx` | "Export" dialog that kicks off the request |
| `components/exports/exports-dialog.tsx` | "My exports" listing dialog (mounted in `app/page.tsx`, opened from the header profile menu) |
| `lib/supabase/server.ts` | Service-role Supabase client and the `USER_EXPORTS_BUCKET` constant |
| `lib/request/client-info.ts` | Extracts IP + UA from Next.js `Request` |
| `sql/user-exports-schema.sql` | Table, index, RLS enable and grant revocation DDL |
| `tests/api/exports-routes.test.ts` | Route tests for generate, list and download |

## Database schema

Table: `public.user_exports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK, matches the filename used in Storage |
| `user_id` | `uuid` | FK to `auth.users(id)` on delete cascade |
| `created_at` | `timestamptz` | Insert time |
| `filename` | `text` | `dashboard-export-YYYY-MM-DDTHH-MM-SS.xlsx` |
| `file_size_bytes` | `bigint` | Size of the uploaded XLSX |
| `storage_path` | `text` | `{user_id}/{export_id}.xlsx` in `user-exports` bucket |
| `datasets` | `text[]` | Which datasets were selected (`accounts`, `centers`, `services`, `prospects`) |
| `row_counts` | `jsonb` | `{ accounts: 123, centers: 45, ... }` (selected datasets only) |
| `total_rows` | `integer` | Sum of `row_counts` |
| `filters_applied` | `jsonb` | Snapshot of active dashboard filters at export time |
| `is_filtered` | `boolean` | `true` when the client reports filters were applied |
| `client_ip` | `text` | Real public IP (from `x-forwarded-for` + a client-side ipify fallback for localhost) |
| `user_agent` | `text` | `User-Agent` header |

Index: `user_exports_user_id_created_at_idx` on `(user_id, created_at desc)`, which serves both the listing and the hourly cap count.

RLS is enabled with no policies, and all table privileges are revoked from `anon` and `authenticated`: browsers have no direct access. Every read and write goes through the authenticated Next.js routes using the Supabase **service-role key**, which bypasses RLS. Ownership is enforced in the routes (`user_id` filter on the list, `user_id` match on download).

Storage: private bucket `user-exports`, path convention `{user_id}/{export_id}.xlsx`. No storage policies are needed (the schema file drops the old `users read own export objects` policy): uploads and signed URLs are created server-side with the service-role key.

## Setup

Required per environment:

1. Run `sql/user-exports-schema.sql` against the Supabase project (SQL Editor, paste, Run).
2. In **Supabase Dashboard > Storage**, create a **private** bucket named exactly `user-exports`.
3. Add env var `SUPABASE_SERVICE_ROLE_KEY`: the service-role secret key from Supabase > Project Settings > API. Server-only (do not prefix with `NEXT_PUBLIC_`).
4. Optional: `EXPORT_RATE_LIMIT_PER_HOUR` (default `20`) caps generations per user per rolling hour.

## Implementation notes

- **Why server-side?** Keeps ExcelJS off the client bundle, and lets exports include every column (`SELECT *`) while the dashboard's paginated endpoints keep narrow column projections.
- **Admin only.** The route reads `profiles.role` with the service-role client before parsing the body and returns 403 unless `canExportData()`; see [RBAC and Auth Guards](rbac-and-auth-guards.md).
- **Hourly cap.** Before building, the route counts the caller's `user_exports` rows from the last rolling hour and returns 429 at `EXPORT_RATE_LIMIT_PER_HOUR` (default 20). A failed count fails open. The list and download routes use the general per-minute limiter instead (`exports:list`, `exports:download`); see [Caching and Rate Limiting](caching-and-rate-limiting.md).
- **Filter preservation.** Two request shapes. "Export all filtered" sends the dashboard `filters` object; the route runs it through `parseFilters` + `resolveAccess` and the builder reuses the server-side SQL filter engine (see [Server-Mode Dashboard](server-dashboard-mode.md#export-by-filter)). Row-selection exports instead send key lists (`accountNames`, `centerKeys`, `prospectKeys`, `keylessProspectIds`, each capped at 5000 values), used in `= ANY(...)` clauses. When `filters` is present the key lists are ignored; when neither is present the server exports the full tables.
- **Deployment access enforcement.** Export availability is not just a UI concern. `app/api/exports/generate/route.ts` checks `lib/config/dashboard-access.ts` and rejects requests for datasets that are not procured for the current deployment.
- **Non-blocking progress bar.** The export dialog runs a staged ramp (Fetching, then Generating, then Uploading) while the request is in flight, then snaps to 100 % on response.
- **Re-download via signed URL.** `/api/exports/{id}/download` verifies ownership and returns a 302 to a 60-second Supabase Storage signed URL. Short TTL is fine because the browser follows the redirect immediately. The "My exports" dialog calls it with `Accept: application/json` (`resolveExportDownloadUrl`) and receives `{ url }` instead of a redirect.
- **PostgREST direct fetch for reads.** The listing and download-lookup routes talk to PostgREST directly (service-role key in `apikey` + `Authorization` headers) instead of supabase-js's `.select().eq()` chain. This side-steps a quirk where the newer `sb_secret_...` key format returned empty rows through supabase-js despite inserts/Storage working fine.
- **Cleanup on failure.** If the `user_exports` insert fails after the upload, the route deletes the uploaded object so Storage never holds unlogged exports.
- **IP capture.** `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` are tried first; if the request came from localhost, the client-supplied public IP (fetched from api.ipify.org before the POST) is used instead.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Supabase server config missing` in My exports, or `Export failed (500)` on generate | `SUPABASE_SERVICE_ROLE_KEY` not set | Add the env var and restart the dev server |
| `Export failed (403): ... Export access denied` | Caller's `profiles.role` is not `admin` | Promote the user (see [Supabase Auth Setup](supabase-auth-setup.md)) |
| `Export failed (429): ... Export rate limit reached` | Hourly cap hit | Wait, or raise `EXPORT_RATE_LIMIT_PER_HOUR` |
| `Failed to archive export` | Storage bucket missing or wrong name | Create a private bucket named exactly `user-exports` |
| `Failed to record export: relation "public.user_exports" does not exist` | Schema SQL not run | Run `sql/user-exports-schema.sql` |
| `Centers export is Not Procured.` (or similar) | The dataset is disabled in `lib/config/dashboard-access.ts` for this deployment | Re-enable the dataset in config, or remove it from the export selection |
| My exports dialog is empty despite rows in DB | Stale dev-server module cache | Hard-refresh the page; restart `next dev` |
| Re-download 404 | User signed in as a different account than when the export was made | Users only see their own exports by design |
