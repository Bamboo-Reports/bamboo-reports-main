import { RiMailCheckLine } from "@remixicon/react"
import { HintTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Marks a prospect who has engaged with a Bamboo Reports campaign. A plain span rather
 * than <Badge>, which carries hover scale and colour transitions; this tag is
 * static.
 */
export function EngagedBadge({ className }: { className?: string }) {
  return (
    <HintTooltip label="Engaged" hint="Engaged with Bamboo Reports">
      <span
        tabIndex={0}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-transparent bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-emerald-500/15 dark:text-emerald-300",
          className,
        )}
      >
        <RiMailCheckLine className="h-3 w-3" aria-hidden />
        Engaged
      </span>
    </HintTooltip>
  )
}

/** Icon-only form of EngagedBadge, for compact layouts such as contact cards. */
export function EngagedIcon({ className }: { className?: string }) {
  return (
    <HintTooltip label="Engaged with Bamboo Reports">
      <span
        role="img"
        tabIndex={0}
        aria-label="Engaged with Bamboo Reports"
        className={cn("inline-flex shrink-0 rounded-sm text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400", className)}
      >
        <RiMailCheckLine className="h-4 w-4" aria-hidden />
      </span>
    </HintTooltip>
  )
}
