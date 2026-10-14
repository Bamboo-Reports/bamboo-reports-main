import { RiMailCheckLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

/**
 * Marks a prospect who has engaged with a Bamboo Reports campaign. A plain span rather
 * than <Badge>, which carries hover scale and colour transitions; this tag is
 * static.
 */
export function EngagedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent bg-emerald-100 px-2.5 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        className,
      )}
      title="Engaged with Bamboo Reports"
    >
      <RiMailCheckLine className="h-3 w-3" aria-hidden />
      Engaged
    </span>
  )
}

/** Icon-only form of EngagedBadge, for compact layouts such as contact cards. */
export function EngagedIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Engaged with Bamboo Reports"
      title="Engaged with Bamboo Reports"
      className={cn("inline-flex shrink-0 text-emerald-600 dark:text-emerald-400", className)}
    >
      <RiMailCheckLine className="h-4 w-4" aria-hidden />
    </span>
  )
}
