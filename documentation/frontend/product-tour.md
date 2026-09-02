# Product Tour

> **Scope:** The guided onboarding walkthrough built on `driver.js`, its completion tracking, and how to add or change tour steps.

---

## 1. Overview

First-time users get an auto-started, spotlight-style walkthrough of the dashboard (search, filters, summary cards, map/table views, exports). Returning users who already completed it don't see it again unless the tour version is bumped. Anyone can manually replay it.

Built on `driver.js` (see [Tech Stack](../tech-stack.md)), which handles the actual spotlight overlay and popovers.

## 2. Pieces

| File | Responsibility |
|------|-----------------|
| `lib/tour/steps.ts` | `getDashboardTourSteps({ hasMapView, isSidebarCollapsed })` — returns the ordered `driver.js` step definitions (target selector, title, description) for the current layout |
| `lib/tour/constants.ts` | `TOUR_STORAGE_KEY`, `TOUR_VERSION`, `TOUR_AUTO_START_DELAY_MS` |
| `lib/tour/migration.sql` | Adds `tour_completed_at` / `tour_version` columns to `public.profiles` |
| `hooks/use-tour-persistence.ts` | Reads/writes completion state (localStorage + Supabase) |
| `hooks/use-product-tour.ts` | Owns the `driver.js` instance lifecycle, auto-start, and analytics |

## 3. Completion Tracking (`useTourPersistence`)

Two-tier storage, checked in this order:

1. **localStorage** (`br-product-tour-completed`, JSON: `{ version, completedAt }`). If present and `version >= TOUR_VERSION`, the tour is considered complete with no network round-trip.
2. **Supabase** (`profiles.tour_completed_at`, `profiles.tour_version`). Checked when localStorage is empty/stale/absent (for example, a new browser or cleared storage). If Supabase says complete for the current version, localStorage is backfilled so the next load skips the network check.

`markCompleted()` writes both: localStorage immediately (so the UI updates without waiting on a network round trip), then a best-effort Supabase update. If the Supabase write fails, the function does not throw. It relies on localStorage as the source of truth for that browser.

This means: completion is **per-browser first, per-account second**. A user who completes the tour on one device and clears site data will see it again there but not on a device where Supabase already reflects completion, as long as that device's Supabase read succeeds.

## 4. Versioning

Bump `TOUR_VERSION` in `lib/tour/constants.ts` when the tour content changes enough that even users who already saw it should see the new version. Both storage tiers compare against `>= TOUR_VERSION`, so bumping the constant invalidates every prior completion record automatically, no data migration needed.

## 5. Auto-Start and Layout Reactivity (`useProductTour`)

- Auto-starts once per mount, `TOUR_AUTO_START_DELAY_MS` (1.5s) after `dataLoaded` becomes true, only if `!isCompleted` and not already loading. The delay lets the dashboard finish its initial render so tour targets exist in the DOM.
- If `hasMapView` or `isSidebarCollapsed` change *while the tour is running* (for example, the user manually collapses the sidebar mid-tour), the hook destroys and recreates the `driver.js` instance with steps recomputed for the new layout, resuming at the closest equivalent step index (`Math.min(stepIndexRef.current, nextSteps.length - 1)`) rather than restarting from zero.
- `startTour()` is exposed for a manual "Replay tour" entry point in the UI; it tears down any existing instance first so double-invocation can't create two overlays.

## 6. Analytics

Fired via `captureEvent` (PostHog) at each lifecycle point: `TOUR_STARTED` (with `is_replay` when re-triggered manually), `TOUR_STEP_VIEWED` (per step, with index and title), `TOUR_COMPLETED` (reached the last step), `TOUR_SKIPPED` (closed early, with the step index it was skipped at). See `lib/analytics/events.ts` for the full event catalog.

## 7. Adding or Changing a Step

1. Edit `getDashboardTourSteps` in `lib/tour/steps.ts`. Each step needs a target element that exists in the DOM by the time the tour reaches it. If a step targets something inside a conditionally-rendered section (map view, collapsed sidebar), gate it on the relevant `hasMapView` / `isSidebarCollapsed` argument the same way existing steps do.
2. If the change is significant enough that existing users should see it again, bump `TOUR_VERSION`.
3. No test currently covers step content directly; verify manually by clearing `localStorage` (`br-product-tour-completed`) and reloading, or by using the manual replay entry point.

---

## Related Files

| File | Purpose |
|------|---------|
| `lib/tour/steps.ts` | Tour step definitions |
| `lib/tour/constants.ts` | Storage key, version, auto-start delay |
| `lib/tour/migration.sql` | `profiles.tour_completed_at` / `tour_version` columns |
| `hooks/use-tour-persistence.ts` | Completion read/write (localStorage + Supabase) |
| `hooks/use-product-tour.ts` | `driver.js` instance lifecycle, auto-start, layout reactivity |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table base schema |
| `documentation/tech-stack.md` | `driver.js` dependency entry |
