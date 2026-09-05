import type { ReactNode } from "react"
import Link from "next/link"
import { BrandMark } from "@/components/brand/brand-mark"
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
  return (
    <div className={cn("flex min-h-screen flex-col", DASHBOARD_PAGE_BACKGROUND)}>
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className={cn("w-full max-w-md", className)}>
          <Link
            href={homeHref}
            className="mb-6 inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-background">
              <BrandMark />
            </span>
            <span className="text-lg font-bold text-foreground">Bamboo Reports</span>
          </Link>
          {children}
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground/80">A Research NXT product</footer>
    </div>
  )
}
