"use client"

import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { BrandPage } from "@/components/brand/brand-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface ErrorStateProps {
  error: string
  onRetry: () => void
}

/**
 * Full-page error shown when the dashboard data cannot be loaded. Uses the
 * same brand frame as the auth pages, states what happened in plain words,
 * and keeps the raw server message visible so support can act on it.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <BrandPage>
      <Card className="border-border/70 bg-card shadow-sm">
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            The dashboard could not load
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your data did not come through. Retry now, and if it keeps failing, share the message
            below with support.
          </p>

          <div
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground"
          >
            {error}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={onRetry} className="h-10 sm:flex-1">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button asChild variant="outline" className="h-10 sm:flex-1">
              <Link href="/signin">Sign in again</Link>
            </Button>
          </div>
        </div>
      </Card>
    </BrandPage>
  )
}
