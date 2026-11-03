import type { ReactNode } from "react"
import Link from "next/link"
import { BrandMark } from "@/components/brand/brand-mark"
import { getEnvironmentLabel } from "@/lib/config/environment"
import { cn } from "@/lib/utils"

/** The dashboard's page gradient, shared by every standalone screen. */
export const DASHBOARD_PAGE_BACKGROUND =
  "bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))]"

interface BrandPageProps {
  children: ReactNode
  /** Width of the centered column. Defaults to the auth card width. */
  className?: string
  /** Where the brand lockup links to. */
  homeHref?: string
}

/**
 * Standalone screen frame used outside the dashboard shell: the auth pages,
 * the load error and the 404. It borrows the dashboard's gradient and the
 * header's brand lockup so those screens read as part of the same product.
 */
export function BrandPage({ children, className, homeHref = "/" }: BrandPageProps) {
  // Same development-site marker as the dashboard header: "Dev" and an amber dot on the logo.
  const isDev = getEnvironmentLabel() === "DEV"
  return (
    <div className={cn("flex min-h-screen flex-col", DASHBOARD_PAGE_BACKGROUND)}>
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className={cn("w-full max-w-md", className)}>
          <Link
            href={homeHref}
            className="mb-6 inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="relative h-10 w-10 shrink-0">
              <span
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-xl border bg-background",
                  isDev ? "border-amber-500/50" : "border-primary/20"
                )}
              >
                <BrandMark />
              </span>
              {isDev && (
                <span aria-hidden className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background dark:bg-amber-400" />
              )}
            </span>
            <span className="text-lg font-bold text-foreground">
              Bamboo Reports
              {isDev && <span className="ml-1.5 font-medium text-amber-600 dark:text-amber-400">Dev</span>}
            </span>
          </Link>
          {children}
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground/80">A Research NXT product</footer>
    </div>
  )
}
