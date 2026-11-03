"use client"

import React from "react"
import { RiArrowDownLine, RiArrowDownSLine, RiArrowUpLine } from "@remixicon/react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/** Values with how many rows have each, most common first. */
export function sortByCount(items: string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of items) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))
}

export function toggleInSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  })
}

/** A filter dropdown: "Type All", "Type Manufacturing" or "Type 2 selected", with a checklist of values and counts. */
export function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string
  options: Array<{ name: string; count: number }>
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}) {
  if (options.length === 0 && selected.size === 0) return null
  const summary = selected.size === 0 ? "All" : selected.size === 1 ? [...selected][0] : `${selected.size} selected`
  const active = selected.size > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
            active ? "border-primary/50 bg-primary/[0.08] text-primary" : "bg-card hover:border-foreground/25"
          )}
        >
          <span className={cn("shrink-0 font-normal", active ? "text-primary/80" : "text-muted-foreground")}>{label}</span>
          <span className="truncate">{summary}</span>
          <RiArrowDownSLine className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] w-60 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.name}
            checked={selected.has(option.name)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(option.name)}
            className="text-[13px]"
          >
            <span className="flex-1 truncate">{option.name}</span>
            <span className="ml-3 text-[12px] tabular-nums text-muted-foreground">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear} className="text-[13px] text-primary">
              Clear {label.toLowerCase()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type SortState<K extends string> = { key: K; dir: 1 | -1 }

/** A table header that sorts its column; clicking again flips the order. */
export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: K
  sort: SortState<K>
  onSort: (next: SortState<K>) => void
  className?: string
}) {
  const on = sort.key === sortKey
  return (
    <th
      className={cn("sticky top-0 z-[1] h-9 whitespace-nowrap border-b bg-background px-3 text-left text-[12px] font-medium text-muted-foreground", className)}
      aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}
      >
        {label}
        {on && (sort.dir === 1 ? <RiArrowUpLine className="h-3 w-3" /> : <RiArrowDownLine className="h-3 w-3" />)}
      </button>
    </th>
  )
}

/** Compares two optional strings, empty values last. */
export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? "").trim()
  const y = (b ?? "").trim()
  if (!x && y) return 1
  if (x && !y) return -1
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" })
}

/** A labelled group of facts; rows without a value are left out, and an empty group is not drawn. */
export function FactGroup({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) {
  const present = rows.filter(([, value]) => value !== null && value !== undefined && value !== "")
  if (present.length === 0) return null
  return (
    <section className="mb-5 last:mb-0">
      <h4 className="mb-1 text-[12px] font-medium text-muted-foreground">{title}</h4>
      <dl className="text-[13px]">
        {present.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-border/70 py-1.5 last:border-b-0">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** A row of numbers in one bordered strip; empty cells are left out. */
export function StatRow({ stats }: { stats: Array<{ label: string; value: React.ReactNode; caption?: React.ReactNode }> }) {
  const present = stats.filter((s) => s.value !== null && s.value !== undefined && s.value !== "")
  if (present.length === 0) return null
  return (
    <div
      className="grid overflow-hidden rounded-[10px] border bg-card"
      style={{ gridTemplateColumns: `repeat(${Math.min(present.length, 4)}, minmax(0, 1fr))` }}
    >
      {present.map((stat, index) => (
        <div key={stat.label} className={cn("min-w-0 px-3.5 py-3", index > 0 && "border-l")}>
          <div className="text-[12px] text-muted-foreground">{stat.label}</div>
          <div className="mt-0.5 truncate text-[19px] font-semibold tracking-[-0.02em]">{stat.value}</div>
          {stat.caption && <div className="truncate text-[11.5px] text-muted-foreground">{stat.caption}</div>}
        </div>
      ))}
    </div>
  )
}

/** A small fact chip for the header: "Public NYSE: MMM". */
export function FactChip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border bg-card px-2 text-[12px] font-medium",
        tone === "good" && "border-include/35 text-include",
        tone === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-300"
      )}
    >
      {children}
    </span>
  )
}
