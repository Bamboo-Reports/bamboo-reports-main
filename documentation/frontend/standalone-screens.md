# Standalone Screens and Loading Skeletons

> **Scope:** The screens that render outside the dashboard shell (auth, load error, 404, global error, maintenance), the full-page loading skeleton, and the conventions every skeleton in the app follows. For the per-piece `pending` flags that drive in-place skeletons, see [Server-Mode Dashboard](../backend/server-dashboard-mode.md).

---

## 1. The Brand Frame

Every screen shown outside the dashboard shell uses one frame, `components/brand/brand-page.tsx`, so they read as the same product as the dashboard rather than as separate pages.

The frame provides:

- The dashboard's page gradient (`DASHBOARD_PAGE_BACKGROUND`, exported from the same file so other screens can reuse it).
- The header's brand lockup: the logo tile and the "Bamboo Reports" wordmark, linking to `homeHref` (default `/`).
- A centered column (`max-w-md` by default, override with `className`).
- A footer line, "A Research NXT product".

The logo inside the lockup is `components/brand/brand-mark.tsx`, an inline copy of `public/logo.svg`. It is inlined so its four petals can settle into place once on entry. That entrance is the only decorative motion on these screens; everything else is static. `public/logo.svg` remains the source of truth for the favicon and the dashboard header, so a logo change has to be applied in both places.

| Screen | File | Notes |
|--------|------|-------|
| Sign in, sign up, forgot password, reset password | `components/auth/auth-shell.tsx` wrapping `app/(auth)/*/page.tsx` | Card with title, description and form. Footer link under the card. Lockup links to `/signin`. |
| Dashboard load error | `components/states/error-state.tsx` | Rendered by `app/page.tsx` when the summary request fails. Shows the raw server message in an alert for support, with Retry and Sign in again. |
| 404 | `app/not-found.tsx` | Server component. Primary button back to `/`. |
| Global error boundary | `app/global-error.tsx` | Replaces the root layout, so it imports `globals.css` itself and renders in the light theme (the theme provider is gone). Shows `error.digest` as a support reference. |
| Maintenance | `components/maintenance-page.tsx` | Rendered by `app/layout.tsx` when `NEXT_PUBLIC_MAINTENANCE_MODE=true`. |

Design rules these screens follow, so new ones stay consistent:

- Use theme tokens only. The four brand colors appear in the logo mark and nowhere else.
- Default `Button` variants. No hardcoded gradients.
- No eyebrow labels or uppercase pills above titles. The title carries the message.
- Copy says what happened and what to do next, in sentence case. Errors do not apologize.
- No em dashes anywhere in copy (project rule).

## 2. The Full-Page Loading Skeleton

`components/states/loading-state.tsx` is shown by `app/page.tsx` while the first dashboard payload loads. It is a ghost of the real shell rather than a spinner:

- Same page gradient as the dashboard.
- Header band matching `components/layout/header.tsx`: real brand mark and wordmark, plus placeholders shaped like the search field and the three small header buttons.
- Collapsed filter rail matching `components/filters/filters-sidebar.tsx`.
- Five summary card ghosts in the same `md:grid-cols-5` grid as `components/dashboard/summary-cards.tsx`, one per card (Accounts, Centres, Upcoming Centres, Prospects, Headcount).
- Section title row with the view toggle, then one chart card holding `ChartWaveSkeleton`.

When data lands, the real dashboard renders on top of the same structure, so the swap reads as content filling in rather than a screen change. If the dashboard shell changes (a card is added, the header gains a button), update the skeleton in the same PR.

Motion here is limited to what the loaded dashboard already uses: `TopProgressBar`, the `Skeleton` shimmer and the `ChartWaveSkeleton` wave, plus the one-time logo entrance. Reduced motion is respected globally in `app/globals.css`.

## 3. Skeleton Conventions

Every skeleton mirrors the content it stands in for, at the same dimensions, so nothing jumps when data lands. The primitives:

| Primitive | File | Use |
|-----------|------|-----|
| `Skeleton` | `components/ui/skeleton.tsx` | Shimmer block. Always use this rather than a hand-rolled `animate-pulse` div so loading surfaces look the same everywhere. |
| `ChartWaveSkeleton` | `components/ui/chart-wave-skeleton.tsx` | Drifting resting line for chart areas. |
| `TableSkeletonRows` | `components/ui/data-skeletons.tsx` | Placeholder table rows. `lead="logo"` (default) draws a square company logo plus two text lines in the name column, for accounts and centres. `lead="avatar"` draws a round avatar in its own column followed by a two-line name column, for prospects. |
| `GridSkeletonCards` | `components/ui/data-skeletons.tsx` | Placeholder grid cards. `statRows` is 2 for accounts and 3 for centres and prospects. `avatar` swaps the square logo for a round avatar. |
| `MapUpdatingPill` | `components/ui/data-skeletons.tsx` | Floating "Updating map" pill shown over maps while aggregates refresh. |

Reference dimensions, taken from the real components:

| Real element | Skeleton |
|--------------|----------|
| `CompanyLogo size="sm"` (table rows) | `h-8 w-8 rounded-xl` |
| `CompanyLogo size="md"` (grid cards) | `h-12 w-12 rounded-xl` |
| Prospect avatar (table / card) | `h-8 w-8` / `h-10 w-10`, `rounded-full` |
| Grid card title (`text-base`) and subtitle (`text-sm`) | `h-5` and `h-4` |
| Grid card `Button size="sm"` | `h-9 rounded-md` |
| Summary card count | Invisible copy of the real typography with a `Skeleton` overlaid, see `summary-cards.tsx` |

Dialog sections that load related data have their own inline skeletons, and each mirrors the loaded section: the centre dialog's services list is a bordered list of label-plus-pills rows, and the prospect dialog's contacts section is three filter rows above a framed `GridSkeletonCards` grid.

When adding a new loading surface:

1. Render the real component with data and note the geometry (logo size, line count, button height).
2. Build the skeleton from `Skeleton` and the shared primitives above, matching that geometry.
3. Check light and dark mode, and check that the swap to real content does not move anything below it.

## Related Files

| File | Purpose |
|------|---------|
| `components/brand/brand-page.tsx` | Standalone screen frame and the shared page gradient |
| `components/brand/brand-mark.tsx` | Inline animated logo |
| `components/auth/auth-shell.tsx` | Auth page card inside the brand frame |
| `components/states/loading-state.tsx` | Full-page dashboard skeleton |
| `components/states/error-state.tsx` | Full-page dashboard load error |
| `components/maintenance-page.tsx` | Maintenance mode screen |
| `components/ui/data-skeletons.tsx` | Table, grid and map skeleton primitives |
| `components/ui/skeleton.tsx`, `components/ui/chart-wave-skeleton.tsx` | Base skeleton primitives |
