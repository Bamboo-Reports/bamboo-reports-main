"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { BrandMark } from "@/components/brand/brand-mark"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface AuthShellProps {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
  formCardClassName?: string
}

/**
 * Shared frame for the sign-in, sign-up and password pages.
 *
 * It borrows the dashboard's own language: the same page gradient, the same
 * header-style brand mark and wordmark, and a plain card on top. Nothing
 * animates except the four logo petals settling into place on entry.
 */
export function AuthShell({ title, description, children, footer, formCardClassName }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))]">
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/signin"
            className="mb-6 inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-background">
              <BrandMark />
            </span>
            <span className="text-lg font-bold text-foreground">Bamboo Reports</span>
          </Link>

          <Card className={cn("border-border/70 bg-card shadow-sm", formCardClassName)}>
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

              <div className="mt-6">{children}</div>
            </div>
          </Card>

          <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground/80">
        A Research NXT product
      </footer>
    </div>
  )
}
