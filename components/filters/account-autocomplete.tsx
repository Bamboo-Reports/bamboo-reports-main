"use client"

import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X, Plus, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  normalizeTrackedText,
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
  toTrackedStringArray,
} from "@/lib/analytics/tracking"
import type { Alias, FilterValue } from "@/lib/types"
import { buildAliasMap, findAliasMatch, type AliasMatch } from "@/lib/search/alias-utils"

interface AccountAutocompleteProps {
  accountNames: string[]
  selectedAccounts: FilterValue[]
  onChange: (accounts: FilterValue[]) => void
  placeholder?: string
  trackingKey?: string
  aliases?: Alias[]
  accountVisibilityByName?: Record<string, AccountVisibilityInfo>
}

interface AccountSuggestion {
  name: string
  matchedAlias: AliasMatch | null
  visibility: AccountVisibilityInfo | null
}

export interface AccountVisibilityInfo {
  visibility?: "include" | "exclude" | null
  note?: string | null
}

export function AccountAutocomplete({
  accountNames,
  selectedAccounts,
  onChange,
  placeholder = "Type to search account names...",
  trackingKey,
  aliases,
  accountVisibilityByName,
}: AccountAutocompleteProps) {
  const [inputValue, setInputValue] = useState("")
  const [debouncedValue, setDebouncedValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const sourceFilterKey = trackingKey ?? "accountGlobalLegalNameKeywords"
  const comboboxId = useId()

  // Debounce input value for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(inputValue)
    }, 300)

    return () => clearTimeout(timer)
  }, [inputValue])

  // Get unique, sorted account names (memoized for performance)
  const uniqueAccountNames = useMemo(() => {
    const unique = Array.from(new Set(accountNames.filter(Boolean)))
    return unique.sort((a, b) => a.localeCompare(b))
  }, [accountNames])

  const aliasMap = useMemo(() => buildAliasMap(aliases ?? []), [aliases])

  // Filter suggestions based on input with smart matching
  const suggestions = useMemo<AccountSuggestion[]>(() => {
    if (!debouncedValue.trim()) return []

    const searchTerm = debouncedValue.toLowerCase().trim()
    const alreadySelected = new Set(selectedAccounts.map(s => s.value.toLowerCase()))

    const startsWithMatches: AccountSuggestion[] = []
    const containsMatches: AccountSuggestion[] = []
    const aliasMatches: AccountSuggestion[] = []

    for (const name of uniqueAccountNames) {
      const lowerName = name.toLowerCase()
      if (alreadySelected.has(lowerName)) continue
      const visibility = accountVisibilityByName?.[name] ?? null

      if (lowerName.startsWith(searchTerm)) {
        startsWithMatches.push({ name, matchedAlias: null, visibility })
      } else if (lowerName.includes(searchTerm)) {
        containsMatches.push({ name, matchedAlias: null, visibility })
      } else {
        const matched = findAliasMatch(aliasMap.get(lowerName), searchTerm)
        if (matched) {
          aliasMatches.push({ name, matchedAlias: matched, visibility })
        }
      }
    }

    return [...startsWithMatches, ...containsMatches, ...aliasMatches].slice(0, 50)
  }, [debouncedValue, uniqueAccountNames, selectedAccounts, aliasMap, accountVisibilityByName])
  const isSuggestionsOpen = isOpen && suggestions.length > 0
  const listboxId = `${comboboxId}-listbox`
  const activeOptionId =
    isSuggestionsOpen && suggestions[highlightedIndex]
      ? `${comboboxId}-option-${highlightedIndex}`
      : undefined

  // Handle account selection
  const handleSelectAccount = useCallback((accountName: string, mode: 'include' | 'exclude' = 'include') => {
    const newAccount: FilterValue = { value: accountName, mode }
    const nextSelected = [...selectedAccounts, newAccount]
    onChange(nextSelected)
    captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
      filter_key: sourceFilterKey,
      option_value: accountName,
      mode,
      action: "add",
      selected_values: toTrackedFilterPlainValues(nextSelected),
      selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
    })
    setInputValue("")
    setDebouncedValue("")
    setIsOpen(false)
    setHighlightedIndex(0)
    inputRef.current?.focus()
  }, [selectedAccounts, onChange, sourceFilterKey])

  // Handle account removal
  const handleRemoveAccount = useCallback((index: number) => {
    const removedAccount = selectedAccounts[index]
    const newAccounts = selectedAccounts.filter((_, i) => i !== index)
    onChange(newAccounts)
    if (removedAccount) {
      captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
        filter_key: sourceFilterKey,
        option_value: removedAccount.value,
        mode: removedAccount.mode,
        action: "remove",
        selected_values: toTrackedFilterPlainValues(newAccounts),
        selected_values_with_mode: toTrackedFilterValueArray(newAccounts),
      })
    }
  }, [selectedAccounts, onChange, sourceFilterKey])

  // Toggle include/exclude mode
  const handleToggleMode = useCallback((index: number) => {
    const target = selectedAccounts[index]
    const nextMode = target?.mode === "include" ? "exclude" : "include"
    const newAccounts = selectedAccounts.map((account, i) =>
      i === index
        ? { ...account, mode: nextMode } as FilterValue
        : account
    )
    onChange(newAccounts)
    if (target) {
      captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
        filter_key: sourceFilterKey,
        option_value: target.value,
        mode: nextMode,
        action: "toggle_mode",
        selected_values: toTrackedFilterPlainValues(newAccounts),
        selected_values_with_mode: toTrackedFilterValueArray(newAccounts),
      })
    }
  }, [selectedAccounts, onChange, sourceFilterKey])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && inputValue.trim()) {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
        break
      case 'Enter':
        e.preventDefault()
        if (suggestions[highlightedIndex]) {
          handleSelectAccount(suggestions[highlightedIndex].name)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(0)
        break
    }
  }, [isOpen, suggestions, highlightedIndex, handleSelectAccount, inputValue])

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [suggestions])

  useEffect(() => {
    if (!isOpen) return
    captureEvent(ANALYTICS_EVENTS.FILTER_DROPDOWN_OPENED, {
      filter_key: sourceFilterKey,
      selected_count: selectedAccounts.length,
      options_count: uniqueAccountNames.length,
      selected_values: toTrackedFilterPlainValues(selectedAccounts),
      selected_values_with_mode: toTrackedFilterValueArray(selectedAccounts),
      option_values_preview: toTrackedStringArray(uniqueAccountNames),
    })
  }, [isOpen, sourceFilterKey, selectedAccounts, uniqueAccountNames])

  useEffect(() => {
    if (!debouncedValue.trim()) return
    captureEvent(ANALYTICS_EVENTS.FILTER_SEARCH_TYPED, {
      filter_key: sourceFilterKey,
      query_text: normalizeTrackedText(debouncedValue),
      query_length: debouncedValue.trim().length,
      results_visible_count: suggestions.length,
      input_type: "autocomplete",
      suggestion_values: toTrackedStringArray(suggestions.map((s) => s.name)),
    })
  }, [debouncedValue, suggestions, sourceFilterKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Highlight matching text in suggestion
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text

    const index = text.toLowerCase().indexOf(query.toLowerCase())
    if (index === -1) return text

    return (
      <>
        {text.slice(0, index)}
        <span className="font-semibold text-foreground bg-yellow-200 dark:bg-yellow-900/50">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {/* Selected Accounts as Badges */}
      {selectedAccounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedAccounts.map((account, index) => {
            const isInclude = account.mode === 'include'
            return (
              <Badge
                key={`${account.value}-${index}`}
                variant="secondary"
                className={cn(
                  "group flex items-center gap-1 pr-1 max-w-full",
                  isInclude
                    ? "bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-300 border-green-500/50 hover:bg-green-500/30"
                    : "bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300 border-red-500/50 hover:bg-red-500/30"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleToggleMode(index)}
                  className={cn(
                    "flex items-center justify-center w-4 h-4 rounded-sm shrink-0",
                    isInclude
                      ? "bg-green-600/30 hover:bg-green-600/50"
                      : "bg-red-600/30 hover:bg-red-600/50"
                  )}
                  title={isInclude ? 'Click to exclude' : 'Click to include'}
                  aria-label={isInclude ? `Exclude ${account.value}` : `Include ${account.value}`}
                >
                  {isInclude ? (
                    <Plus className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                </button>
                <span className="text-xs truncate max-w-[240px]" title={account.value}>{account.value}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAccount(index)}
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100 hover:bg-accent p-0.5 shrink-0"
                  title="Remove"
                  aria-label={`Remove ${account.value}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Autocomplete Input */}
      <div className="relative">
        <div className="relative">
          <Input
            id={comboboxId}
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputValue.trim()) setIsOpen(true)
            }}
            placeholder={placeholder}
            role="combobox"
            aria-label="Search account names"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
          />
        </div>

        {/* Suggestions Dropdown */}
        {isSuggestionsOpen && (
          <div
            ref={dropdownRef}
            className="relative z-50 w-full mt-1 bg-popover border rounded-md shadow-lg"
            role="listbox"
            id={listboxId}
            aria-label="Account suggestions"
          >
            <div className="max-h-[300px] overflow-y-auto">
              <div className="p-1">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.name}
                    id={`${comboboxId}-option-${index}`}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 cursor-pointer rounded-sm text-sm transition-colors",
                      highlightedIndex === index
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    )}
                    role="option"
                    aria-selected={highlightedIndex === index}
                    onClick={() => handleSelectAccount(suggestion.name)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block">
                        {suggestion.matchedAlias
                          ? suggestion.name
                          : highlightMatch(suggestion.name, debouncedValue)}
                      </span>
                      {suggestion.matchedAlias && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Known as: {highlightMatch(suggestion.matchedAlias.value, debouncedValue)}
                        </span>
                      )}
                      {suggestion.visibility?.visibility === "exclude" && (
                        <span
                          className="mt-0.5 block truncate text-xs font-medium text-amber-700 dark:text-amber-300"
                          title="NON-GCC"
                        >
                          NON-GCC
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectAccount(suggestion.name, 'include')
                        }}
                        title="Include"
                        aria-label={`Include ${suggestion.name}`}
                      >
                        <Plus className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectAccount(suggestion.name, 'exclude')
                        }}
                        title="Exclude"
                        aria-label={`Exclude ${suggestion.name}`}
                      >
                        <Minus className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Results count indicator */}
            {suggestions.length === 50 && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/50">
                Showing first 50 results. Type more to narrow down.
              </div>
            )}
          </div>
        )}

        {/* No results message */}
        {isOpen && debouncedValue.trim() && suggestions.length === 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            No accounts found matching &quot;{debouncedValue}&quot;
          </div>
        )}
      </div>


    </div>
  )
}
