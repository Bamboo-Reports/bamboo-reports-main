"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const THUMB_CLASS =
  "block h-[18px] w-[18px] rounded-full border-2 border-primary bg-background shadow-[0_1px_3px_hsl(0_0%_0%/0.15)] ring-offset-background interactive hover:ring-4 hover:ring-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, min = 0, max = 100, disabled, ...props }, ref) => {
  // Render one thumb per value so a single-value slider doesn't get a stray
  // second thumb (which makes Radix loop on its ref callbacks).
  const source = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]
  const thumbCount = Math.max(1, source.length)

  // A degenerate range (max <= min) makes the thumb position 0/0 = NaN, which
  // can drive an infinite update loop. Keep max strictly above min and disable.
  const hasRange = max > min
  const safeMax = hasRange ? max : min + 1

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      min={min}
      max={safeMax}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled || !hasRange}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, index) => (
        <SliderPrimitive.Thumb key={index} className={THUMB_CLASS} />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
