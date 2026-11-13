"use client"

import * as React from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
      {/* Same track and active segment as the sidebar, library and history segmented controls. */}
      <TabsList className="h-8 gap-0.5 rounded-lg border-0 bg-muted/80 p-0.5">
        {options.map(({ value: optionValue, label, icon }) => {
          const trigger = (
            <TabsTrigger
              key={optionValue}
              value={optionValue}
              // The views are rendered outside this switcher, so there is no tab
              // panel to point at; Radix's default aria-controls would dangle.
              aria-controls={undefined}
              className={cn(
                "gap-2 rounded-md px-2.5 text-[13px] data-[state=active]:bg-background data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--border)/0.6)] data-[state=inactive]:hover:bg-transparent data-[state=inactive]:hover:text-foreground",
                iconOnly && "w-7 px-0"
              )}
              asChild={iconOnly}
            >
              {iconOnly ? (
                // The tab is the outer Slot so its data-state (active or inactive) wins over the tooltip's.
                <TooltipTrigger>
                  {icon}
                  <span className="sr-only">{label}</span>
                </TooltipTrigger>
              ) : (
                <>
                  {icon}
                  {label}
                </>
              )}
            </TabsTrigger>
          )
          if (!iconOnly) return trigger
          return (
            <Tooltip key={optionValue}>
              {trigger}
              <TooltipContent aria-label="">{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
