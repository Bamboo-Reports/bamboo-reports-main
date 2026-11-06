import { memo } from "react"
import { RiArrowRightUpLine, RiExternalLinkLine, RiEyeLine, RiFileCopyLine } from "@remixicon/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { HeadTypeBadge, isHighlightedHeadType } from "@/components/ui/head-type-badge"
import { TruncatedText } from "@/components/ui/truncated-text"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Prospect } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { formatProspectLocation } from "@/lib/utils/helpers"
import { EngagedIcon } from "@/components/ui/engaged-badge"
import { isEngagedProspect } from "@/lib/dashboard/engagements"

interface ProspectGridCardProps {
  prospect: Prospect
  onClick: () => void
}

export const ProspectGridCard = memo(({ prospect, onClick }: ProspectGridCardProps) => {
  const copy = useCopyToClipboard()
  const fullName =
    prospect.prospect_full_name ||
    [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ")
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  const accountName = prospect.account_global_legal_name || "Account"
  const location = formatProspectLocation(prospect.prospect_city, prospect.prospect_state, prospect.prospect_country)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          role="button"
          aria-label={`View details for ${fullName || "prospect"}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
        >
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-foreground">{initials || "?"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="min-w-0 text-base font-medium leading-snug text-foreground">
                  <TruncatedText text={fullName || "Prospect"} />
                </h3>
                <TruncatedText text={accountName} className="text-sm text-muted-foreground mt-1" />
              </div>
              {isHighlightedHeadType(prospect.head_type) && <HeadTypeBadge headType={prospect.head_type!} />}
              {isEngagedProspect(prospect) && <EngagedIcon className="mt-0.5" />}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Location</span>
                <TruncatedText
                  text={location || "-"}
                  className="font-medium text-foreground text-right max-w-[160px]"
                  align="end"
                />
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Department</span>
                <TruncatedText
                  text={prospect.prospect_department || "-"}
                  className="font-medium text-foreground text-right max-w-[160px]"
                  align="end"
                />
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Level</span>
                <TruncatedText
                  text={prospect.prospect_level || "-"}
                  className="font-medium text-foreground text-right max-w-[160px]"
                  align="end"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClick}
              className="w-full justify-between"
            >
              View details
              <RiArrowRightUpLine className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <RiEyeLine className="h-4 w-4" />
          View details
        </ContextMenuItem>
        {prospect.prospect_email && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => copy(prospect.prospect_email!, "Email")}>
              <RiFileCopyLine className="h-4 w-4" />
              Copy email
            </ContextMenuItem>
          </>
        )}
        {prospect.prospect_linkedin_url && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(prospect.prospect_linkedin_url!), "_blank", "noopener,noreferrer")}>
            <RiExternalLinkLine className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

ProspectGridCard.displayName = "ProspectGridCard"
