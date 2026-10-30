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
  /** "sm" shows icons only (the label stays as the accessible name and tooltip). */
  size?: "default" | "sm"
  "data-tour"?: string
}

export function ViewSwitcher<V extends string>({
  value,
  onValueChange,
  options,
  className,
  size = "default",
  "data-tour": dataTour,
}: ViewSwitcherProps<V>) {
  const iconOnly = size === "sm"
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as V)} className={cn("w-fit", className)} data-tour={dataTour}>
      <TabsList className={cn("bg-secondary/80 shadow-sm", iconOnly ? "h-8 gap-0.5 rounded-lg p-0.5" : "gap-2")}>
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger
            key={optionValue}
            value={optionValue}
            title={iconOnly && typeof label === "string" ? label : undefined}
            className={cn(
              "gap-2 border border-transparent data-[state=active]:bg-background data-[state=active]:ring-1 data-[state=active]:ring-black/10 dark:data-[state=active]:ring-white/15 data-[state=inactive]:hover:bg-muted/60 data-[state=inactive]:hover:text-foreground",
              iconOnly && "w-8 rounded-md px-0"
            )}
          >
            {icon}
            {iconOnly ? <span className="sr-only">{label}</span> : label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
