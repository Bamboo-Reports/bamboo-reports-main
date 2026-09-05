"use client"

import { RefreshCw } from "lucide-react"
import { BrandPage } from "@/components/brand/brand-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import "./globals.css"

/**
 * Last-resort error boundary. It replaces the root layout, so it has to
 * render its own html and body and import the global styles itself. The
 * theme provider is gone at this point, so it renders in the light theme.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <BrandPage>
          <Card className="border-border/70 bg-card shadow-sm">
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                The app hit an unexpected error. Trying again usually fixes it. If it does not,
                share the reference below with support.
              </p>

              {error.digest ? (
                <p className="mt-6 rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Reference: <span className="font-medium text-foreground">{error.digest}</span>
                </p>
              ) : null}

              <Button onClick={reset} className="mt-6 h-10 w-full sm:w-auto">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </div>
          </Card>
        </BrandPage>
      </body>
    </html>
  )
}
