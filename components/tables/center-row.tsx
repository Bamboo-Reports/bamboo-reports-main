import { memo } from "react"
import { Eye, ExternalLink } from "lucide-react"
import { TableRow, TableCell } from "@/components/ui/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Center } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { CompanyLogo } from "@/components/ui/company-logo"
interface CenterRowProps {
  center: Center
  onClick: () => void
}

export const CenterRow = memo(({ center, onClick }: CenterRowProps) => {

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
          aria-label={`View center details for ${center.center_name || "center"}`}
        >
          <TableCell className="font-medium max-w-[260px]">
            <div className="flex items-center gap-3">
              <CompanyLogo
                domain={center.center_account_website ?? undefined}
                companyName={center.account_global_legal_name}
                size="sm"
                theme="auto"
              />
              <div className="min-w-0 truncate" title={center.center_name || "N/A"}>
                {center.center_name || "N/A"}
              </div>
            </div>
          </TableCell>
          <TableCell className="max-w-[200px]">
            <div
              className="truncate"
              title={[center.center_city, center.center_country].filter(Boolean).join(", ") || "N/A"}
            >
              {[center.center_city, center.center_country].filter(Boolean).join(", ") || "N/A"}
            </div>
          </TableCell>
          <TableCell className="max-w-[200px]">
            <div className="truncate" title={center.center_type || "N/A"}>
              {center.center_type || "N/A"}
            </div>
          </TableCell>
          <TableCell className="max-w-[160px]">
            <div className="truncate" title={center.center_employees_range || "N/A"}>
              {center.center_employees_range || "N/A"}
            </div>
          </TableCell>
        </TableRow>
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
CenterRow.displayName = "CenterRow"
