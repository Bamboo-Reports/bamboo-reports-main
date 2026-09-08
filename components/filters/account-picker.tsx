"use client"

import { useEffect, useRef, useState } from "react"
import { RiCheckLine, RiExpandUpDownLine, RiLoader4Line, RiSearchLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { fetchAccountAutocomplete } from "@/lib/dashboard/api-client"
import { devError } from "@/lib/utils/dev-log"

export type AccountPickerOption = {
  name: string
  matchedAlias?: { field: string; value: string } | null
  visibility?: { visibility: "include" | "exclude" | null; note?: string | null } | null
}

interface AccountPickerProps {
  value: string | null
  onChange: (name: string | null) => void
  /** Pre-populated choices shown before the user types (for example match candidates). */
  suggestions?: AccountPickerOption[]
  placeholder?: string
  className?: string
  ariaLabel?: string
}

/**
 * Compact single-account picker: a popover with a search box backed by the
 * server autocomplete endpoint. Used per row in the account list upload
 * review table where the full multi-select autocomplete would be too heavy.
 */
export function AccountPicker({ value, onChange, suggestions = [], placeholder = "Select account", className, ariaLabel }: AccountPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AccountPickerOption[]>([])
  const [searching, setSearching] = useState(false)
  const requestRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      return
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    const term = query.trim().toLowerCase()
    const requestId = ++requestRef.current
    if (term.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      fetchAccountAutocomplete(term)
        .then((res) => {
          if (requestRef.current !== requestId) return
          setResults(
            res.suggestions.map((s) => ({
              name: s.value,
              matchedAlias: (s.matchedAlias as AccountPickerOption["matchedAlias"]) ?? null,
              visibility: s.visibility
                ? { visibility: (s.visibility.visibility as "include" | "exclude" | null) ?? null, note: s.visibility.note }
                : null,
            }))
          )
          setSearching(false)
        })
        .catch((err) => {
          if (requestRef.current !== requestId) return
          devError("account picker search failed:", err)
          setResults([])
          setSearching(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const showSuggestions = query.trim().length < 2
  const options = showSuggestions ? suggestions : results

  const select = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          className={cn("h-8 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value ?? placeholder}</span>
          <RiExpandUpDownLine className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <RiSearchLine className="h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts..."
            aria-label="Search accounts"
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {searching && <RiLoader4Line className="h-4 w-4 shrink-0 animate-spin opacity-60" />}
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1" role="listbox">
          {options.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {showSuggestions ? "Type at least 2 characters to search" : searching ? "Searching..." : "No accounts found"}
            </p>
          ) : (
            options.map((option) => (
              <button
                type="button"
                key={option.name}
                role="option"
                aria-selected={option.name === value}
                onClick={() => select(option.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none",
                  option.name === value && "bg-accent/60"
                )}
              >
                <RiCheckLine className={cn("h-3.5 w-3.5 shrink-0", option.name === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.name}</span>
                  {option.matchedAlias?.value && (
                    <span className="block truncate text-xs text-muted-foreground">Known as {option.matchedAlias.value}</span>
                  )}
                </span>
                {option.visibility?.visibility === "exclude" && (
                  <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    Non-GCC
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        {value && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
