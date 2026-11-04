import { RiMapLine, RiRefreshLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import type { MapErrorKind } from "@/lib/maps/use-map-recovery"

const COPY: Record<MapErrorKind, { body: string; action: string }> = {
  // The map's workers live for the whole page, so only a page reload restarts them.
  worker: {
    body: "This is usually a brief network problem. Reload the page to try again. Filter changes you haven't saved will reset.",
    action: "Reload page",
  },
  map: {
    body: "This is usually a brief network problem. Your data and filters are unaffected.",
    action: "Reload map",
  },
}

/**
 * Shown when the map cannot recover on its own. Plain words and one action;
 * the technical message goes to analytics and the console, not here.
 */
export function MapErrorState({
  heightClass,
  kind,
  onReload,
}: {
  heightClass: string
  kind: MapErrorKind
  onReload: () => void
}) {
  const copy = COPY[kind]
  return (
    <div className={`flex items-center justify-center ${heightClass} rounded-lg bg-muted`} role="alert">
      <div className="max-w-sm px-6 text-center">
        <RiMapLine className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">The map could not load</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{copy.body}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onReload}>
          <RiRefreshLine />
          {copy.action}
        </Button>
      </div>
    </div>
  )
}
