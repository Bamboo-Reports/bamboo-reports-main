import { memo } from "react"
import { ArrowUpRight, Eye, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/company-logo"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Center } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
interface CenterGridCardProps {
  center: Center
  onClick: () => void
}

const getStatusDotColor = (status: string | null | undefined) => {
  if (status === "Active Center") return "bg-green-500"
  if (status === "Upcoming") return "bg-yellow-500"
  if (status === "Non Operational") return "bg-red-500"
  return "bg-gray-400"
}

export const CenterGridCard = memo(({ center, onClick }: CenterGridCardProps) => {
  const centerName = center.center_name || "Center"
  const accountName = center.account_global_legal_name || "Account"
  const location = [center.center_city, center.center_state].filter(Boolean).join(", ")
  const statusColor = getStatusDotColor(center.center_status)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card className="h-full">
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <CompanyLogo
                domain={center.center_account_website ?? undefined}
                companyName={accountName}
                size="md"
                theme="auto"
              />
              <div className="min-w-0">
                <h3
                  className="min-w-0 truncate text-base font-semibold leading-snug text-foreground flex items-center gap-2"
                  title={center.center_status ? `${centerName} — ${center.center_status}` : centerName}
                >
                  <span className="truncate">{centerName}</span>
                  <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${statusColor}`} aria-label={center.center_status ?? "Unknown status"} />
                </h3>
                <p
                  className="text-sm text-muted-foreground mt-1 truncate"
                  title={accountName}
                >
                  {accountName}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Center Type</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={center.center_type || "-"}
                >
                  {center.center_type || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Location</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={location || center.center_state || center.center_city || "-"}
                >
                  {location || center.center_state || center.center_city || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Headcount Range</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={center.center_employees_range || "-"}
                >
                  {center.center_employees_range || "-"}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClick}
              className="w-full justify-between bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background"
            >
              View Details
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <Eye className="h-4 w-4" />
          View Details
        </ContextMenuItem>
        {center.center_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_website!), "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4" />
              Open Website
            </ContextMenuItem>
          </>
        )}
        {center.center_linkedin && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_linkedin!), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

CenterGridCard.displayName = "CenterGridCard"
