"use client"

import type { ReactNode } from "react"
import { BrandPage } from "@/components/brand/brand-page"
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
 * Shared frame for the sign-in, sign-up and password pages: the brand page
 * frame with a plain card for the form and a footer link under it.
 */
export function AuthShell({ title, description, children, footer, formCardClassName }: AuthShellProps) {
  return (
    <BrandPage homeHref="/signin">
      <Card className={cn("border-border/70 bg-card shadow-sm", formCardClassName)}>
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

          <div className="mt-6">{children}</div>
        </div>
      </Card>

      <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
    </BrandPage>
  )
}
