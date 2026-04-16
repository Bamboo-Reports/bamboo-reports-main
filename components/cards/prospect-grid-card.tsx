import { memo } from "react"
import { ArrowUpRight, Copy, Eye, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  const location = [prospect.prospect_city, prospect.prospect_country].filter(Boolean).join(", ")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card className="h-full">
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{initials || "?"}</span>
              </div>
              <div className="min-w-0">
                <h3
                  className="min-w-0 truncate text-base font-semibold leading-snug text-foreground"
                  title={fullName || "Prospect"}
                >
                  {fullName || "Prospect"}
                </h3>
                <p
                  className="text-sm text-muted-foreground mt-1 truncate"
                  title={location || prospect.prospect_country || "-"}
                >
                  {location || prospect.prospect_country || "-"}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Job Title</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={prospect.prospect_title || "-"}
                >
                  {prospect.prospect_title || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Department</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={prospect.prospect_department || "-"}
                >
                  {prospect.prospect_department || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Head Type</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={prospect.head_type || "-"}
                >
                  {prospect.head_type || "-"}
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
        {prospect.prospect_email && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => copy(prospect.prospect_email!, "Email")}>
              <Copy className="h-4 w-4" />
              Copy Email
            </ContextMenuItem>
          </>
        )}
        {prospect.prospect_linkedin_url && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(prospect.prospect_linkedin_url!), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

ProspectGridCard.displayName = "ProspectGridCard"
