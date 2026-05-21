import { memo } from "react"
import { ArrowUpRight, Copy, Eye, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  const accountName = prospect.account_global_legal_name || "Account"
  const location = [prospect.prospect_city, prospect.prospect_state].filter(Boolean).join(", ") || prospect.prospect_country || ""

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="h-full animate-stagger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          role="button"
          aria-label={`View details for ${fullName || "prospect"}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
        >
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">{initials || "?"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="min-w-0 truncate text-base font-semibold leading-snug text-foreground"
                  title={fullName || "Prospect"}
                >
                  {fullName || "Prospect"}
                </h3>
                <p
                  className="text-sm text-muted-foreground mt-1 truncate"
                  title={accountName}
                >
                  {accountName}
                </p>
              </div>
              {prospect.head_type === "GCC Head" && (
                <Badge
                  className="shrink-0 font-normal border-transparent bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-500/15 dark:text-blue-300"
                >
                  GCC Head
                </Badge>
              )}
              {prospect.head_type === "HR Head" && (
                <Badge
                  className="shrink-0 font-normal border-transparent bg-orange-100 text-orange-700 hover:bg-orange-100/80 dark:bg-orange-500/15 dark:text-orange-300"
                >
                  HR Head
                </Badge>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-muted-foreground">Location</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={location || "-"}
                >
                  {location || "-"}
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
                <span className="text-muted-foreground">Level</span>
                <span
                  className="font-medium text-foreground text-right truncate max-w-[160px]"
                  title={prospect.prospect_level || "-"}
                >
                  {prospect.prospect_level || "-"}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onClick}
              className="w-full justify-between border border-border/70 bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
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
