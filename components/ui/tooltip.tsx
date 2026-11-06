"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

/**
 * Label tooltips: a control's name (and an optional hint) where the name is
 * hidden or cut off. Opens after 400ms of hover or at once on keyboard focus,
 * the pointer can move onto it, and it closes 100ms after leaving (WCAG 1.4.13).
 */
const TooltipProvider = ({ delayDuration = 400, skipDelayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  // In fullscreen (the map) only that element is on screen, so render there.
  <TooltipPrimitive.Portal container={typeof document === "undefined" ? undefined : ((document.fullscreenElement as HTMLElement | null) ?? undefined)}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "br-tip br-tip-label z-[100]",
        "data-[state=delayed-open]:animate-in data-[state=instant-open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=instant-open]:fade-in-0 duration-100",
        "motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"])

interface HintTooltipProps {
  /** The control's name. Becomes its aria-label, so it is read once, as the name. */
  label: string
  /** An optional second line, announced as the control's description. */
  hint?: string
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
  align?: React.ComponentProps<typeof TooltipPrimitive.Content>["align"]
  children: React.ReactElement
}

/**
 * Wraps one control (an icon button, a status marker) with a label tooltip.
 * The child keeps its aria-label or gets `label` as one. Radix links the open
 * tooltip as the control's description; that description is the hint alone (or
 * blank), so screen readers never read the name twice.
 */
function HintTooltip({ label, hint, side = "top", align = "center", children }: HintTooltipProps) {
  const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>
  // A focusable marker (a status dot, a badge) is not a control. Inside a
  // clickable card, Enter or Space on it must not open the card.
  const isMarker = typeof child.type === "string" && !INTERACTIVE_TAGS.has(child.type)
  const onKeyDown = child.props.onKeyDown as React.KeyboardEventHandler | undefined
  const trigger = React.cloneElement(child, {
    "aria-label": (child.props["aria-label"] as string | undefined) ?? label,
    ...(isMarker && {
      onKeyDown: (event: React.KeyboardEvent) => {
        onKeyDown?.(event)
        if (event.key === "Enter" || event.key === " ") event.stopPropagation()
      },
    }),
  })
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      {/* Radix announces the tooltip as the control's description: the hint alone,
          or a blank (an empty string would make Radix fall back to the visible
          content, reading the name twice). */}
      <TooltipContent side={side} align={align} aria-label={hint || " "}>
        {label}
        {hint && <span className="br-tip-hint">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, HintTooltip }
