# 2026-07-29: Performance, Data Hygiene, and UI Fixes

One working session covering cache tuning for the weekly data cadence, the
invisible-character data incident, table sorting, the Brandfetch logo
migration, and several UI fixes. All commits are on `dev-work`.

## 1. Cache lifetime aligned with the weekly data cadence

Warehouse data updates once a week (Friday ETL), but the dashboard cache TTL
was 1 hour, recomputing the same aggregates ~168 times between imports.

- `DASHBOARD_CACHE_TTL_MS` raised to `691200000` (8 days = weekly cadence
  plus one day of slack). The ETL purge, not the TTL, is now the real
  invalidation. Set this in Vercel too.
- `etl/V2/run.sh` now execs `main_cache_purge.py`, which deletes all
  `dash:*` Redis keys after a successful import. `main.py` stays as the
  untouched no-purge backup (deliberate two-script policy).
- Upstash credentials added to `etl/V2/.env` (gitignored); purge verified
  firing on a real import run.
- Successful auth token validations cached for 60s in `lib/auth/server.ts`
  and the Supabase client hoisted to a singleton; the rate-limit RPC now
  runs concurrently with the cached compute in all five cached routes.
  Together this removes most of the ~330ms per-request floor.
- `/api/search` and `/api/accounts/autocomplete` now cache via
  `getOrCompute` (24h TTL, keyed by normalized term, same `dash:` prefix so
  the weekly purge clears them).
- Commits: `5e8e2ee`.

## 2. Table sorting: symbols, then numbers, then alphabetical

- `resolveOrder` (`lib/dashboard/entity-query.ts`) emits class-based
  ordering for text columns: leading symbol 0, digit 1, letter 2, then
  case-insensitive byte-order within the class, nulls always last. Numeric
  warehouse columns keep native numeric ordering.
- All three data views (accounts, centers, prospects) default to sorting by
  `account_global_legal_name` ascending.
- Commits: `f380b5a`, `f4603a9`.

## 3. The invisible-character incident (Freudenberg SE)

"Freudenberg SE" sorted next to `[24]7.ai` because the account name carried
a leading zero-width space (U+200B), invisible in Google Sheets but a
symbol to the sort. The dirty value was the primary key, so it propagated
across accounts, centers, prospects, services, tech, alias, ticker, and the
embedded `cn_unique_key` composites. A second value ("Harman India
International") had mid-word ZWSPs, and ~278 sheet cells total carried
invisible characters.

Fixed at three layers:

1. **Source**: Google Sheet cleaned via Sheets API find-and-replace
   (Freudenberg targeted passes, then a full regex sweep of all
   zero-width/BOM/soft-hyphen characters, 157 occurrences). The ETL service
   account (`br-ingest-five@bamboo-reports.iam.gserviceaccount.com`) now
   has editor access for this.
2. **Pipeline**: `main_cache_purge.py` strips U+200B, U+200C, U+200D,
   U+FEFF, and U+00AD from every text value and before numeric parsing
   (`e526d53`). The validator
   (`etl/data_validator/validate.py`, copied into the repo in `6666b40`)
   gained Phase 0B, which fails validation listing exact sheet/row/column
   for any invisible character.
3. **Warehouse**: rewritten clean by the next import; verified zero
   occurrences across all 137 text columns in 8 tables, FKs intact.

Open item: 17 genuinely malformed prospect emails (spaces, slash, trailing
comma) reported to the data team. Validator Phase 0 flags them; 3 more
flagged emails are false positives (apostrophes are legal) and need a
validator regex fix eventually.

## 4. Company logos: logo.dev replaced with Brandfetch

- `components/ui/company-logo.tsx` builds
  `https://cdn.brandfetch.io/domain/{domain}/w/{s}/h/{s}[/theme/{t}]/fallback/404/type/icon.png?c={clientId}`.
- Client ID env: `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` (set in `.env`; add to
  Vercel). `BRANDFETCH_API_KEY` is parked for future Brand API use.
- Images load `unoptimized` because Brandfetch bot protection blocks the
  Next image optimizer's server-side fetch; the CDN already serves
  exact-size images. Format is PNG by request (WebP and JPEG also
  available via extension; no SVG on this endpoint).
- `fallback/404` keeps the old behavior: missing logo renders the monogram.
- Old `NEXT_PUBLIC_LOGO_DEV_KEY` is dead and can be removed.
- Commits: `c097f9f`, `1f0288d`, `b10a29d`. See `logo-integration.md`.

## 5. UI fixes

- Filter sidebar placeholders matched to their labels (Segment, Sub
  Industry, Services Offered, both headcount filters): `348e36b`.
- Summary-card loading skeletons no longer shift the page: the skeleton
  now contains invisible copies of the real typography so line boxes match
  exactly (measured 108px stable through the loading cycle, previously
  109.5px during skeletons): `f4b4b05`, `7a7d223`, `785bded`.
- Top progress bar thickened from 2px to 4px: `0777d06`.
- Account name autocomplete and global search show "Searching" with a
  spinner while a lookup is in flight instead of a premature "no results";
  global search also hints below the 2-character minimum: `f507293`.

## Operational notes

- The weekly flow is now: `etl/data_validator/validate.py` (fails on format
  or invisible characters), then `etl/V2/run.sh` (import + automatic cache
  purge). No manual cache clearing needed.
- Post-import, the first dashboard load pays one cold recompute (~5s for
  facets), then the cache is warm for the week. Cache warming was
  considered and deferred.
- Env vars to mirror in Vercel: `DASHBOARD_CACHE_TTL_MS=691200000`,
  `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`.
