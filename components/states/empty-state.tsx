import { RiDatabase2Line, RiFileUnknowLine, RiFilterLine, RiSearchLine } from "@remixicon/react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

interface EmptyStateProps {
  type?: "no-data" | "no-results" | "no-filters" | "error"
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  type = "no-results",
  title,
  description,
  action
}: EmptyStateProps) {
  const hasAction = Boolean(action)

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.EMPTY_STATE_SHOWN, {
      empty_state_type: type,
      has_action: hasAction,
    })
  }, [type, hasAction])

  const config = {
    "no-data": {
      icon: RiDatabase2Line,
      defaultTitle: "No data yet",
      defaultDescription: "There is nothing to show right now. Check back later.",
    },
    "no-results": {
      icon: RiFileUnknowLine,
      defaultTitle: "No matches",
      defaultDescription: "Nothing matches the current filters. Try removing one or widening a range.",
    },
    "no-filters": {
      icon: RiFilterLine,
      defaultTitle: "Choose filters to start",
      defaultDescription: "Pick filters in the sidebar to see the matching data.",
    },
    "error": {
      icon: RiSearchLine,
      defaultTitle: "Something went wrong",
      defaultDescription: "The data did not load. Try again.",
    },
  }

  const { icon: Icon, defaultTitle, defaultDescription } = config[type]

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-fade-in">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1">
        {title || defaultTitle}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {description || defaultDescription}
      </p>
      {action && (
        <Button onClick={action.onClick} variant="default">
          {action.label}
        </Button>
      )}
    </div>
  )
}
