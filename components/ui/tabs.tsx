"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-stretch justify-center rounded-xl border border-border/70 bg-secondary/70 p-1 text-muted-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

/**
 * TabsList with one highlight that slides (200ms ease-out) to the active tab,
 * instead of each tab painting its own background. It watches the tabs'
 * data-state, so it works with any Tabs value or layout (flex or grid), and
 * is re-measured on resize. Positioned by writing to the DOM after layout
 * (no extra render); snaps into place on first paint; no animation with
 * prefers-reduced-motion.
 */
const SlidingTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLSpanElement>(null)
  React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement)

  React.useLayoutEffect(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return

    const place = () => {
      const active = list.querySelector<HTMLElement>(':scope > [role="tab"][data-state="active"]')
      if (!active) {
        indicator.style.opacity = "0"
        return
      }
      indicator.style.width = `${active.offsetWidth}px`
      indicator.style.transform = `translateX(${active.offsetLeft}px)`
      indicator.style.opacity = "1"
    }

    place()
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = "true"
    })
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    resize?.observe(list)
    const mutations = new MutationObserver(place)
    mutations.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutations.disconnect()
    }
  }, [])

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn(
        "relative inline-flex h-10 items-stretch justify-center rounded-xl border border-border/70 bg-secondary/70 p-1 text-muted-foreground shadow-sm",
        "[&>[role=tab]]:relative [&>[role=tab]]:z-10 [&>[role=tab][data-state=active]]:bg-transparent [&>[role=tab][data-state=active]]:shadow-none",
        className
      )}
      {...props}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-0 rounded-button bg-background opacity-0 shadow-sm ring-1 ring-black/10 data-[ready=true]:transition-[transform,width] data-[ready=true]:duration-200 data-[ready=true]:ease-out motion-reduce:!transition-none dark:ring-white/15"
      />
      {children}
    </TabsPrimitive.List>
  )
})
SlidingTabsList.displayName = "SlidingTabsList"

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-full items-center justify-center whitespace-nowrap rounded-button px-3 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-accent/40 interactive transition-all duration-150",
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

export { Tabs, TabsList, SlidingTabsList, TabsTrigger, TabsContent }
