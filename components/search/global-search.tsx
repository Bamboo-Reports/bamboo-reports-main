"use client"

import React, { useCallback, useEffect, useMemo } from "react"
import { RiBriefcaseLine, RiBuildingLine, RiContrastLine, RiGroupLine, RiLoader4Line, RiRefreshLine, RiSearchLine, RiTimeLine } from "@remixicon/react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { getEnabledSections } from "@/lib/config/dashboard-access"
import { cn } from "@/lib/utils"
import type { GroupedResults, SearchResult, SearchResultType } from "@/lib/search"
import type { RecentItem } from "@/hooks/use-recent-items"
import type { Account } from "@/lib/types"

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
  recentItems: RecentItem[]
  recentSearches: string[]
  onSelectResult: (result: SearchResult) => void
  onSelectRecentItem: (item: RecentItem) => void
  onSelectRecentSearch: (query: string) => void
  onSelectAction: (action: string) => void
}

const typeIcons: Record<SearchResultType, React.ReactNode> = {
  account: <RiBuildingLine className="h-4 w-4 shrink-0 text-primary" />,
  center: <RiBriefcaseLine className="h-4 w-4 shrink-0 text-primary" />,
  prospect: <RiGroupLine className="h-4 w-4 shrink-0 text-primary" />,
}

const typeLabels: Record<SearchResultType, string> = {
  account: "Account",
  center: "Centre",
  prospect: "Prospect",
}

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

function SearchResultRow({ result }: { result: SearchResult }) {
  const account = result.type === "account" ? (result.data as Account) : null

  return (
    <div className="flex items-start gap-3 w-full">
      <div className="mt-0.5">{typeIcons[result.type]}</div>
      <div className="flex-1 min-w-0">
        <span className="truncate text-sm font-medium leading-tight block">
          {result.title}
        </span>
        {result.matchedAlias && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground leading-tight">
            Known as: {result.matchedAlias.value}
          </p>
        )}
        {account?.account_visibility === "exclude" && (
          <p
            className="mt-0.5 truncate text-xs font-medium leading-tight text-amber-700 dark:text-amber-300"
            title="NON-GCC"
          >
            NON-GCC
          </p>
        )}
        {result.subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground leading-tight">
            {result.subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export function GlobalSearch({
  open,
  onOpenChange,
  query,
  onQueryChange,
  results,
  isSearching = false,
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
        { value: "action::go-accounts", label: "Go to Accounts", icon: RiBuildingLine, primary: true, section: "accounts" },
        { value: "action::go-centers", label: "Go to Centres", icon: RiBriefcaseLine, primary: true, section: "centers" },
        { value: "action::go-prospects", label: "Go to Prospects", icon: RiGroupLine, primary: true, section: "prospects" },
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
  const searchPlaceholder = `Search ${enabledSections.join(", ")}…`

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

      const allResults = [
        ...results.accounts.items,
        ...results.centers.items,
        ...results.prospects.items,
      ]
      const result = allResults.find((r) => r.type === type && r.id === id)
      if (result) onSelectResult(result)
    },
    [
      results,
      recentItems,
      onSelectResult,
      onSelectRecentItem,
      onSelectRecentSearch,
      onSelectAction,
    ]
  )

  const hasQuery = query.trim().length > 0
  const hasResults = results.total > 0
  const hasRecentItems = visibleRecentItems.length > 0
  const hasRecentSearches = recentSearches.length > 0
  // Actions stay reachable by name: "theme" or "go to prospects" finds them too.
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchingActions = hasQuery
    ? quickActions.filter((action) => queryWords.every((word) => action.label.toLowerCase().includes(word)))
    : quickActions

  const quickActionsGroup = matchingActions.length > 0 && (
    <CommandGroup heading="Quick Actions">
      {matchingActions.map((action) => (
        <CommandItem key={action.value} value={action.value} onSelect={handleSelect} className="py-2 px-3">
          <action.icon className={cn("h-4 w-4 shrink-0", action.primary ? "text-primary/70" : "text-muted-foreground/60")} />
          <span className="text-sm">{action.label}</span>
          {action.primary && <CommandShortcut>Tab</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="max-w-2xl" shouldFilter={false}>
      <CommandInput
        placeholder={searchPlaceholder}
        value={query}
        onValueChange={onQueryChange}
      />
      <CommandList className="max-h-[460px]">
        <CommandEmpty>
          {hasQuery ? (
            isSearching ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <RiLoader4Line className="h-6 w-6 animate-spin text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Searching for &quot;{query}&quot;…
                </p>
              </div>
            ) : query.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground">
                Keep typing, at least 2 characters…
              </p>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8">
                <div className="rounded-full bg-muted/50 p-3">
                  <RiSearchLine className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    No results for &quot;{query}&quot;
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Try a different search term or check the spelling
                  </p>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Start typing to search…
            </p>
          )}
        </CommandEmpty>

        {/* Search Results */}
        {hasQuery && hasResults && (
          <>
            {results.accounts.items.length > 0 && (
              <CommandGroup heading={`Accounts (${results.accounts.totalMatches})`}>
                {results.accounts.items.map((result) => (
                  <CommandItem
                    key={`account::${result.id}`}
                    value={`account::${result.id}`}
                    onSelect={handleSelect}
                    className="py-2.5 px-3"
                  >
                    <SearchResultRow result={result} />
                  </CommandItem>
                ))}
                {results.accounts.totalMatches > results.accounts.items.length && (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground/60">
                    +{results.accounts.totalMatches - results.accounts.items.length} more accounts
                  </p>
                )}
              </CommandGroup>
            )}

            {results.centers.items.length > 0 && (
              <CommandGroup heading={`Centres (${results.centers.totalMatches})`}>
                {results.centers.items.map((result) => (
                  <CommandItem
                    key={`center::${result.id}`}
                    value={`center::${result.id}`}
                    onSelect={handleSelect}
                    className="py-2.5 px-3"
                  >
                    <SearchResultRow result={result} />
                  </CommandItem>
                ))}
                {results.centers.totalMatches > results.centers.items.length && (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground/60">
                    +{results.centers.totalMatches - results.centers.items.length} more centers
                  </p>
                )}
              </CommandGroup>
            )}

            {results.prospects.items.length > 0 && (
              <CommandGroup heading={`Prospects (${results.prospects.totalMatches})`}>
                {results.prospects.items.map((result) => (
                  <CommandItem
                    key={`prospect::${result.id}`}
                    value={`prospect::${result.id}`}
                    onSelect={handleSelect}
                    className="py-2.5 px-3"
                  >
                    <SearchResultRow result={result} />
                  </CommandItem>
                ))}
                {results.prospects.totalMatches > results.prospects.items.length && (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground/60">
                    +{results.prospects.totalMatches - results.prospects.items.length} more prospects
                  </p>
                )}
              </CommandGroup>
            )}
          </>
        )}

        {/* Empty state: Recent items + Quick actions */}
        {hasQuery && quickActionsGroup}

        {!hasQuery && (
          <>
            {hasRecentItems && (
              <CommandGroup heading="Recently Viewed">
                {visibleRecentItems.map((item) => (
                  <CommandItem
                    key={`recent::${item.type}::${item.id}`}
                    value={`recent::${item.type}::${item.id}`}
                    onSelect={handleSelect}
                    className="py-2.5 px-3"
                  >
                    <div className="flex items-start gap-3 w-full">
                      <RiTimeLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium leading-tight">
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums">
                            {formatTimeAgo(item.viewedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground leading-tight">
                          <span className="capitalize">{typeLabels[item.type]}</span>
                          {item.subtitle ? ` · ${item.subtitle}` : ""}
                        </p>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {hasRecentSearches && (
              <CommandGroup heading="Recent Searches">
                {recentSearches.map((search) => (
                  <CommandItem
                    key={`recent-search::${search}`}
                    value={`recent-search::${search}`}
                    onSelect={handleSelect}
                    className="py-2 px-3"
                  >
                    <RiSearchLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    <span className="truncate text-sm">{search}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(hasRecentItems || hasRecentSearches) && <CommandSeparator />}

            {quickActionsGroup}
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="flex items-center border-t border-border/40 px-4 py-2">
        <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <kbd className="inline-flex h-4 items-center rounded bg-muted px-1 font-sans text-[10px] text-foreground/70">&uarr;</kbd>
              <kbd className="inline-flex h-4 items-center rounded bg-muted px-1 font-sans text-[10px] text-foreground/70">&darr;</kbd>
            </span>
            navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex h-4 items-center rounded bg-muted px-1.5 font-sans text-[10px] text-foreground/70">enter</kbd>
            open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex h-4 items-center rounded bg-muted px-1.5 font-sans text-[10px] text-foreground/70">esc</kbd>
            close
          </span>
        </div>
      </div>
    </CommandDialog>
  )
}
