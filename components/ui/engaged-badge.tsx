import { RiMailCheckLine } from "@remixicon/react"
import { HintTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Marks a prospect who has engaged with a Bamboo Reports campaign, for compact layouts such as contact cards. */
export function EngagedIcon({ className }: { className?: string }) {
  return (
    <HintTooltip label="Engaged with Bamboo Reports">
      <span
        role="img"
        tabIndex={0}
        aria-label="Engaged with Bamboo Reports"
        className={cn("inline-flex shrink-0 rounded-sm text-include focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        <RiMailCheckLine className="h-4 w-4" aria-hidden />
      </span>
    </HintTooltip>
  )
}
