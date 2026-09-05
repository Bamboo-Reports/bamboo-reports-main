"use client"

import { BrandMark } from "@/components/brand/brand-mark"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ChartWaveSkeleton } from "@/components/ui/chart-wave-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { TopProgressBar } from "@/components/ui/top-progress-bar"

/**
 * Full-page loading state for the dashboard.
 *
 * Instead of a centered card with a spinner, this draws a ghost of the real
 * dashboard shell: the same page gradient, the same header band with the
 * brand mark, the summary-card row, the tab strip and the chart cards. When
 * data arrives, the real dashboard lands on top of the same structure, so the
 * swap reads as content filling in rather than a screen change.
 *
 * Motion is deliberately limited to what the loaded dashboard already uses:
 * the top progress bar, the skeleton shimmer and the resting chart wave. The
 * only extra moment is the four petals of the logo assembling once on entry.
 */
export function LoadingState() {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))]"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <TopProgressBar active />

      {/* Header ghost: mirrors components/layout/header.tsx so nothing moves on swap. */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto w-full px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-background">
                <BrandMark />
              </div>
              <p className="truncate text-lg font-bold text-foreground">Bamboo Reports</p>
            </div>

            <div className="flex items-center gap-2" aria-hidden="true">
              <Skeleton className="hidden h-8 w-56 rounded-lg sm:block" />
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" aria-hidden="true">
        {/* Collapsed filter rail: mirrors components/filters/filters-sidebar.tsx. */}
        <aside className="ml-6 mt-6 mb-3 flex w-16 shrink-0 flex-col items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar/90 px-2 py-4 backdrop-blur-sm">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-background/70">
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <div className="my-1 h-px w-8 bg-border" />
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 pt-6">
          {/* Summary cards: matches the row in summary-cards.tsx. */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
            {SUMMARY_GHOSTS.map((widths, index) => (
              <Card key={index} className="border-border/70 bg-card/80 shadow-none">
                <CardHeader className="px-4 pb-1.5 pt-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className={`h-3.5 ${widths.label}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                  <Skeleton className={`h-7 ${widths.value}`} />
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section title row with the view toggle. */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 p-1">
              <Skeleton className="h-8 w-24 rounded-md bg-background dark:bg-background" />
              <div className="h-8 w-24 rounded-md" />
            </div>
          </div>

          {/* The main chart card. */}
          <Card className="flex min-h-0 flex-1 flex-col border-border/70 bg-card/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 pb-3 pt-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <div className="h-full min-h-[14rem]">
                <ChartWaveSkeleton />
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}

// One ghost per summary card: Accounts, Centres, Upcoming Centres, Prospects, Headcount.
const SUMMARY_GHOSTS = [
  { label: "w-16", value: "w-20" },
  { label: "w-14", value: "w-16" },
  { label: "w-24", value: "w-12" },
  { label: "w-16", value: "w-20" },
  { label: "w-20", value: "w-24" },
]
