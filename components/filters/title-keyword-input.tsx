import { useState } from "react"
import { Input } from "@/components/ui/input"
import { FilterChip } from "@/components/filters/filter-chip"
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
      const mode: FilterValue["mode"] = e.shiftKey ? "exclude" : "include"
      if (!keywords.find((k) => k.value === trimmedValue)) {
        const nextKeywords = [...keywords, { value: trimmedValue, mode }]
        onChange(nextKeywords)
        captureEvent(ANALYTICS_EVENTS.FILTER_KEYWORD_CHANGED, {
          filter_key: sourceFilterKey,
          action: "add",
          keyword_value: trimmedValue,
          mode,
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
        className="h-[34px] text-[13px]"
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
              <FilterChip
                key={keyword.value}
                item={keyword}
                onToggleMode={() => toggleKeywordMode(keyword)}
                onRemove={() => removeKeyword(keyword)}
              />
          ))}
        </div>
      )}
    </div>
  )
}
