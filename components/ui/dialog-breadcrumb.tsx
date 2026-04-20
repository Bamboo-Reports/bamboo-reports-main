"use client"

import React from "react"
import { ChevronRight } from "lucide-react"

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
                className="hover:text-foreground transition-colors truncate max-w-[220px]"
                title={item.label}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`truncate max-w-[220px] ${isLast ? "text-foreground font-medium" : ""}`}
                title={item.label}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3 w-3 shrink-0" />}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
