"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface TruncatedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The full text. Shown in the element, cut off with an ellipsis if it does not fit. */
  text: string
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
}

/**
 * One line of text, cut off with an ellipsis when it does not fit, with a label
 * tooltip showing it in full. The tooltip only opens when the text is actually
 * cut off. The full text is in the DOM either way, so screen readers already
 * read it; the tooltip adds no description.
 *
 * Tables render hundreds of these, so the tooltip is only mounted once the
 * pointer or keyboard focus reaches text that is cut off; until then this is a
 * plain span.
 */
export const TruncatedText = React.forwardRef<HTMLSpanElement, TruncatedTextProps>(
  ({ text, side = "top", align = "start", className, onPointerEnter, onFocus, ...props }, forwardedRef) => {
    const ref = React.useRef<HTMLSpanElement | null>(null)
    const [armed, setArmed] = React.useState(false)
    const [open, setOpen] = React.useState(false)

    const setRefs = (node: HTMLSpanElement | null) => {
      ref.current = node
      if (typeof forwardedRef === "function") forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    }

    const isCutOff = () => {
      const node = ref.current
      return Boolean(node && node.scrollWidth > node.clientWidth)
    }

    const onOpenChange = (next: boolean) => {
      if (next && !isCutOff()) return
      setOpen(next)
    }

    if (!armed) {
      return (
        <span
          ref={setRefs}
          className={cn("block truncate", className)}
          onPointerEnter={(event) => {
            onPointerEnter?.(event)
            // The tooltip opens on the next pointer move, after its usual delay.
            if (isCutOff()) setArmed(true)
          }}
          onFocus={(event) => {
            onFocus?.(event)
            if (isCutOff()) {
              setArmed(true)
              setOpen(true)
            }
          }}
          {...props}
        >
          {text}
        </span>
      )
    }

    return (
      <Tooltip open={open} onOpenChange={onOpenChange}>
        <TooltipTrigger asChild>
          <span
            ref={setRefs}
            className={cn("block truncate", className)}
            onPointerEnter={onPointerEnter}
            onFocus={onFocus}
            {...props}
          >
            {text}
          </span>
        </TooltipTrigger>
        {/* The full text is already in the element, so the description is blank. */}
        <TooltipContent side={side} align={align} aria-label=" ">
          {text}
        </TooltipContent>
      </Tooltip>
    )
  }
)
TruncatedText.displayName = "TruncatedText"
