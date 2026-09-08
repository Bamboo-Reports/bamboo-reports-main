import { useState } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { RiAddLine, RiCloseLine, RiSubtractLine } from "@remixicon/react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  normalizeTrackedText,
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
} from "@/lib/analytics/tracking"
import type { FilterValue } from "@/lib/types"

interface TitleKeywordInputProps {
  keywords: FilterValue[]
  onChange: (keywords: FilterValue[]) => void
  placeholder?: string
  trackingKey?: string
}

export function TitleKeywordInput({
  keywords,
  onChange,
  placeholder = "e.g., Manager, Director, VP...",
  trackingKey,
}: TitleKeywordInputProps) {
  const [inputValue, setInputValue] = useState("")
  const sourceFilterKey = trackingKey ?? placeholder

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault()
      const trimmedValue = inputValue.trim()
      if (!keywords.find((k) => k.value === trimmedValue)) {
        const nextKeywords = [...keywords, { value: trimmedValue, mode: "include" } as FilterValue]
        onChange(nextKeywords)
        captureEvent(ANALYTICS_EVENTS.FILTER_KEYWORD_CHANGED, {
          filter_key: sourceFilterKey,
          action: "add",
          keyword_value: trimmedValue,
          mode: "include",
          selected_values: toTrackedFilterPlainValues(nextKeywords),
          selected_values_with_mode: toTrackedFilterValueArray(nextKeywords),
        })
      }
      setInputValue("")
    }
  }

  const removeKeyword = (keywordToRemove: FilterValue) => {
    const nextKeywords = keywords.filter((k) => k.value !== keywordToRemove.value)
    onChange(nextKeywords)
    captureEvent(ANALYTICS_EVENTS.FILTER_KEYWORD_CHANGED, {
      filter_key: sourceFilterKey,
      action: "remove",
      keyword_value: keywordToRemove.value,
      mode: keywordToRemove.mode,
      selected_values: toTrackedFilterPlainValues(nextKeywords),
      selected_values_with_mode: toTrackedFilterValueArray(nextKeywords),
    })
  }

  const toggleKeywordMode = (keyword: FilterValue) => {
    const nextMode = keyword.mode === "include" ? "exclude" : "include"
    const nextKeywords: FilterValue[] = keywords.map((k) =>
      k.value === keyword.value
        ? { ...k, mode: nextMode }
        : k
    )
    onChange(
      nextKeywords
    )
    captureEvent(ANALYTICS_EVENTS.FILTER_KEYWORD_CHANGED, {
      filter_key: sourceFilterKey,
      action: "toggle_mode",
      keyword_value: keyword.value,
      mode: nextMode,
      selected_values: toTrackedFilterPlainValues(nextKeywords),
      selected_values_with_mode: toTrackedFilterValueArray(nextKeywords),
    })
  }

  return (
    <div className="space-y-2">
      <Input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => {
          const value = e.target.value
          setInputValue(value)
          captureEvent(ANALYTICS_EVENTS.FILTER_SEARCH_TYPED, {
            filter_key: sourceFilterKey,
            query_text: normalizeTrackedText(value),
            query_length: value.trim().length,
            input_type: "keyword",
          })
        }}
        onKeyDown={handleKeyDown}
        className="text-sm"
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {keywords.map((keyword) => {
            const isInclude = keyword.mode === "include"
            return (
              <Badge
                key={keyword.value}
                variant="secondary"
                className={cn(
                  "flex items-center gap-1 pr-1",
                  isInclude
                    ? "bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-300 border-green-500/50 hover:bg-green-500/25"
                    : "bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300 border-red-500/50 hover:bg-red-500/25"
                )}
              >
                <button
                  onClick={() => toggleKeywordMode(keyword)}
                  className={cn(
                    "flex items-center justify-center w-4 h-4 rounded-sm",
                    isInclude
                      ? "bg-green-600/30 hover:bg-green-600/40"
                      : "bg-red-600/30 hover:bg-red-600/40"
                  )}
                  title={isInclude ? "Click to exclude" : "Click to include"}
                  type="button"
                  aria-label={isInclude ? `Exclude ${keyword.value}` : `Include ${keyword.value}`}
                >
                  {isInclude ? (
                    <RiAddLine className="h-3 w-3" />
                  ) : (
                    <RiSubtractLine className="h-3 w-3" />
                  )}
                </button>
                <span className="text-xs">{keyword.value}</span>
                <button
                  onClick={() => removeKeyword(keyword)}
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100 hover:bg-accent/40 p-0.5 transition-colors duration-150"
                  type="button"
                  title="Remove"
                  aria-label={`Remove ${keyword.value}`}
                >
                  <RiCloseLine className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
