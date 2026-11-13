import { cn } from "@/lib/utils"

/**
 * Head types that get their own colour. Each is a soft tint with darker text
 * so it reads as a label, not a status. Any other head type renders as a grey
 * tag, and callers decide whether to show it at all.
 */
const HEAD_TYPE_STYLES: Record<string, string> = {
  "GCC Head": "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  "HR Head": "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  "IT Head": "bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
}

/** Whether a head type has its own colour (and so is worth a tag on cards). */
export function isHighlightedHeadType(headType: string | null | undefined): boolean {
  return Boolean(headType && HEAD_TYPE_STYLES[headType.trim()])
}

export function HeadTypeBadge({ headType, className }: { headType: string; className?: string }) {
  const value = headType.trim()
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-xs font-medium",
        HEAD_TYPE_STYLES[value] ?? "bg-muted font-normal text-muted-foreground",
        className
      )}
    >
      {value}
    </span>
  )
}
