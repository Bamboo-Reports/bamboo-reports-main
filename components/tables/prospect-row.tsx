import { memo } from "react"
import { Copy, Eye, ExternalLink } from "lucide-react"
import { TableRow, TableCell } from "@/components/ui/table"
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

interface ProspectRowProps {
  prospect: Prospect
  onClick: () => void
}

export const ProspectRow = memo(({ prospect, onClick }: ProspectRowProps) => {
  const copy = useCopyToClipboard()
  const fullName =
    prospect.prospect_full_name ||
    [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ")
  const accountName = prospect.account_global_legal_name || "N/A"
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  const location = [prospect.prospect_city, prospect.prospect_state].filter(Boolean).join(", ") || prospect.prospect_country || ""

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:bg-muted/70"
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onClick()
            }
          }}
          tabIndex={0}
          aria-label={`View prospect details for ${fullName || "prospect"}`}
        >
          <TableCell>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {initials}
              </span>
            </div>
          </TableCell>
          <TableCell className="font-medium max-w-[220px]">
            <div className="min-w-0">
              <div className="truncate" title={fullName || "N/A"}>
                {fullName || "N/A"}
              </div>
              <div className="truncate text-xs font-normal text-muted-foreground" title={accountName}>
                {accountName}
              </div>
            </div>
          </TableCell>
          <TableCell className="max-w-[200px]">
            <div
              className="truncate"
              title={location || "N/A"}
            >
              {location || "N/A"}
            </div>
          </TableCell>
          <TableCell className="max-w-[180px]">
            <div className="truncate" title={prospect.prospect_title || "N/A"}>
              {prospect.prospect_title || "N/A"}
            </div>
          </TableCell>
          <TableCell className="max-w-[180px]">
            <div className="truncate" title={prospect.prospect_department || "N/A"}>
              {prospect.prospect_department || "N/A"}
            </div>
          </TableCell>
        </TableRow>
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
ProspectRow.displayName = "ProspectRow"
