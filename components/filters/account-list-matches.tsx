"use client"

import { useMemo, useState } from "react"
import { RiArrowRightLine, RiSearchLine } from "@remixicon/react"
import { AccountPicker } from "@/components/filters/account-picker"
import { cn } from "@/lib/utils"
import type { AccountListMatch } from "@/lib/accounts/account-lists"

type FilterId = "all" | "changed" | "none" | "exact"

const isChanged = (m: AccountListMatch) => m.via !== "exact" && m.via !== "none"

const FILTERS: Array<{ id: FilterId; label: string; dot?: string; test: (m: AccountListMatch) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "changed", label: "Name changed", dot: "bg-primary", test: isChanged },
  { id: "none", label: "Not matched", dot: "bg-exclude", test: (m) => m.via === "none" },
  { id: "exact", label: "Exact", dot: "bg-include", test: (m) => m.via === "exact" },
]

interface AccountListMatchesProps {
  matches: AccountListMatch[]
  /** Maps a name that was not matched; omitted when the list is read-only (shared with you). */
  onMap?: (input: string, account: string) => void
}

/** Each uploaded name next to the account it was matched to. */
export function AccountListMatches({ matches, onMap }: AccountListMatchesProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterId>("all")

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return matches
    return matches.filter((m) => m.input.toLowerCase().includes(q) || (m.account ?? "").toLowerCase().includes(q))
  }, [matches, query])
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
  const rows = searched.filter(active.test)

  return (
    <>
      <div className="shrink-0 space-y-3 px-5 pb-3 pt-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
          <RiSearchLine className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search names and accounts"
            aria-label="Search uploaded names and accounts"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const count = searched.filter(f.test).length
            if (f.id !== "all" && count === 0 && filter !== f.id) return null
            const on = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  on ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {f.dot && <span className={cn("h-2 w-2 rounded-full", f.dot)} />}
                {f.label}
                <span className={cn("tabular-nums", on ? "text-primary" : "text-foreground")}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {rows.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col />
              <col className="w-7" />
              <col />
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="sticky top-0 z-[1] h-9 border-b bg-background px-2 font-medium">Uploaded name</th>
                <th className="sticky top-0 z-[1] border-b bg-background" aria-hidden />
                <th className="sticky top-0 z-[1] border-b bg-background px-2 font-medium">Matched account</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, index) => {
                const changed = isChanged(m)
                return (
                  <tr key={`${m.input}-${index}`} className={cn("hover:bg-muted/50", m.via === "none" && "bg-exclude/[0.04]")}>
                    <td className={cn("h-11 truncate border-b border-border/60 px-2", changed || m.via === "none" ? "text-foreground" : "text-muted-foreground")} title={m.input}>
                      {m.input}
                    </td>
                    <td className="border-b border-border/60 text-center text-muted-foreground">
                      <RiArrowRightLine className="mx-auto h-3.5 w-3.5" />
                    </td>
                    <td className="border-b border-border/60 px-2">
                      {m.account ? (
                        <span className="block truncate font-medium" title={m.account}>{m.account}</span>
                      ) : onMap ? (
                        <AccountPicker value={null} onChange={(name) => name && onMap(m.input, name)} placeholder="Map to an account" ariaLabel={`Account for ${m.input}`} />
                      ) : (
                        <span className="text-muted-foreground">No account</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-2 py-7 text-center text-[13px] text-muted-foreground">
            {query.trim() ? <>Nothing matches &ldquo;{query.trim()}&rdquo;</> : "Nothing to show here"}
          </p>
        )}
      </div>
    </>
  )
}
