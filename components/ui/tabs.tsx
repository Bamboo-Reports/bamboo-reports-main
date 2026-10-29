"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

type IndicatorRect = { left: number; width: number }

// Every tab list draws one sliding indicator under the active trigger. It is
// measured from the DOM, so it works for any trigger layout, follows the active
// trigger as Radix flips data-state, and re-measures on resize.
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, forwardedRef) => {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [indicator, setIndicator] = React.useState<IndicatorRect | null>(null)
  // The first placement should land, not slide in from the left edge.
  const [canAnimate, setCanAnimate] = React.useState(false)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node
      if (typeof forwardedRef === "function") forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef]
  )

  const measure = React.useCallback(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!list || !active) {
      setIndicator(null)
      return
    }
    // Sub-pixel rects, since equal-width grid columns land on fractional positions.
    // Divide out any ancestor scale, such as a dialog's zoom-in animation.
    const listRect = list.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const scale = list.offsetWidth ? listRect.width / list.offsetWidth : 1
    const left = (activeRect.left - listRect.left) / scale - list.clientLeft
    const width = activeRect.width / scale
    setIndicator((prev) => (prev && prev.left === left && prev.width === width ? prev : { left, width }))
  }, [])

  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    measure()
    const mutations = new MutationObserver(measure)
    mutations.observe(list, { subtree: true, childList: true, attributeFilter: ["data-state"] })
    const resizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    resizes?.observe(list)
    return () => {
      mutations.disconnect()
      resizes?.disconnect()
    }
  }, [measure])

  React.useEffect(() => {
    if (!indicator || canAnimate) return
    const frame = requestAnimationFrame(() => setCanAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [indicator, canAnimate])

  return (
    <TabsPrimitive.List
      ref={setRefs}
      data-indicator={indicator ? "true" : undefined}
      className={cn(
        "group/tabs relative inline-flex h-10 items-stretch justify-center gap-1 rounded-xl border border-border/70 bg-secondary/70 p-1 text-muted-foreground shadow-[inset_0_1px_2px_hsl(0_0%_0%/0.05)]",
        className
      )}
      {...props}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-1 left-0 rounded-md bg-background shadow-[0_1px_2px_hsl(0_0%_0%/0.08),0_0_0_1px_hsl(0_0%_0%/0.06)] dark:shadow-[0_1px_2px_hsl(0_0%_0%/0.3),0_0_0_1px_hsl(0_0%_100%/0.1)]",
            canAnimate && "transition-[transform,width] duration-200 ease-out will-change-transform motion-reduce:transition-none"
          )}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-10 inline-flex h-full items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium ring-offset-background interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_1px_2px_hsl(0_0%_0%/0.08),0_0_0_1px_hsl(0_0%_0%/0.06)] dark:data-[state=active]:shadow-[0_1px_2px_hsl(0_0%_0%/0.3),0_0_0_1px_hsl(0_0%_100%/0.1)] data-[state=inactive]:hover:bg-background/50 data-[state=inactive]:hover:text-foreground",
      // Once the list's indicator is measured it draws the active surface.
      "group-data-[indicator=true]/tabs:data-[state=active]:bg-transparent group-data-[indicator=true]/tabs:data-[state=active]:shadow-none dark:group-data-[indicator=true]/tabs:data-[state=active]:shadow-none",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 tab-content",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
