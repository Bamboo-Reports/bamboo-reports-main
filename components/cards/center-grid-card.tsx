import { memo } from "react"
import { RiArrowRightUpLine, RiExternalLinkLine, RiEyeLine, RiGlobalLine } from "@remixicon/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/company-logo"
import { TruncatedText } from "@/components/ui/truncated-text"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Center } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { formatCenterLocation } from "@/lib/utils/helpers"
import { CenterStatusDot } from "@/components/ui/center-status-dot"
interface CenterGridCardProps {
  center: Center
  onClick: () => void
}

export const CenterGridCard = memo(({ center, onClick }: CenterGridCardProps) => {
  const centerName = center.center_name || "Centre"
  const accountName = center.account_global_legal_name || "Account"
  const location = formatCenterLocation(center.center_city, center.center_state)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="h-full cursor-pointer select-none transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onClick}
          tabIndex={0}
          role="button"
          aria-label={`View details for ${centerName}`}
          onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
        >
          <CardContent className="p-4 flex flex-col gap-4 h-full">
            <div className="flex items-start gap-3">
              <CompanyLogo
                domain={center.center_account_website ?? undefined}
                companyName={accountName}
                size="md"
                theme="auto"
                zoom
              />
              <div className="min-w-0">
                <h3 className="min-w-0 text-base font-medium leading-snug text-foreground flex items-center gap-2">
                  <TruncatedText text={centerName} className="min-w-0" />
                  <CenterStatusDot status={center.center_status} />
                </h3>
                <TruncatedText text={accountName} className="text-sm text-muted-foreground mt-1" />
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Centre type</span>
                  <TruncatedText
                    text={center.center_type || "-"}
                    className="font-medium text-foreground text-right max-w-[160px]"
                    align="end"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Location</span>
                  <TruncatedText
                    text={location}
                    className="font-medium text-foreground text-right max-w-[160px]"
                    align="end"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Headcount range</span>
                  <TruncatedText
                    text={center.center_employees_range || "-"}
                    className="font-medium text-foreground text-right max-w-[160px]"
                    align="end"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  // The card opens on click too; open once.
                  e.stopPropagation()
                  onClick()
                }}
                className="w-full justify-between"
              >
                View details
                <RiArrowRightUpLine className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <RiEyeLine className="h-4 w-4" />
          View details
        </ContextMenuItem>
        {center.center_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_website!), "_blank", "noopener,noreferrer")}>
              <RiGlobalLine className="h-4 w-4" />
              Open website
            </ContextMenuItem>
          </>
        )}
        {center.center_linkedin && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_linkedin!), "_blank", "noopener,noreferrer")}>
            <RiExternalLinkLine className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

CenterGridCard.displayName = "CenterGridCard"
