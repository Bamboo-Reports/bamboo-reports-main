import { statusDot } from "@/components/dialogs/account-related-columns"
import { HintTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** The dot beside a centre's name, tinted by its status, which the tooltip names. */
export function CenterStatusDot({ status, className }: { status: string | null | undefined; className?: string }) {
  return (
    <HintTooltip label={status ?? "Unknown status"}>
      <span
        role="img"
        tabIndex={0}
        className={cn(
          "inline-flex h-2 w-2 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          statusDot(status),
          className
        )}
      />
    </HintTooltip>
  )
}
