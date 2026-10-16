# 2026-10-16: Repo cleanup, docs refresh, UI tweaks and Supabase review

Session log for PR #268 (`chore/repo-cleanup`). Covers what changed, why, and what is still open. Detailed behaviour lives in the linked docs; this file is the record of the session.

---

## 1. Repo organization and dead code

- **Agent skills:** removed 18 skills unrelated to this app from `.agents/` and updated `skills-lock.json`.
- **Temporary tooling removed:** the Neon benchmark (`scripts/benchmark/`, `vitest.bench.config.ts`, `npm run bench`), the Redis benchmark write-up, `scripts/generate_work_summary.py` and `documentation/scripts-and-tooling.md`. `scripts/` no longer exists.
- **Dead code removed:**
  - `app/actions.ts` and `app/actions/system.ts`
  - the Services tab with its row, and the Functions table row
  - the test-only `lib/dashboard/ticker-merge.ts` and `headcount.ts`
  - five functions nothing called
- **Components regrouped:**
  - `export/` merged into `exports/`
  - History dialog moved into `dialogs/`
  - global search and the notification bell moved into `layout/`
  - the multi-select and saved-filters components moved into `filters/`
  - the maintenance page moved into `states/`
- **Docs moved:** audit and session reports now live in `documentation/reports/`, and the tour SQL lives in `documentation/backend/sql/`.

## 2. Environment variables

- One `.env` file, copied from `.env.example`, because Prisma CLI and the real-data tests only read `.env`. The old `.env.local` and `for-vercel.env` were merged and deleted.
- `.env.example` gained the Upstash vars and notes on `KV_REST_API_*` and `LOG_LEVEL`.
- **Unused vars dropped:** `NEXT_PUBLIC_LOGO_DEV_KEY`, `BRANDFETCH_API_KEY`, the two `NEXT_PUBLIC_DEVTOOLS_*` vars, and `NEXT_PUBLIC_ENVIRONMENT_LABEL`. The header badge is now detected automatically (see section 4).
- `DIRECT_URL` is optional. It is only for Prisma CLI schema commands, which this project does not run.

## 3. Documentation refresh

All docs were audited against the code and the commits since early September.

- **Added:**
  - account lists and sharing
  - prospect engagement
  - the AI services card and the summary PDF
  - Remix Icon
  - new schema columns
  - the ETL validator and terminal UI
  - per-environment rate limits
- **Removed:** the retired `/api/dashboard` route and packages that are no longer installed.
- **Corrected:** wrong claims about build config, auth storage, export RLS, filter labels, charts and ETL env paths.
- `favorites-and-filter-sharing.md` is now [`filter-sharing.md`](../backend/filter-sharing.md).

## 4. Fixes and UI changes

| Area | Change |
|------|--------|
| Account list upload | `.xls` is rejected with a "save as .xlsx or CSV" message (ExcelJS cannot read it). The limit is now 500 names (was 1000), and larger lists are blocked with a request to split the file instead of being silently cut. |
| Account Lists manager | The row reads "20 Accounts • 12 Oct 2026". Apply is now a "+" button (tooltip "Include"). The header button reads "Upload". The expand panel is gone. See [Account Lists](../backend/account-lists.md). |
| Sidebar | The account lists button shows an upload icon, with the tooltip "Upload Accounts". The separate "Summary PDF" button is gone: **Export** is now a menu with **Excel** and **Report** (the PDF), and shows "Preparing..." while the report builds. The menu is exactly as wide as the Export button, and each choice has a small file badge (green sheet for Excel, red document for Report). Viewers see a lock on Excel (tooltip "Only admins can export Excel"). Reset and Export are text-only (Export keeps its menu arrow). After loading a saved filter, the Saved Filters box shows its name until the filters are changed. Accessibility fixes from the critique: saved filters load with Enter, the per-row Share is its own menu item (reachable with arrow keys), "Manage all filters" works from the keyboard, Save stays focusable when no filters are applied and says "Apply a filter to save", and the light-theme primary blue is 39% lightness (white text 4.69:1, was 4.3:1). Buttons now share one corner radius, 7px from the `--radius-button` token in `app/globals.css` (used as `rounded-[var(--radius-button)]` so tailwind-merge can resolve it against `rounded-full`), the same as the tab switcher's tabs and their sliding highlight. Change that one variable to restyle every button. Every icon-only button is a circle: `size="icon"` is `rounded-full` in `components/ui/button.tsx`. That covers the sidebar collapse and expand, Save and Upload, the table column cog, the selection bar ✕, header Refresh, notifications and profile, and the row actions in the Account Lists and saved-filter dialogs. The small link and copy buttons in the centre and prospect dialogs are round too. The +/−/× controls inside filter chips are unchanged. The filters sidebar reserves its scrollbar track (`scrollbar-gutter: stable`, right padding 10px plus the 6px track), so opening an attributes section no longer shifts the content sideways. Pagination uses round ‹ › icon buttons (aria-labels "Previous page" and "Next page") instead of Previous and Next text buttons. The selection bar's pill buttons, the sidebar Save and Upload circles, the table column picker and the header search were brought in line. The selection bar itself is `rounded-xl` (12px), like the tab strip. Chips, badges and the avatar stay round. The account visibility switch (ALL / GCCs / NON-GCCs) now uses the shared `ViewSwitcher`, so it looks and behaves like the Chart / Data / Map switcher. Both switchers, and the Account Info / Centres / Prospects tabs in the account detail view, now slide a white highlight to the selected option (`SlidingTabsList` in `components/ui/tabs.tsx`; 200ms, off with reduced motion). The Export dialog's dataset cards were buttons wrapping a checkbox button (invalid nested buttons); they are now labels. The Export dialog no longer shows the "X rows will be included in this export." line or the per-dataset row count badges. The success toast reads "Report downloaded." |
| Product tour | Steps whose target is inside a faded-out container are skipped (saved filters and export when the sidebar is collapsed). The tour animates out when it ends. See [Product Tour](../frontend/product-tour.md). |
| Header | A solid amber **DEV** badge under `npm run dev`, **PREVIEW** on Vercel previews, and nothing in production (`getDevEnvironment()`). The blue outline around the logo is removed from the header, the loading skeleton and the standalone screens. |
| Favorites | The feature is removed entirely: hook, dialog, menu entry, right-click items, the selection-bar button and the analytics events. |
| Notifications | The 60s poll reused a cached access token, so a background tab that missed Supabase's auto-refresh kept sending an expired one (39 `bad_jwt: token is expired` rejections in 80 minutes in the auth logs). Each request now gets a fresh token from `getSession()`. |

## 5. Supabase (BR-USER-AUTH-NEXTJS) review

All of the changes below were applied to the live project through the Supabase MCP on 2026-10-16, and their SQL is in `documentation/backend/sql/`.

| Migration | What it did |
|-----------|-------------|
| `drop-user-favorites-migration.sql` | Dropped `public.user_favorites` (510 test rows from one user, May and June 2026) and its 4 policies. |
| `supabase-cleanup-2026-10-migration.sql` | Dropped `check_dashboard_access()`, which referenced tables dropped on 2026-07-01 and was not called anywhere. Dropped `profiles.credits_remaining` (never used, every row at the default). Rewrote all 17 RLS policies to `(select auth.uid())` with identical conditions. Indexed `owner_user_id` on `filter_shares` and `account_list_shares`. |
| `rate-limits-prune-cron-migration.sql` | Enabled Supabase Cron (`pg_cron`) and scheduled `prune-rate-limit-counters` daily at 03:17 UTC to delete rate-limit windows older than a day. The table previously grew forever. |

Also removed a 0-byte placeholder object from the `user-exports` bucket.

- **Advisors after the changes:** the `auth_rls_initplan` (17) and `unindexed_foreign_keys` (2) warnings are cleared.
- **Expected warnings that remain:**
  - the email lookup RPCs are callable by signed-in users, which sharing requires
  - `rate_limit_counters` and `user_exports` have no policies because they are server-only
  - multiple permissive SELECT policies, because "own" and "shared with me" are separate policies
  - recently created indexes not yet used

## 6. Open follow-ups

1. **Rotate the Neon `neondb_owner` password.** It was printed in a session transcript when `.env` was sourced in a shell (an unquoted `&` in `DATABASE_URL`). After resetting it, update the local `.env`, Vercel and `etl/V2/.env`.
2. **Enable leaked password protection** in the Supabase dashboard (Authentication, password settings).
3. **Delete the paused `BR-USER-AUTH` project** (`bzejpdedgsmirruilarb`) if it is no longer needed.
4. **Merge PR #268.** Until then, production still shows the favorites UI, whose table no longer exists. It fails open, but adding a favourite shows an error.
5. **Optional:** add `dotenv` as a direct dev dependency. `prisma.config.ts` and the real-data tests import it, but today it only arrives through Prisma.
