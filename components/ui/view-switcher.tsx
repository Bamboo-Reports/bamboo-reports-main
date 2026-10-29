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
  // transform, which the compositor keeps smooth while that render blocks. The
  // pending value clears in the same transition as the change, so a parent that
  // declines it (an access gate, say) puts the indicator back on `value`.
  const [pendingValue, setPendingValue] = React.useState<V | null>(null)

  const handleValueChange = React.useCallback(
    (next: string) => {
      setPendingValue(next as V)
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          React.startTransition(() => {
            onValueChange(next as V)
            setPendingValue(null)
          })
        )
      )
    },
    [onValueChange]
  )

  return (
    <Tabs value={pendingValue ?? value} onValueChange={handleValueChange} className={cn("w-fit", className)} data-tour={dataTour}>
      <TabsList className="grid auto-cols-fr grid-flow-col">
        {options.map(({ value: optionValue, label, icon }) => (
          // No TabsContent pairs with these triggers (the parent renders the
          // view), so drop Radix's aria-controls rather than point at nothing.
          <TabsTrigger key={optionValue} value={optionValue} aria-controls={undefined} className="gap-2">
            {icon}
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
