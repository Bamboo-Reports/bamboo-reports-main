"use client"

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

            <div className="hidden items-center gap-2 md:flex" aria-hidden="true">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-full" />
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
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
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

const SUMMARY_GHOSTS = [
  { label: "w-16", value: "w-20" },
  { label: "w-14", value: "w-16" },
  { label: "w-24", value: "w-12" },
  { label: "w-16", value: "w-20" },
  { label: "w-20", value: "w-28" },
  { label: "w-14", value: "w-16" },
]

/**
 * The brand mark from public/logo.svg, inlined so its four petals can settle
 * into place once when the screen appears. Colors match the logo file.
 */
function BrandMark() {
  return (
    <>
      <svg
        viewBox="0 0 65 45"
        className="h-8 w-8"
        role="img"
        aria-label="Bamboo Reports logo"
      >
        <path
          className="petal petal-1"
          d="M47.4656 7.10152C50.5784 3.9887 55.6252 3.98871 58.7381 7.10152V7.10152C61.8509 10.2143 61.8509 15.2612 58.7381 18.374L43.4038 33.7082L32.1313 22.4358L47.4656 7.10152Z"
          fill="#FFAE71"
        />
        <path
          className="petal petal-2"
          d="M16.8235 37.9412C13.7264 41.0383 8.70492 41.0384 5.60778 37.9412V37.9412C2.51065 34.8441 2.51065 29.8226 5.60778 26.7255L20.9704 11.3629L32.1861 22.5786L16.8235 37.9412Z"
          fill="#6EC4EA"
        />
        <path
          className="petal petal-3"
          d="M43.3475 11.1967C41.8631 9.72636 40.1036 8.56279 38.1695 7.77242C36.2355 6.98206 34.1646 6.58038 32.0753 6.59031C29.986 6.60025 27.9191 7.02161 25.9926 7.83034C24.0662 8.63907 22.3178 9.81933 20.8475 11.3037C19.3771 12.7881 18.2136 14.5476 17.4232 16.4817C16.6328 18.4158 16.2312 20.4866 16.2411 22.5759C16.251 24.6652 16.6724 26.7321 17.4811 28.6586C18.2899 30.5851 19.4701 32.3334 20.9545 33.8037L32.151 22.5002L43.3475 11.1967Z"
          fill="#3AACEE"
        />
        <path
          className="petal petal-4"
          d="M20.9545 33.8037C23.9524 36.7732 28.0071 38.4302 32.2267 38.4101C36.4462 38.3901 40.485 36.6946 43.4545 33.6967C46.424 30.6988 48.081 26.6441 48.0609 22.4245C48.0408 18.205 46.3454 14.1662 43.3475 11.1967L32.151 22.5002L20.9545 33.8037Z"
          fill="#F17C1D"
        />
      </svg>

      <style jsx>{`
        @keyframes petal-in {
          from {
            opacity: 0;
            transform: scale(0.55);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .petal {
          transform-box: fill-box;
          transform-origin: center;
          animation: petal-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .petal-1 {
          animation-delay: 60ms;
        }
        .petal-2 {
          animation-delay: 160ms;
        }
        .petal-3 {
          animation-delay: 260ms;
        }
        .petal-4 {
          animation-delay: 360ms;
        }
      `}</style>
    </>
  )
}
