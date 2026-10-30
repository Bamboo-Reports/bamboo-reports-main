"use client"

import React from "react"
import { toast } from "sonner"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

export type RangeUnit = "money" | "years" | "year"

type Bounds = { min: number; max: number }

const trimDecimal = (value: number) => String(Number(value.toFixed(1)))

/** Revenue is stored in millions: 1 → "$1M", 1500 → "$1.5B". */
export function formatRangeValue(value: number, unit: RangeUnit) {
  if (unit === "money") return value >= 1000 ? `$${trimDecimal(value / 1000)}B` : `$${trimDecimal(value)}M`
  return String(Math.round(value))
}

/** Reads "500", "500M", "2B", "2bn", "$1.5B" (money, in millions) or a plain whole number. */
export function parseRangeValue(text: string, unit: RangeUnit): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, "").toLowerCase()
  if (!cleaned) return null
  if (unit === "money") {
    const match = cleaned.match(/^(\d+(?:\.\d+)?)(bn|b|mn|m|k)?$/)
    if (!match) return null
    const amount = Number.parseFloat(match[1])
    const suffix = match[2] ?? "m"
    if (suffix.startsWith("b")) return amount * 1000
    if (suffix === "k") return amount / 1000
    return amount
  }
  const whole = Number.parseInt(cleaned, 10)
  return Number.isFinite(whole) ? whole : null
}

export function formatRangeSummary(value: [number, number], bounds: Bounds, includeNull: boolean, unit: RangeUnit) {
  const narrowed = value[0] > bounds.min || value[1] < bounds.max
  const range = narrowed ? `${formatRangeValue(value[0], unit)} to ${formatRangeValue(value[1], unit)}` : null
  if (includeNull) return range ?? ""
  return range ? `${range} · known only` : "Known only"
}

// Revenue spans 1M to hundreds of billions, so its slider moves on a log scale.
const LOG_STEPS = 1000
const toSlider = (value: number, bounds: Bounds, log: boolean) => {
  if (!log) return value
  const lo = Math.log(Math.max(bounds.min, 1))
  const hi = Math.log(Math.max(bounds.max, 1))
  if (hi <= lo) return 0
  return Math.round(((Math.log(Math.max(value, 1)) - lo) / (hi - lo)) * LOG_STEPS)
}
const fromSlider = (position: number, bounds: Bounds, log: boolean) => {
  if (!log) return position
  if (position <= 0) return bounds.min
  if (position >= LOG_STEPS) return bounds.max
  const lo = Math.log(Math.max(bounds.min, 1))
  const hi = Math.log(Math.max(bounds.max, 1))
  const raw = Math.exp(lo + (position / LOG_STEPS) * (hi - lo))
  // Round to a readable step for the size: 1M, 10M, 100M...
  const step = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1)
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(raw / step) * step))
}

export type RangePreset = { label: string; range: [number, number] }

interface FilterRangeFieldProps {
  label: string
  value: [number, number]
  bounds: Bounds
  unit: RangeUnit
  onChange: (value: [number, number]) => void
  presets?: RangePreset[]
  includeNull?: boolean
  onIncludeNullChange?: (includeNull: boolean) => void
  includeNullLabel?: string
}

function RangeInput({
  label,
  value,
  unit,
  onCommit,
}: {
  label: string
  value: number
  unit: RangeUnit
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = React.useState<string | null>(null)
  return (
    <input
      aria-label={label}
      inputMode={unit === "money" ? "text" : "numeric"}
      value={draft ?? formatRangeValue(value, unit)}
      onFocus={(event) => {
        setDraft(formatRangeValue(value, unit))
        event.target.select()
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(parseRangeValue(draft, unit))
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className="h-[34px] w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] font-medium tabular-nums transition-shadow focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
    />
  )
}

/**
 * A numeric range in its real unit, with presets and a switch for records
 * that have no value. Typed values are clamped to the data's limits.
 */
export function FilterRangeField({
  label,
  value,
  bounds,
  unit,
  onChange,
  presets = [],
  includeNull,
  onIncludeNullChange,
  includeNullLabel,
}: FilterRangeFieldProps) {
  const log = unit === "money"
  const [lo, hi] = value

  const commit = (end: 0 | 1, typed: number | null) => {
    if (typed === null) return
    const clamped = Math.max(bounds.min, Math.min(bounds.max, typed))
    if (clamped !== typed) {
      toast.info(`${label} data ranges from ${formatRangeValue(bounds.min, unit)} to ${formatRangeValue(bounds.max, unit)}`)
    }
    const next: [number, number] = end === 0 ? [clamped, hi] : [lo, clamped]
    onChange(next[0] <= next[1] ? next : [next[1], next[0]])
  }

  // Presets clipped to what the data covers; ones that fall outside it are dropped.
  const usablePresets = presets
    .map((preset) => ({
      ...preset,
      range: [Math.max(bounds.min, preset.range[0]), Math.min(bounds.max, preset.range[1])] as [number, number],
    }))
    .filter((preset) => preset.range[0] < preset.range[1])

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <RangeInput label={`${label} from`} value={lo} unit={unit} onCommit={(typed) => commit(0, typed)} />
        <span className="text-xs text-muted-foreground">to</span>
        <RangeInput label={`${label} to`} value={hi} unit={unit} onCommit={(typed) => commit(1, typed)} />
      </div>
      <div className="px-1.5">
        <Slider
          value={[toSlider(lo, bounds, log), toSlider(hi, bounds, log)]}
          onValueChange={(positions) =>
            onChange([fromSlider(positions[0], bounds, log), fromSlider(positions[1], bounds, log)])
          }
          min={log ? 0 : bounds.min}
          max={log ? LOG_STEPS : bounds.max}
          step={1}
          aria-label={label}
        />
      </div>
      {usablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {usablePresets.map((preset) => {
            const selected = preset.range[0] === lo && preset.range[1] === hi
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(selected ? [bounds.min, bounds.max] : preset.range)}
                className={cn(
                  "h-6 rounded-full border px-2 text-[11.5px] font-medium transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      )}
      {onIncludeNullChange && includeNull !== undefined && (
        <button
          type="button"
          role="switch"
          aria-checked={includeNull}
          onClick={() => onIncludeNullChange(!includeNull)}
          className="flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <span
            className={cn(
              "relative h-4 w-7 shrink-0 rounded-full transition-colors",
              includeNull ? "bg-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left] duration-150",
                includeNull ? "left-3.5" : "left-0.5"
              )}
            />
          </span>
          {includeNullLabel}
        </button>
      )}
    </>
  )
}
