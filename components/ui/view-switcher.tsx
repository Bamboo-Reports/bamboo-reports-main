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
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      className={cn(fullWidth ? "w-full" : "w-fit", className)}
      data-tour={dataTour}
    >
      <TabsList
        aria-label={ariaLabel}
        className={cn("gap-2 bg-secondary/80 shadow-sm", fullWidth && "flex w-full [&>*]:flex-1")}
      >
        {options.map(({ value: optionValue, label, icon }) => (
          <TabsTrigger
            key={optionValue}
            value={optionValue}
            className="gap-2 border border-transparent data-[state=active]:bg-background data-[state=active]:ring-1 data-[state=active]:ring-black/10 dark:data-[state=active]:ring-white/15 data-[state=inactive]:hover:bg-muted/60 data-[state=inactive]:hover:text-foreground"
          >
            {icon}
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
