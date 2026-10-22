import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { RiLoader4Line } from "@remixicon/react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// One button system for the whole app. Pick a variant by intent and a size by
// density; avoid overriding height, radius or colour at the call site.
//
// Filled buttons get a 1px inner highlight and a crisp dark bottom edge instead
// of a soft drop shadow, and every button presses down 1px when clicked.
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium leading-none ring-offset-background interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px motion-reduce:active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Main action of a view or dialog. Use one per surface.
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_1px_0_hsl(0_0%_0%/0.22),0_1px_2px_hsl(0_0%_0%/0.08)] hover:bg-primary/90",
        // Irreversible actions (delete, revoke).
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_1px_0_hsl(0_0%_0%/0.22),0_1px_2px_hsl(0_0%_0%/0.08)] hover:bg-destructive/90",
        // Secondary actions beside a primary one (including Cancel/Close in
        // dialog footers) and toolbar controls.
        outline:
          "border border-input bg-card text-foreground shadow-[0_1px_0_hsl(0_0%_0%/0.05)] hover:border-foreground/20 hover:bg-muted",
        // Low-emphasis filled action, for use on cards and panels.
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-foreground/10",
        // Icon buttons, in-row actions and low-emphasis text actions.
        ghost: "hover:bg-muted hover:text-foreground",
        // In-row delete and remove actions.
        "ghost-destructive":
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        link: "text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        xs: "h-7 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg]:size-3.5",
        default: "h-9 gap-2 px-4 text-sm [&_svg]:size-4",
        lg: "h-10 gap-2 px-5 text-sm [&_svg]:size-4",
        "icon-lg": "h-10 w-10 [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-4",
        "icon-xs": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Prepends a spinner and blocks clicks. Hide your own leading icon while loading. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      )
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <RiLoader4Line className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
