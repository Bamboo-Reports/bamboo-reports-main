import Link from "next/link"
import { BrandPage } from "@/components/brand/brand-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function NotFound() {
  return (
    <BrandPage>
      <Card className="border-border/70 bg-card shadow-sm">
        <div className="p-6 sm:p-8">
          <p className="text-sm font-medium text-muted-foreground">Error 404</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            This page does not exist
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The link may be out of date, or the address may have a typo. The dashboard is still
            where you left it.
          </p>

          <Button asChild className="mt-6 h-10 w-full sm:w-auto">
            <Link href="/">Back to the dashboard</Link>
          </Button>
        </div>
      </Card>
    </BrandPage>
  )
}
