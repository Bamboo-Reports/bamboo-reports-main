"use client"

import type { CSSProperties } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import {
  RiCheckboxCircleLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react"

/**
 * App toaster (design in mockups/toasts.html). Toasts are a small floating
 * card like the menus and popovers: card surface, hairline border, the shared
 * soft shadow and a 12px corner. The only colour is the 16px icon. Calls keep
 * a short title and put detail in `description`; actions render as a small
 * outline button on the right.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      offset={24}
      gap={8}
      style={{ "--width": "360px" } as CSSProperties}
      icons={{
        success: <RiCheckboxCircleLine className="h-4 w-4" />,
        error: <RiErrorWarningLine className="h-4 w-4" />,
        info: <RiInformationLine className="h-4 w-4" />,
        warning: <RiErrorWarningLine className="h-4 w-4" />,
        loading: <RiLoader4Line className="h-4 w-4 animate-spin" />,
        close: <RiCloseLine className="h-4 w-4" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast flex w-[var(--width)] items-start gap-2.5 rounded-xl border border-border bg-popover py-3 pl-4 pr-3 font-sans text-popover-foreground shadow-float",
          icon: "mt-px flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4",
          success: "[&_[data-icon]]:text-include",
          error: "[&_[data-icon]]:text-exclude",
          warning: "[&_[data-icon]]:text-exclude",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-[13px] font-medium leading-[18px]",
          description: "text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]",
          actionButton:
            "h-7 shrink-0 self-center rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          cancelButton:
            "h-7 shrink-0 self-center rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          closeButton:
            "order-last -mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        },
      }}
    />
  )
}
