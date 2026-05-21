import { memo } from "react"
import { CircleCheck, Eye, ExternalLink, Globe } from "lucide-react"
import { TableRow, TableCell } from "@/components/ui/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Account } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { CompanyLogo } from "@/components/ui/company-logo"
import type { AccountTableColumnKey } from "@/lib/dashboard/table-column-preferences"
interface AccountRowProps {
  account: Account
  onClick: () => void
  visibleColumns: Set<AccountTableColumnKey>
}

export const AccountRow = memo(({ account, onClick, visibleColumns }: AccountRowProps) => {
  const location = [account.account_hq_city, account.account_hq_country]
    .filter(Boolean)
    .join(", ")
  const isNasscomVerified = account.account_nasscom_status?.toLowerCase() === "yes"
  const visibilityNote =
    account.account_visibility === "exclude" && account.account_visibility_note
      ? account.account_visibility_note
      : null
  const showChipRow = isNasscomVerified || visibilityNote !== null
  const accountName = account.account_global_legal_name || "account"

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
          aria-label={`View account details for ${accountName}`}
        >
          {visibleColumns.has("name") && (
          <TableCell className="font-medium max-w-[280px]">
            <div className="flex items-center gap-3">
              <CompanyLogo
                domain={account.account_hq_website ?? undefined}
                companyName={accountName}
                size="sm"
                theme="auto"
              />
              <div className="min-w-0">
                <div className="min-w-0 truncate" title={accountName}>
                  {accountName}
                </div>
                {showChipRow && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {isNasscomVerified && (
                      <div
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#C03430]/15 text-[#C03430]"
                        title="NASSCOM listed"
                      >
                        <CircleCheck className="h-3 w-3" aria-hidden="true" />
                        NASSCOM
                      </div>
                    )}
                    {visibilityNote && (
                      <div
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 max-w-[220px]"
                        title={visibilityNote}
                      >
                        <span className="truncate">{visibilityNote}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
          )}
          {visibleColumns.has("industry") && (
          <TableCell className="max-w-[220px]">
            <div className="truncate" title={account.account_hq_industry || "N/A"}>
              {account.account_hq_industry || "N/A"}
            </div>
          </TableCell>
          )}
          {visibleColumns.has("revenue") && (
          <TableCell className="max-w-[140px]">
            <div className="truncate" title={account.account_hq_revenue_range || "N/A"}>
              {account.account_hq_revenue_range || "N/A"}
            </div>
          </TableCell>
          )}
          {visibleColumns.has("employees") && (
          <TableCell className="max-w-[200px]">
            <div className="truncate" title={account.account_center_employees_range || "N/A"}>
              {account.account_center_employees_range || "N/A"}
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
        {account.account_hq_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_website!), "_blank", "noopener,noreferrer")}>
              <Globe className="h-4 w-4" />
              Open Website
            </ContextMenuItem>
          </>
        )}
        {account.account_hq_linkedin_link && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_linkedin_link!), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})
AccountRow.displayName = "AccountRow"
