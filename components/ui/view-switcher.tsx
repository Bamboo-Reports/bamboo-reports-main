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
  "data-tour"?: string
}

type IndicatorRect = { left: number; width: number }

export function ViewSwitcher<V extends string>({
  value,
  onValueChange,
  options,
  className,
  "data-tour": dataTour,
}: ViewSwitcherProps<V>) {
  // Move the indicator on click, and only render the (often heavy) new view once
  // the slide has painted. The slide only animates transform, so the compositor
  // keeps it smooth while that render blocks the main thread.
  const [activeValue, setActiveValue] = React.useState(value)
  React.useEffect(() => {
    setActiveValue(value)
  }, [value])

  const handleValueChange = React.useCallback(
    (next: string) => {
      setActiveValue(next as V)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => React.startTransition(() => onValueChange(next as V)))
      )
    },
    [onValueChange]
  )

  const listRef = React.useRef<HTMLDivElement>(null)
  const triggerRefs = React.useRef(new Map<V, HTMLButtonElement>())
  const [indicator, setIndicator] = React.useState<IndicatorRect | null>(null)
  // The first placement should land, not slide in from the left edge.
  const [canAnimate, setCanAnimate] = React.useState(false)

  const measure = React.useCallback(() => {
    const trigger = triggerRefs.current.get(activeValue)
    if (!trigger) return
    setIndicator((prev) =>
      prev && prev.left === trigger.offsetLeft && prev.width === trigger.offsetWidth
        ? prev
        : { left: trigger.offsetLeft, width: trigger.offsetWidth }
    )
  }, [activeValue])

  React.useLayoutEffect(() => {
    measure()
  }, [measure])

  React.useEffect(() => {
    if (!indicator || canAnimate) return
    const frame = requestAnimationFrame(() => setCanAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [indicator, canAnimate])

  // Labels can change width after fonts load or on resize.
  React.useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    triggerRefs.current.forEach((trigger) => observer.observe(trigger))
    return () => observer.disconnect()
  }, [measure, options])

  return (
    <Tabs value={activeValue} onValueChange={handleValueChange} className={cn("w-fit", className)} data-tour={dataTour}>
      <TabsList ref={listRef} className="relative grid auto-cols-fr grid-flow-col">
        {indicator ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 rounded-md bg-background shadow-[0_1px_2px_hsl(0_0%_0%/0.08),0_0_0_1px_hsl(0_0%_0%/0.06)] dark:shadow-[0_1px_2px_hsl(0_0%_0%/0.3),0_0_0_1px_hsl(0_0%_100%/0.1)]",
              canAnimate && "transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none"
            )}
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
        ) : null}
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger
            key={optionValue}
            ref={(node) => {
              if (node) triggerRefs.current.set(optionValue, node)
              else triggerRefs.current.delete(optionValue)
            }}
            value={optionValue}
            className={cn(
              "relative z-10 gap-2",
              // The sliding indicator draws the active surface once it has been measured.
              indicator &&
                "data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:shadow-none"
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
