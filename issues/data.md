# Bamboo Reports: data-exposure audit for the dev team

**Goal:** Ensure no user, including a full-access one, can download the entire dataset, and that no user can read data belonging to other users. **Method:** Live testing against the production app using a normal authenticated session whose role is **viewer** (the lowest tier). All probes were read-only or count-only. No data was exfiltrated. Code references are from the repo as read before it was taken private. **Test account role:** `viewer` (user\_id `aa1161d3…`).

---

## Severity summary

| \# | Severity | Issue | Status |
| :---- | :---- | :---- | :---- |
| 1 | **Critical** | `/api/dashboard` returns the entire dataset to any authenticated user | Confirmed live |
| 2 | **High** | `profiles` table is readable across all users (PII) via Supabase REST | Confirmed live |
| 3 | **Medium** | No rate limiting / bulk-extraction protection on data endpoints | Confirmed (by design today) |
| 4 | **Low** | `/api/exports/generate` validates body before checking authorization | Confirmed live |
| 5 | **Verify** | Export download route ownership (potential IDOR) not yet tested | Needs check |

**Confirmed safe (good):** warehouse tables (`accounts`, `centers`, `prospects`, `tech`, …) are **not** exposed through Supabase REST (404); `saved_filters`, `filter_shares`, `user_favorites` enforce per-user RLS (0 rows for other users); exports are correctly admin-gated (viewer gets 403); `/api/dashboard` rejects unauthenticated requests (401).

---

## 1\. Critical: the dashboard API ships the whole database

**What happens:** `GET /api/dashboard` with any valid bearer token returns the complete dataset in one gzipped response: \~2,668 accounts, 6,264 centers, 18,739 tech rows, 13,887 functions, 6,222 services, and **68,721 prospects including name, title, work email, and LinkedIn URL**, plus aliases. A viewer-level account receives all of it. The response is built once and cached in-memory for 1 hour (`CACHE_TTL`), identical for every user.

**Why:** `app/api/dashboard/route.ts` `requireAuth()` only checks that the token resolves to *a* user (`resolveAuthenticatedUserId`); it discards the user and returns `getDashboardData()` with no plan, role, or entitlement scoping. `account_visibility = 'exclude'` is used only in summary counts, so the 244 "locked" accounts ship in full too.

**Impact:** Any registered user can download the entire product, including all contact PII, with a single request. This is the primary "full download" vector and the one that matters most for your stated goal.

**Fix:**

- Scope the response to the caller's entitlement **on the server**. Pass the resolved user/plan into `getDashboardData(access)` and project columns and rows accordingly (the pattern already exists in `partitionProspectsByAccess` and `lib/config/dashboard-access.ts`; make it per-user instead of global config).  
- Drop `account_visibility = 'exclude'` rows from the returned arrays, not just from counts.  
- Never send contact PII (name/email/LinkedIn/title) to a token that is not entitled; default to the teaser shape.  
- Replace the single global mega-payload with **filtered, paginated, projected per-entity endpoints** (`/api/accounts?filters&page`, `/api/accounts/:id/centers`, etc.). The current design downloads the whole DB to the browser; pagination plus projection removes the bulk-download vector at the root. The global in-memory cache is incompatible with per-user entitlement and should be reworked (cache a free-base and a full variant, or cache per-entity query results).

---

## 2\. High: cross-user PII leak on the `profiles` table

**What happens:** Querying Supabase REST directly with the viewer's own token returns **7 profile rows (6 belonging to other users)**, not just the caller's own. Readable columns include `email`, `phone`, `first_name`, `last_name`, `role`, and `credits_remaining`. The `role` values are visible, so an attacker can also enumerate which accounts are **admins** (observed: 3 admin, 4 viewer).

**Evidence:** `GET https://<project>.supabase.co/rest/v1/profiles?select=*` with the public publishable key \+ the viewer's JWT → `HTTP 206`, `Content-Range: 0-0/7`. (Values were not pulled; only counts, user\_ids, roles, and column presence were checked.)

**Why:** The `profiles` table's row-level security policy is missing or too permissive. Because the table is exposed through PostgREST and the client holds a JWT, RLS is the only thing protecting it, and here it is not restricting rows to the owner.

**Impact:** Any logged-in user can harvest every user's email, phone, name, and credit balance, and identify admin accounts to target. This is a personal-data breach under DPDP/GDPR and an attacker-reconnaissance aid.

**Fix:**

- Add an RLS SELECT policy on `profiles`: `auth.uid() = user_id` (and a separate admin policy if admins legitimately need directory access). Verify the table has RLS **enabled**, not just policies defined.  
- Audit INSERT/UPDATE/DELETE policies on `profiles` too (this audit only tested reads; a permissive write policy would let users edit others' records, including `role` and `credits_remaining`). Do not rely on the client filtering by `user_id`; that is not a control.  
- Run the same RLS review across every table exposed to PostgREST. `saved_filters`, `filter_shares`, and `user_favorites` tested correctly (0 cross-user rows); confirm with explicit policies regardless.

---

## 3\. Medium: no bulk-extraction / rate-limit protection

**What happens:** Data endpoints can be called repeatedly with no per-user quota or rate limit. Even after issue \#1 is fixed, if data moves to paginated endpoints, a user can still page through everything and reassemble the dataset.

**Fix:**

- Add per-user rate limiting and abuse detection on data and export endpoints (request budget per minute/day).  
- Enforce server-side caps: max page size, max total rows per user per window, and a hard ceiling that no single account can page past its entitlement.  
- Log and alert on anomalous read volume (a single account pulling thousands of records).

---

## 4\. Low: authorization checked after body validation on exports

**What happens:** `POST /api/exports/generate` with an empty body returns `400 "At least one dataset must be selected"`; with a valid body it returns `403 "Export access denied"` for a viewer. So the role check works, but only **after** body validation. An unauthorized caller can probe valid request shapes and learn the API contract before being denied.

**Fix:** Check authentication and authorization first, return 401/403 before any body validation. Low severity, but cheap to correct and good hygiene.

**Positive:** Exports are correctly restricted to admins. A viewer cannot generate or download exports. Note for product: an **admin** export is still a sanctioned full-data download. If you want to constrain even that, add row caps, watermarking/traceable export IDs, and an audit log of who exported what and when.

---

## 5\. Verify: export download ownership (potential IDOR)

**Not yet tested** (the viewer account cannot create exports, so there were no export IDs to test with). Confirm that `GET /api/exports/[id]/download` checks that the requesting user **owns** the export id, and is not guessable/enumerable across users. If ids are sequential or UUIDs without an ownership check, one admin could fetch another user's export. Add an explicit `owner_user_id = auth.uid()` check on the download and list routes.

---

## Other notes for the team

- **Auth posture is otherwise sound:** `/api/dashboard` returns 401 without a token; there is no anonymous data access.  
- **`/api/accounts` GET** returns 404 (no bulk GET handler), so it is not an extraction vector today.  
- **Client holds a Supabase JWT \+ publishable key**, which is normal, but it means RLS is the sole protection on every exposed table. Treat RLS as a first-class control and add it to your test suite.

---

## Recommended sequencing

1. **Now (hotfix):** Issue \#2 RLS on `profiles` (one policy, immediate PII stop). Issue \#1 server-side projection so contact PII and `exclude` rows stop leaving the server for unentitled tokens.  
2. **Next:** Replace the global dashboard payload with paginated, projected, per-entity endpoints; rework the cache (Issue \#1 architecture).  
3. **Then:** Rate limiting and bulk-extraction caps (\#3), export hardening and audit logging (\#4/\#5), full RLS review across all exposed tables.

This ties directly into the freemium spec already drafted: the per-user, server-side projection in step 1 is the same mechanism that powers free vs paid gating, so the security fix and the freemium feature are the same piece of work.

---

*All findings produced by read-only/count-only live testing on the production app with a viewer-level account. No dataset rows or personal data were extracted or stored. Code paths referenced from the repository prior to it being made private.*  
