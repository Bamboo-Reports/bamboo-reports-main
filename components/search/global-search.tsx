"use client"

import React, { useCallback, useEffect, useMemo } from "react"
import { RiArrowRightSLine, RiBriefcaseLine, RiBuildingLine, RiContrastLine, RiGroupLine, RiHistoryLine, RiLoader4Line, RiRefreshLine, RiSearchLine } from "@remixicon/react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { getEnabledSections } from "@/lib/config/dashboard-access"
import { cn } from "@/lib/utils"
import type { GroupedResults, SearchResult, SearchResultType } from "@/lib/search"
import type { RecentItem } from "@/hooks/use-recent-items"
import type { Account } from "@/lib/types"
import type { SearchFocus } from "@/lib/dashboard/api-client"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  results: {
    accounts: GroupedResults
    centers: GroupedResults
    prospects: GroupedResults
    total: number
  }
  /** True while a lookup for the current query is still in flight. */
  isSearching?: boolean
  /** The one type results are narrowed to; null shows every type. */
  focus?: SearchFocus | null
  onFocusChange?: (focus: SearchFocus | null) => void
  recentItems: RecentItem[]
  recentSearches: string[]
  onSelectResult: (result: SearchResult) => void
  onSelectRecentItem: (item: RecentItem) => void
  onSelectRecentSearch: (query: string) => void
  onSelectAction: (action: string) => void
}

const TYPE_META: Record<SearchResultType, { icon: typeof RiBuildingLine; label: string; plural: string; focus: SearchFocus }> = {
  account: { icon: RiBuildingLine, label: "Account", plural: "accounts", focus: "accounts" },
  center: { icon: RiBriefcaseLine, label: "Centre", plural: "centres", focus: "centers" },
  prospect: { icon: RiGroupLine, label: "Prospect", plural: "prospects", focus: "prospects" },
}

const GROUPS: Array<{ key: SearchFocus; type: SearchResultType; heading: string }> = [
  { key: "accounts", type: "account", heading: "Accounts" },
  { key: "centers", type: "center", heading: "Centres" },
  { key: "prospects", type: "prospect", heading: "Prospects" },
]

/** Rows share one look: a quiet icon tile, the name with the typed letters in bold, and a line under it. */
const ITEM_CLASS =
  "gap-2.5 rounded-md px-2.5 py-2 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground [&[data-selected=true]_.result-title]:text-primary"

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** The title with the first match of the query in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold">{text.slice(at, at + q.length)}</b>
      {text.slice(at + q.length)}
    </>
  )
}

function IconTile({ icon: Icon }: { icon: typeof RiBuildingLine }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
      <Icon className="h-4 w-4" />
    </span>
  )
}

function SearchResultRow({ result, query }: { result: SearchResult; query: string }) {
  const account = result.type === "account" ? (result.data as Account) : null
  return (
    <>
      <IconTile icon={TYPE_META[result.type].icon} />
      <div className="min-w-0 flex-1">
        <p className="result-title flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
          <span className="truncate">
            <Highlight text={result.title} query={query} />
          </span>
          {account?.account_visibility === "exclude" && (
            <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-300">Non-GCC</span>
          )}
        </p>
        {result.matchedAlias && (
          <p className="truncate text-xs text-muted-foreground">Also known as {result.matchedAlias.value}</p>
        )}
        {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
      </div>
    </>
  )
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex w-full items-baseline justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{count.toLocaleString()}</span>
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border bg-muted/60 px-1 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

export function GlobalSearch({
  open,
  onOpenChange,
  query,
  onQueryChange,
  results,
  isSearching = false,
  focus = null,
  onFocusChange,
  recentItems,
  recentSearches,
  onSelectResult,
  onSelectRecentItem,
  onSelectRecentSearch,
  onSelectAction,
}: GlobalSearchProps) {
  const enabledSections = getEnabledSections()
  const enabledSectionSet = useMemo(() => new Set(enabledSections), [enabledSections])
  const quickActions = useMemo(
    () =>
      [
        { value: "action::go-accounts", label: "Go to accounts", icon: RiBuildingLine, primary: true, section: "accounts" },
        { value: "action::go-centers", label: "Go to centres", icon: RiBriefcaseLine, primary: true, section: "centers" },
        { value: "action::go-prospects", label: "Go to prospects", icon: RiGroupLine, primary: true, section: "prospects" },
        { value: "action::refresh", label: "Refresh data", icon: RiRefreshLine, primary: false, section: null },
        { value: "action::toggle-theme", label: "Toggle theme", icon: RiContrastLine, primary: false, section: null },
      ].filter((action) => !action.section || enabledSectionSet.has(action.section as (typeof enabledSections)[number])),
    [enabledSectionSet]
  )
  const visibleRecentItems = useMemo(
    () =>
      recentItems.filter((item) => {
        if (item.type === "account") return enabledSectionSet.has("accounts")
        if (item.type === "center") return enabledSectionSet.has("centers")
        return enabledSectionSet.has("prospects")
      }),
    [enabledSectionSet, recentItems]
  )
  const sectionNames = GROUPS.filter((g) => enabledSectionSet.has(g.key)).map((g) => g.heading.toLowerCase())
  const searchPlaceholder =
    sectionNames.length > 1 ? `Search ${sectionNames.slice(0, -1).join(", ")} and ${sectionNames[sectionNames.length - 1]}` : `Search ${sectionNames[0] ?? ""}`

  // Register global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  const handleSelect = useCallback(
    (value: string) => {
      const [type, ...idParts] = value.split("::")
      const id = idParts.join("::")

      if (type === "showall") {
        onFocusChange?.(id as SearchFocus)
        return
      }
      if (type === "action") {
        onSelectAction(id)
        return
      }
      if (type === "recent-search") {
        onSelectRecentSearch(id)
        return
      }
      if (type === "recent") {
        const item = recentItems.find((r) => `${r.type}::${r.id}` === `${id}`)
        if (item) onSelectRecentItem(item)
        return
      }

      const allResults = [...results.accounts.items, ...results.centers.items, ...results.prospects.items]
      const result = allResults.find((r) => r.type === type && r.id === id)
      if (result) onSelectResult(result)
    },
    [results, recentItems, onSelectResult, onSelectRecentItem, onSelectRecentSearch, onSelectAction, onFocusChange]
  )

  const hasQuery = query.trim().length > 0
  const hasResults = results.total > 0
  const hasRecentItems = visibleRecentItems.length > 0
  const hasRecentSearches = recentSearches.length > 0
  const visibleGroups = GROUPS.filter((group) => enabledSectionSet.has(group.key) && (!focus || focus === group.key))

  // Actions stay reachable by name: "theme" or "go to prospects" finds them too.
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchingActions = hasQuery
    ? quickActions.filter((action) => queryWords.every((word) => action.label.toLowerCase().includes(word)))
    : quickActions

  const quickActionsGroup = matchingActions.length > 0 && (
    <CommandGroup heading={hasQuery ? "Actions" : "Go to"}>
      {matchingActions.map((action) => (
        <CommandItem key={action.value} value={action.value} onSelect={handleSelect} className={ITEM_CLASS}>
          <IconTile icon={action.icon} />
          <span className="result-title text-[13px] font-medium">{action.label}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )

  const chips = hasQuery && hasResults && (
    <div className="flex flex-wrap gap-1.5 border-b px-3 py-2.5" role="group" aria-label="Show results for">
      {[{ key: null, label: "All", count: results.total }, ...GROUPS.filter((g) => enabledSectionSet.has(g.key)).map((g) => ({ key: g.key, label: g.heading, count: results[g.key].totalMatches }))].map(
        (chip) => {
          const on = focus === chip.key
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={on}
              disabled={chip.key !== null && chip.count === 0}
              onClick={() => onFocusChange?.(chip.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-45",
                on ? "border-primary/50 bg-primary/10 text-primary" : "bg-card text-muted-foreground enabled:hover:text-foreground"
              )}
            >
              {chip.label}
              <span className={cn("font-medium tabular-nums", on ? "text-primary" : "text-foreground")}>{chip.count.toLocaleString()}</span>
            </button>
          )
        }
      )}
    </div>
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="max-w-[640px]" shouldFilter={false}>
      <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={onQueryChange} className="h-12 text-[15px]" />
      {chips}
      <CommandList className="max-h-[440px] px-1.5 pb-2 pt-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs">
        <CommandEmpty>
          {hasQuery ? (
            isSearching ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <RiLoader4Line className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">Searching for &ldquo;{query.trim()}&rdquo;</p>
              </div>
            ) : query.trim().length < 2 ? (
              <p className="text-[13px] text-muted-foreground">Type at least 2 letters</p>
            ) : (
              <div className="px-6 py-8 text-center">
                <RiSearchLine className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-[13px] font-medium">Nothing matches &ldquo;{query.trim()}&rdquo;</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Check the spelling, or search by a shorter part of the name.</p>
              </div>
            )
          ) : (
            <p className="text-[13px] text-muted-foreground">Start typing to search</p>
          )}
        </CommandEmpty>

        {hasQuery &&
          hasResults &&
          visibleGroups.map(({ key, type, heading }) => {
            const group = results[key]
            if (group.items.length === 0) return null
            const hidden = group.totalMatches - group.items.length
            return (
              <CommandGroup key={key} heading={<GroupHeading label={heading} count={group.totalMatches} />}>
                {group.items.map((result) => (
                  <CommandItem key={`${type}::${result.id}`} value={`${type}::${result.id}`} onSelect={handleSelect} className={ITEM_CLASS}>
                    <SearchResultRow result={result} query={query} />
                  </CommandItem>
                ))}
                {hidden > 0 && !focus && (
                  <CommandItem
                    value={`showall::${key}`}
                    onSelect={handleSelect}
                    className={cn(ITEM_CLASS, "py-1.5 text-[13px] font-medium text-primary data-[selected=true]:text-primary")}
                  >
                    Show all {group.totalMatches.toLocaleString()} {TYPE_META[type].plural}
                    <RiArrowRightSLine className="h-4 w-4" />
                  </CommandItem>
                )}
                {hidden > 0 && focus && (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    Showing the first {group.items.length.toLocaleString()} of {group.totalMatches.toLocaleString()}. Type more of the name to narrow it down.
                  </p>
                )}
              </CommandGroup>
            )
          })}

        {hasQuery && !focus && quickActionsGroup}

        {!hasQuery && (
          <>
            {hasRecentSearches && (
              <CommandGroup heading="Recent searches">
                {recentSearches.map((search) => (
                  <CommandItem key={`recent-search::${search}`} value={`recent-search::${search}`} onSelect={handleSelect} className={cn(ITEM_CLASS, "py-1.5")}>
                    <RiHistoryLine className="h-4 w-4 text-muted-foreground" />
                    <span className="result-title truncate text-[13px]">{search}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {hasRecentItems && (
              <CommandGroup heading="Recently opened">
                {visibleRecentItems.map((item) => (
                  <CommandItem
                    key={`recent::${item.type}::${item.id}`}
                    value={`recent::${item.type}::${item.id}`}
                    onSelect={handleSelect}
                    className={ITEM_CLASS}
                  >
                    <IconTile icon={TYPE_META[item.type].icon} />
                    <div className="min-w-0 flex-1">
                      <p className="result-title truncate text-[13px] font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {TYPE_META[item.type].label}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimeAgo(item.viewedAt)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {quickActionsGroup}
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-3.5 border-t px-3.5 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Kbd>&uarr;</Kbd>
          <Kbd>&darr;</Kbd>
          <span className="ml-0.5">Move</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Enter</Kbd>
          Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          Close
        </span>
      </div>
    </CommandDialog>
  )
}
