import { BrandPage } from "@/components/brand/brand-page"
import { Card } from "@/components/ui/card"

/**
 * Shown in place of the whole app while NEXT_PUBLIC_MAINTENANCE_MODE is on.
 * Same standalone frame as the auth, error and 404 screens. The only motion
 * is the logo petals settling into place on entry.
 */
export function MaintenancePage() {
  return (
    <BrandPage>
      <Card className="border-border/70 bg-card shadow-sm">
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Down for maintenance
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Bamboo Reports is being updated and will be back shortly. Your saved filters and
            favorites are safe, and no action is needed on your side.
          </p>

          <p className="mt-6 flex items-center gap-2.5 rounded-lg border border-chart-3/30 bg-chart-3/10 px-4 py-3 text-sm text-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-chart-3" aria-hidden="true" />
            Maintenance in progress. Check back in a little while.
          </p>
        </div>
      </Card>
    </BrandPage>
  )
}
