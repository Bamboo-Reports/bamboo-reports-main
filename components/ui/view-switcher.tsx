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

export function ViewSwitcher<V extends string>({
  value,
  onValueChange,
  options,
  className,
  "data-tour": dataTour,
}: ViewSwitcherProps<V>) {
  // Move the indicator on click, and only render the (often heavy) new view once
  // the slide has painted. Options share one width so the slide only animates
  // transform, which the compositor keeps smooth while that render blocks.
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

  return (
    <Tabs value={activeValue} onValueChange={handleValueChange} className={cn("w-fit", className)} data-tour={dataTour}>
      <TabsList className="grid auto-cols-fr grid-flow-col">
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger key={optionValue} value={optionValue} className="gap-2">
            {icon}
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
