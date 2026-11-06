"use client"

import React from "react"
import { RiArrowRightSLine } from "@remixicon/react"
import { TruncatedText } from "@/components/ui/truncated-text"
export interface DialogBreadcrumbItem {
  label: string
  onClick?: () => void
}

interface DialogBreadcrumbProps {
  items: DialogBreadcrumbItem[]
}

export function DialogBreadcrumb({ items }: DialogBreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-muted-foreground mb-3 flex-wrap"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const isClickable = !isLast && !!item.onClick

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {isClickable ? (
              <button
                type="button"
                onClick={item.onClick}
                className="hover:text-foreground transition-colors min-w-0 max-w-[220px]"
              >
                <TruncatedText text={item.label} />
              </button>
            ) : (
              <TruncatedText
                text={item.label}
                className={`max-w-[220px] ${isLast ? "text-foreground font-medium" : ""}`}
                aria-current={isLast ? "page" : undefined}
              />
            )}
            {!isLast && <RiArrowRightSLine className="h-3.5 w-3.5 shrink-0" />}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
