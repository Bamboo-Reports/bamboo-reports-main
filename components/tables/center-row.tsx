import { memo } from "react"
import { Eye, ExternalLink, Globe, Star, StarOff } from "lucide-react"
import { TableRow, TableCell } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
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
import type { CenterTableColumnKey } from "@/lib/dashboard/table-column-preferences"
interface CenterRowProps {
  center: Center
  onClick: () => void
  visibleColumns: Set<CenterTableColumnKey>
  selectable?: boolean
  isSelected?: boolean
  onSelectChange?: (checked: boolean) => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

export const CenterRow = memo(({ center, onClick, visibleColumns, selectable, isSelected, onSelectChange, isFavorite, onToggleFavorite }: CenterRowProps) => {
  const location = [center.center_city, center.center_state].filter(Boolean).join(", ")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:bg-muted/70 animate-stagger"
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
          {selectable && (
          <TableCell
            className="w-[44px]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={Boolean(isSelected)}
              onCheckedChange={(checked) => onSelectChange?.(checked === true)}
              aria-label={`Select ${center.center_name || "center"}`}
            />
          </TableCell>
          )}
          {visibleColumns.has("name") && (
          <TableCell className="font-medium max-w-[260px]">
            <div className="flex items-center gap-3">
              <CompanyLogo
                domain={center.center_account_website ?? undefined}
                companyName={center.account_global_legal_name}
                size="sm"
                theme="auto"
              />
              <div className="min-w-0">
                <div className="truncate" title={center.center_name || "N/A"}>
                  {center.center_name || "N/A"}
                </div>
                <div
                  className="truncate text-xs font-normal text-muted-foreground"
                  title={center.account_global_legal_name || "N/A"}
                >
                  {center.account_global_legal_name || "N/A"}
                </div>
              </div>
            </div>
          </TableCell>
          )}
          {visibleColumns.has("location") && (
          <TableCell className="max-w-[200px]">
            <div
              className="truncate"
              title={location || "N/A"}
            >
              {location || "N/A"}
            </div>
          </TableCell>
          )}
          {visibleColumns.has("type") && (
          <TableCell className="max-w-[200px]">
            <div className="truncate" title={center.center_type || "N/A"}>
              {center.center_type || "N/A"}
            </div>
          </TableCell>
          )}
          {visibleColumns.has("employees") && (
          <TableCell className="max-w-[160px]">
            <div className="truncate" title={center.center_employees_range || "N/A"}>
              {center.center_employees_range || "N/A"}
            </div>
          </TableCell>
          )}
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <Eye className="h-4 w-4" />
          View Details
        </ContextMenuItem>
        {onToggleFavorite && (
          <ContextMenuItem onClick={onToggleFavorite}>
            {isFavorite ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
            {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          </ContextMenuItem>
        )}
        {center.center_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_website!), "_blank", "noopener,noreferrer")}>
              <Globe className="h-4 w-4" />
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
