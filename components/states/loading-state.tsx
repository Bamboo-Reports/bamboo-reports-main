"use client"

import { BrandMark } from "@/components/brand/brand-mark"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ChartWaveSkeleton } from "@/components/ui/chart-wave-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { getEnvironmentLabel } from "@/lib/config/environment"
import { NOTIFICATIONS_ENABLED } from "@/lib/config/notifications"
import { cn } from "@/lib/utils"

/**
 * Full-page loading state for the dashboard.
 *
 * Instead of a centered card with a spinner, this draws a ghost of the real
 * dashboard shell: the same page background, the same header band with the
 * brand mark, the filter rail, the summary-card row, the tab heading and the
 * chart cards. When
 * data arrives, the real dashboard lands on top of the same structure, so the
 * swap reads as content filling in rather than a screen change.
 *
 * Motion is deliberately limited to what the loaded dashboard already uses:
 * the skeleton shimmer and the resting chart wave. The top progress bar is
 * rendered by the page, so the same bar runs on through the swap. The
 * only extra moment is the four petals of the logo assembling once on entry.
 */
export function LoadingState() {
  const isDev = getEnvironmentLabel() === "DEV"
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      {/* Header ghost: mirrors components/layout/header.tsx so nothing moves on swap. */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background">
        <div className="mx-auto w-full px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 shrink-0">
                <div
                  className={cn(
                    "relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-background",
                    isDev ? "border-amber-500/50" : "border-primary/20"
                  )}
                >
                  <BrandMark />
                </div>
                {isDev && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background dark:bg-amber-400"
                  />
                )}
              </div>
              <p className="truncate text-[17px] font-semibold text-foreground">
                Bamboo Reports
                {isDev && <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-400">Dev</span>}
              </p>
            </div>

            <div className="flex items-center gap-2" aria-hidden="true">
              <Skeleton className="hidden h-8 w-56 rounded-lg sm:block" />
              <Skeleton className="h-8 w-8 rounded-md" />
              {NOTIFICATIONS_ENABLED && <Skeleton className="h-8 w-8 rounded-md" />}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" aria-hidden="true">
        {/* Collapsed filter rail: mirrors components/filters/filters-sidebar.tsx. */}
        <aside className="ml-6 mb-3 mt-6 flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl border border-sidebar-border bg-sidebar py-3">
          <RailGhost />
          <span className="h-2" />
          {Array.from({ length: 5 }, (_, index) => (
            <RailGhost key={index} />
          ))}
          <span className="my-2 h-px w-6 bg-sidebar-border" />
          <RailGhost />
          <RailGhost />
          <div className="mt-auto flex flex-col items-center gap-1">
            <RailGhost />
            <div className="grid h-10 w-10 place-items-center">
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 pt-6">
          {/* Summary cards: matches the row in components/dashboard/summary-cards.tsx. */}
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-5">
            {SUMMARY_GHOSTS.map((widths, index) => (
              <Card key={index} className="border-border/70 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex h-5 items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className={`h-3 ${widths.label}`} />
                </div>
                <div className="mt-1 flex h-[30px] items-center gap-1.5">
                  <Skeleton className={`h-6 ${widths.value}`} />
                  <Skeleton className="h-3 w-12" />
                </div>
              </Card>
            ))}
          </div>

          {/* Tab heading row: icon, title and the Charts / Map / Data switcher, as in components/tabs/*-tab.tsx. */}
          <div className="mb-4 mt-2 flex items-center gap-2">
            <Skeleton className="h-[18px] w-[18px] rounded" />
            <div className="flex h-7 items-center">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="ml-auto flex h-10 items-stretch gap-2 rounded-xl border border-border/70 bg-secondary/70 p-1">
              <Skeleton className="w-24 rounded-lg bg-background dark:bg-background" />
              <div className="w-16 rounded-lg" />
              <div className="w-20 rounded-lg" />
            </div>
          </div>

          {/* The chart grid: mirrors components/charts/pie-chart-card.tsx. */}
          <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex h-6 items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    <ChartWaveSkeleton />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

/** One 40px rail button with its 18px icon, as in the collapsed filter rail. */
function RailGhost() {
  return (
    <div className="grid h-10 w-10 place-items-center">
      <Skeleton className="h-[18px] w-[18px] rounded" />
    </div>
  )
}

// One ghost per summary card: Accounts, Centres, Upcoming centres, Prospects, Headcount.
const SUMMARY_GHOSTS = [
  { label: "w-16", value: "w-20" },
  { label: "w-14", value: "w-16" },
  { label: "w-24", value: "w-12" },
  { label: "w-16", value: "w-20" },
  { label: "w-20", value: "w-24" },
]
