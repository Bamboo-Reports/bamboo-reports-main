"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, ListChecks, Minus, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useAccountLists } from "@/contexts/account-lists-context"
import type { AccountList } from "@/lib/accounts/account-lists"
import type { FilterValue } from "@/lib/types"

interface AccountListPickerProps {
  /** Selected lists (value = list id). */
  selected: FilterValue[]
  /** Exact names currently on the filter, so a filter carrying names without a known list still shows. */
  accountNameCount: number
  onChange: (selection: FilterValue[], lists: AccountList[]) => void
  onClearNames: () => void
}

/**
 * Sidebar picker for uploaded account lists. Selecting lists sets
 * accountListValues; the caller expands them into exact account names.
 */
export function AccountListPicker({ selected, accountNameCount, onChange, onClearNames }: AccountListPickerProps) {
  const { lists } = useAccountLists()
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.value)), [selected])
  const unknownSelected = selected.filter((s) => !byId.has(s.value))

  const toggle = (id: string) => {
    const next = selectedIds.has(id) ? selected.filter((s) => s.value !== id) : [...selected, { value: id, mode: "include" as const }]
    onChange(next, lists)
  }
  const remove = (id: string) => onChange(selected.filter((s) => s.value !== id), lists)
  const toggleMode = (id: string) =>
    onChange(
      selected.map((s) => (s.value === id ? { ...s, mode: s.mode === "exclude" ? ("include" as const) : ("exclude" as const) } : s)),
      lists
    )
  const includeCount = selected.filter((s) => s.mode !== "exclude").length
  const excludeCount = selected.length - includeCount

  const summary =
    selected.length === 0
      ? accountNameCount > 0
        ? `${accountNameCount} accounts from a shared list`
        : "Select an uploaded list"
      : [
          includeCount > 0 ? `${includeCount} included` : null,
          excludeCount > 0 ? `${excludeCount} excluded` : null,
          `${accountNameCount} accounts`,
        ]
          .filter(Boolean)
          .join(", ")

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select account lists"
            className={cn("h-9 w-full justify-between font-normal", selected.length === 0 && accountNameCount === 0 && "text-muted-foreground")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{summary}</span>
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-1" align="start">
          {lists.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No account lists yet. Upload one from the Account Lists button above.
            </p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto" role="listbox" aria-multiselectable="true">
              {lists.map((list) => {
                const active = selectedIds.has(list.id)
                return (
                  <button
                    type="button"
                    key={list.id}
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(list.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none",
                      active && "bg-accent/60"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate" title={list.name}>
                      {list.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{list.accounts.length}</span>
                  </button>
                )
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {(selected.length > 0 || accountNameCount > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((entry) => {
            const list = byId.get(entry.value)
            if (!list) return null
            const isInclude = entry.mode !== "exclude"
            return (
              <span
                key={entry.value}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs",
                  isInclude
                    ? "border-green-500/50 bg-green-500/15 text-green-700 dark:text-green-300"
                    : "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
                )}
                title={`${list.name} (${list.accounts.length} accounts, ${isInclude ? "included" : "excluded"})`}
              >
                <button
                  type="button"
                  onClick={() => toggleMode(entry.value)}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
                    isInclude ? "bg-green-600/30 hover:bg-green-600/50" : "bg-red-600/30 hover:bg-red-600/50"
                  )}
                  title={isInclude ? "Click to exclude" : "Click to include"}
                  aria-label={isInclude ? `Exclude ${list.name}` : `Include ${list.name}`}
                >
                  {isInclude ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </button>
                <span className="truncate">{list.name}</span>
                <span className="opacity-70">({list.accounts.length})</span>
                <button type="button" aria-label={`Remove ${list.name}`} className="rounded-sm opacity-70 hover:opacity-100" onClick={() => remove(entry.value)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {(unknownSelected.length > 0 || (selected.length === 0 && accountNameCount > 0)) && (
            <button
              type="button"
              onClick={onClearNames}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              title="This filter carries account names from a list that is not in your lists"
            >
              {accountNameCount} accounts
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
