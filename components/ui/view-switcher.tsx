"use client"

import * as React from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type SwitcherOption<V extends string> = {
  value: V
  label: React.ReactNode
  icon?: React.ReactNode
}

interface ViewSwitcherProps<V extends string> {
  value: V
  onValueChange: (value: V) => void
  options: SwitcherOption<V>[]
  className?: string
  /** Stretch the options evenly across the full width (e.g. the sidebar). */
  fullWidth?: boolean
  "aria-label"?: string
  "data-tour"?: string
}

export function ViewSwitcher<V extends string>({
  value,
  onValueChange,
  options,
  className,
  fullWidth = false,
  "aria-label": ariaLabel,
  "data-tour": dataTour,
}: ViewSwitcherProps<V>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLSpanElement>(null)

  // A single white highlight slides under the active option. It is positioned
  // by writing to the DOM after layout (no extra render), snaps into place on
  // first paint, and only animates on later changes.
  React.useLayoutEffect(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return

    const place = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      if (!active) {
        indicator.style.opacity = "0"
        return
      }
      indicator.style.width = `${active.offsetWidth}px`
      indicator.style.transform = `translateX(${active.offsetLeft}px)`
      indicator.style.opacity = "1"
    }

    place()
    // Enable the slide only after the first placement, on the next frame.
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = "true"
    })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    observer?.observe(list)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [value, options.length])

  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      className={cn(fullWidth ? "w-full" : "w-fit", className)}
      data-tour={dataTour}
    >
      <TabsList
        ref={listRef}
        aria-label={ariaLabel}
        className={cn("relative gap-2 bg-secondary/80 shadow-sm", fullWidth && "flex w-full")}
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-0 rounded-lg bg-background opacity-0 shadow-sm ring-1 ring-black/10 data-[ready=true]:transition-[transform,width] data-[ready=true]:duration-200 data-[ready=true]:ease-out motion-reduce:!transition-none dark:ring-white/15"
        />
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger
            key={optionValue}
            value={optionValue}
            className={cn(
              "relative z-10 gap-2 border border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:hover:bg-muted/60 data-[state=inactive]:hover:text-foreground",
              fullWidth && "flex-1"
            )}
          >
            {icon}
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
