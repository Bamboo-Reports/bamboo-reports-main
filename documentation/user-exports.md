# User Exports & Audit Log

Every export triggered from the dashboard is generated server-side, archived to Supabase Storage, and logged to the `public.user_exports` table with full audit metadata. Users can re-download any past export from the **My exports** dialog in the header dropdown.

## High-level flow

```
ExportDialog
  └─ POST /api/exports/generate
       ├─ auth: resolveAuthenticatedUserId(token)
       ├─ buildServerExport()     ── SELECT * from each selected table (respecting
       │                              the client-supplied account_global_legal_name
       │                              and cn_unique_key lists when filtered)
       ├─ ExcelJS → xlsx Buffer
       ├─ supabase.storage.upload('user-exports', {user_id}/{export_id}.xlsx)
       ├─ INSERT INTO public.user_exports
       └─ 201 { id, filename, downloadPath }

ExportsDialog ("My exports")
  └─ GET /api/exports              ── lists the signed-in user's rows
  └─ GET /api/exports/{id}/download
       ├─ auth
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
| `lib/exports/request-client.ts` | Client helper — calls `/api/exports/generate` |
| `components/export/export-dialog.tsx` | "Export" dialog that kicks off the request |
| `components/exports/exports-dialog.tsx` | "My exports" listing dialog |
| `lib/supabase/server.ts` | Service-role Supabase client (for Storage ops) |
| `lib/request/client-info.ts` | Extracts IP + UA from Next.js `Request` |
| `documentation/user-exports-schema.sql` | Table + RLS + Storage policy DDL |

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

RLS is enabled; users can only SELECT/INSERT their own rows. All server endpoints use the Supabase **service-role key**, which bypasses RLS for legitimate reads/writes.

Storage: private bucket `user-exports`, path convention `{user_id}/{export_id}.xlsx`. The only RLS policy is a SELECT restriction (users can only read objects under their own folder); uploads happen with the service-role key.

## Setup

Required per environment:

1. Run `documentation/user-exports-schema.sql` against the Supabase project (SQL Editor → paste → Run).
2. In **Supabase Dashboard → Storage**, create a **private** bucket named exactly `user-exports`.
3. Add env var `SUPABASE_SERVICE_ROLE_KEY` — the service-role secret key from Supabase → Project Settings → API. Server-only (do not prefix with `NEXT_PUBLIC_`).

## Implementation notes

- **Why server-side?** Keeps ExcelJS off the client bundle, and lets exports include every column (`SELECT *`) without bloating the dashboard's initial payload. The dashboard `GET /api/dashboard` still uses narrow SELECT lists for speed.
- **Filter preservation.** The client sends `account_global_legal_name[]` and `cn_unique_key[]` lists derived from the current filtered data. The server uses them in `= ANY(...)` clauses to constrain the SELECT. When the user hasn't filtered, the lists are `null` and the server exports the full tables.
- **Deployment access enforcement.** Export availability is not just a UI concern. `app/api/exports/generate/route.ts` checks `lib/config/dashboard-access.ts` and rejects requests for datasets that are not procured for the current deployment.
- **Prospect packaging enforcement.** If `limits.prospectsPerAccount` is configured in `lib/config/dashboard-access.ts`, exports apply the same per-account prospect cap as the dashboard UI so customers cannot export hidden contacts.
- **Non-blocking progress bar.** The export dialog runs a staged ramp (Fetching → Generating → Uploading) while the request is in flight, then snaps to 100 % on response.
- **Re-download via signed URL.** `/api/exports/{id}/download` verifies ownership and returns a 302 to a 60-second Supabase Storage signed URL. Short TTL is fine because the browser follows the redirect immediately.
- **PostgREST direct fetch for reads.** The listing and download-lookup routes talk to PostgREST directly (service-role key in `apikey` + `Authorization` headers) instead of supabase-js's `.select().eq()` chain. This side-steps a quirk where the newer `sb_secret_...` key format returned empty rows through supabase-js despite inserts/Storage working fine.
- **IP capture.** `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` are tried first; if the request came from localhost, the client-supplied public IP (fetched from api.ipify.org before the POST) is used instead.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Export failed: Supabase server config missing` | `SUPABASE_SERVICE_ROLE_KEY` not set | Add the env var and restart the dev server |
| `Failed to archive export` | Storage bucket missing or wrong name | Create a private bucket named exactly `user-exports` |
| `Failed to record export: relation "public.user_exports" does not exist` | Schema SQL not run | Run `documentation/user-exports-schema.sql` |
| `Centers export is Not Procured.` (or similar) | The dataset is disabled in `lib/config/dashboard-access.ts` for this deployment | Re-enable the dataset in config, or remove it from the export selection |
| My exports dialog is empty despite rows in DB | Stale dev-server module cache | Hard-refresh the page; restart `next dev` |
| Re-download 404 | User signed in as a different account than when the export was made | Users only see their own exports by design |
