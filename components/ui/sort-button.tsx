"use client"

import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SortButtonProps<T extends string = string> {
  label: string
  sortKey: T
  currentKey: T
  direction: "asc" | "desc" | null
  onClick: (key: T) => void
}

export function SortButton<T extends string = string>({
  label,
  sortKey,
  currentKey,
  direction,
  onClick,
}: SortButtonProps<T>) {
  const isActive = currentKey === sortKey && direction !== null
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "text-primary" : "text-foreground"
      )}
      aria-pressed={isActive}
    >
      <span>{label}</span>
      {!isActive ? (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      ) : direction === "asc" ? (
        <ArrowUpAZ className="h-3.5 w-3.5 text-primary" />
      ) : (
        <ArrowDownAZ className="h-3.5 w-3.5 text-primary" />
      )}
    </button>
  )
}
