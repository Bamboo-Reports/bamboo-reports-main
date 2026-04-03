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
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as V)} className={cn("w-fit", className)} data-tour={dataTour}>
      <TabsList className="gap-2 bg-secondary/80 shadow-sm">
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger
            key={optionValue}
            value={optionValue}
            className="gap-2 border border-transparent data-[state=active]:border-primary/15 data-[state=active]:bg-background"
          >
            {icon}
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
