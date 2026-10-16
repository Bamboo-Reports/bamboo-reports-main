# Product Tour

> **Scope:** The guided onboarding walkthrough built on `driver.js`, its completion tracking, and how to add or change tour steps.

---

## 1. Overview

First-time users get an auto-started, spotlight-style walkthrough of the dashboard (summary cards, section tabs, view switcher, filters, saved filters, export, header actions, map view). Returning users who already completed it don't see it again unless the tour version is bumped. Anyone can manually replay it.

Built on `driver.js` (see [Tech Stack](../tech-stack.md)), which handles the actual spotlight overlay and popovers.

## 2. Pieces

| File | Responsibility |
|------|-----------------|
| `lib/tour/steps.ts` | `getDashboardTourSteps({ hasMapView, isSidebarCollapsed })`: returns the ordered `driver.js` steps (resolved target element, title, description) for the current layout |
| `lib/tour/constants.ts` | `TOUR_STORAGE_KEY`, `TOUR_VERSION`, `TOUR_AUTO_START_DELAY_MS` |
| `documentation/backend/sql/tour-columns-migration.sql` | Adds `tour_completed_at` / `tour_version` columns to `public.profiles` |
| `hooks/use-tour-persistence.ts` | Reads/writes completion state (localStorage + Supabase) |
| `hooks/use-product-tour.ts` | Owns the `driver.js` instance lifecycle, auto-start, and analytics. Called from `app/page.tsx` |

## 3. Steps

Each step targets a `data-tour` attribute. `addStep` resolves the selector to the first *visible* match when the steps are built; if nothing visible matches, the step is silently dropped.

| # | Selector | Lives in | Notes |
|---|----------|----------|-------|
| 1 | `[data-tour='summary-cards']` | `components/dashboard/summary-cards.tsx` | |
| 2 | `[data-tour='tab-navigation']` | `app/page.tsx` (section `Tabs`) | |
| 3 | `[data-tour='view-switcher']` | `components/tabs/{accounts,centers,prospects}-tab.tsx` (passed through `components/ui/view-switcher.tsx`) | |
| 4 | `[data-tour='filters-sidebar']` | `components/filters/filters-sidebar.tsx` | Copy changes when `isSidebarCollapsed` |
| 5 | `[data-tour='saved-filters']` | `components/filters/filters-sidebar.tsx` | See note below |
| 6 | `[data-tour='export-button']` | `components/filters/saved-filters-manager.tsx` | See note below |
| 7 | `[data-tour='header-actions']` | `components/layout/header.tsx` | |
| 8 | `[data-tour='map-view']` | `components/tabs/accounts-tab.tsx`, `components/tabs/centers-tab.tsx` | Only when `hasMapView` |
| 9 | (none) | | Centered "You're All Set!" closing popover |

Note: the visibility check also walks the target's ancestors for `opacity: 0`. When the sidebar is collapsed, the expanded panel stays mounted and is only faded by an `opacity-0` wrapper, so this is what drops steps 5 and 6 (saved filters, export) instead of spotlighting an area the user cannot see. Covered by `tests/unit/tour-steps.test.ts`.

`saved-filters-manager.tsx` also carries `account-lists-button` and `summary-report-button` attributes, but no step targets them yet.

## 4. Completion Tracking (`useTourPersistence`)

Two-tier storage, checked in this order:

1. **localStorage** (`br-product-tour-completed`, JSON: `{ version, completedAt }`). If present and `version >= TOUR_VERSION`, the tour is considered complete with no network round-trip.
2. **Supabase** (`profiles.tour_completed_at`, `profiles.tour_version`). Checked when localStorage is empty/stale/absent (for example, a new browser or cleared storage). If Supabase says complete for the current version, localStorage is backfilled so the next load skips the network check.

`markCompleted()` writes both: localStorage immediately (so the UI updates without waiting on a network round trip), then a best-effort Supabase update. If the Supabase write fails, the function does not throw. It relies on localStorage as the source of truth for that browser.

This means: completion is **per-browser first, per-account second**. A user who completes the tour on one device and clears site data will see it again there but not on a device where Supabase already reflects completion, as long as that device's Supabase read succeeds.

## 5. Versioning

Bump `TOUR_VERSION` in `lib/tour/constants.ts` when the tour content changes enough that even users who already saw it should see the new version. Both storage tiers compare against `>= TOUR_VERSION`, so bumping the constant invalidates every prior completion record automatically, no data migration needed.

## 6. Auto-Start and Layout Reactivity (`useProductTour`)

- Auto-starts once per mount, `TOUR_AUTO_START_DELAY_MS` (1.5s) after `dataLoaded` becomes true, only if `!isCompleted` and not already loading. With no `userId`, persistence reports the tour as complete, so it never auto-starts for signed-out sessions. The delay lets the dashboard finish its initial render so tour targets exist in the DOM.
- If `hasMapView` or `isSidebarCollapsed` change *while the tour is running* (for example, the user manually collapses the sidebar mid-tour), the hook destroys and recreates the `driver.js` instance with steps recomputed for the new layout, resuming at the closest equivalent step index (`Math.min(stepIndexRef.current, nextSteps.length - 1)`) rather than restarting from zero.
- `startTour()` is the manual replay entry point: `app/page.tsx` passes it to `Header` as `onStartTour`, which renders the "Tour" item in the profile menu (`components/layout/header.tsx`). It is a no-op while a tour is running and tears down any stale instance first, so double-invocation can't create two overlays.
- Closing the tour early also calls `markCompleted()`, so a skipped tour does not auto-start again.
- While running, the hook adds a `tour-active` class to `<html>` and removes it on close or unmount.

## 7. Analytics

Fired via `captureEvent` (PostHog) at each lifecycle point: `TOUR_STARTED` (with `is_replay` when re-triggered manually), `TOUR_STEP_VIEWED` (per step, with index and title), `TOUR_COMPLETED` (reached the last step), `TOUR_SKIPPED` (closed early, with the step index it was skipped at). See `lib/analytics/events.ts` for the full event catalog.

## 8. Adding or Changing a Step

1. Add a `data-tour="..."` attribute to the target element, then add an `addStep` call in `getDashboardTourSteps` (`lib/tour/steps.ts`). The target must be visible when the tour starts (steps are resolved up front, and hidden targets are dropped). If a step only makes sense in one layout, gate it on `hasMapView` the way the map step is, or vary its copy on `isSidebarCollapsed` the way the filters step does.
2. If the change is significant enough that existing users should see it again, bump `TOUR_VERSION`.
3. No test currently covers step content directly; verify manually by clearing `localStorage` (`br-product-tour-completed`) and reloading, or by using the manual replay entry point.

---

## Related Files

| File | Purpose |
|------|---------|
| `lib/tour/steps.ts` | Tour step definitions |
| `lib/tour/constants.ts` | Storage key, version, auto-start delay |
| `documentation/backend/sql/tour-columns-migration.sql` | `profiles.tour_completed_at` / `tour_version` columns |
| `hooks/use-tour-persistence.ts` | Completion read/write (localStorage + Supabase) |
| `hooks/use-product-tour.ts` | `driver.js` instance lifecycle, auto-start, layout reactivity |
| `components/layout/header.tsx` | "Tour" replay item in the profile menu; `header-actions` target |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table base schema |
| `documentation/tech-stack.md` | `driver.js` dependency entry |
