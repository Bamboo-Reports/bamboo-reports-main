"use client"

import type { ReactNode } from "react"
import { RiCheckboxCircleLine, RiErrorWarningLine } from "@remixicon/react"
import { BrandPage } from "@/components/brand/brand-page"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface AuthShellProps {
  /** Omitted for a card that brings its own heading, such as "Check your email". */
  title?: string
  description?: ReactNode
  children: ReactNode
  footer: ReactNode
  formCardClassName?: string
}

/**
 * Shared frame for the sign-in and password pages: the brand page frame with
 * a plain card for the form and a footer line under it.
 */
export function AuthShell({ title, description, children, footer, formCardClassName }: AuthShellProps) {
  return (
    <BrandPage homeHref="/signin">
      <Card className={cn("border-border/70 bg-card shadow-sm", formCardClassName)}>
        <div className="p-6">
          {title && <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">{title}</h1>}
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}

          <div className={title || description ? "mt-6" : undefined}>{children}</div>
        </div>
      </Card>

      <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
    </BrandPage>
  )
}

/** A message at the top of an auth card: a short headline, then what to do. */
export function AuthNotice({ tone, title, children }: { tone: "success" | "error"; title: string; children?: ReactNode }) {
  const Icon = tone === "success" ? RiCheckboxCircleLine : RiErrorWarningLine
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px] leading-snug", tone === "success" ? "bg-include/[0.09]" : "bg-exclude/[0.07]")}
    >
      <Icon className={cn("mt-px h-4 w-4 shrink-0", tone === "success" ? "text-include" : "text-exclude")} />
      <div>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-foreground/85">{children}</div>}
      </div>
    </div>
  )
}
