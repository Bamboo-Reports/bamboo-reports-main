"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { RiCheckboxCircleLine, RiExternalLinkLine, RiEyeLine, RiGlobalLine } from "@remixicon/react"
import { CompanyLogo } from "@/components/ui/company-logo"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { HintTooltip } from "@/components/ui/tooltip"
import { TruncatedText as TruncatedSpan } from "@/components/ui/truncated-text"
import { TruncatedText, createSelectColumn } from "@/components/tables/data-table"
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import type { Account } from "@/lib/types"
import { formatRevenueRange } from "@/lib/utils/helpers"
import { ensureAbsoluteUrl } from "@/lib/utils"

export const getAccountKey = (account: Account) => account.account_global_legal_name ?? ""
const getAccountName = (account: Account) => account.account_global_legal_name || "account"

function AccountNameCell({ account }: { account: Account }) {
  const accountName = getAccountName(account)
  const isNasscomVerified = account.account_nasscom_status?.toLowerCase() === "yes"
  const visibilityNote =
    account.account_visibility === "exclude" && account.account_visibility_note
      ? account.account_visibility_note
      : null

  return (
    <div className="flex items-center gap-3">
      <CompanyLogo
        domain={account.account_hq_website ?? undefined}
        companyName={accountName}
        size="sm"
        zoom
        theme="auto"
      />
      <div className="min-w-0">
        <TruncatedSpan text={accountName} className="min-w-0 font-medium" />
        {(isNasscomVerified || visibilityNote) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isNasscomVerified && (
              <HintTooltip label="NASSCOM listed">
                <div
                  role="img"
                  tabIndex={0}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RiCheckboxCircleLine className="h-3 w-3" aria-hidden="true" />
                  NASSCOM
                </div>
              </HintTooltip>
            )}
            {visibilityNote && (
              <HintTooltip label="Visibility note" hint={visibilityNote}>
                <div
                  role="img"
                  tabIndex={0}
                  className="inline-flex h-5 max-w-[220px] items-center gap-1 rounded-md bg-amber-500/10 px-1.5 text-xs font-medium text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
                >
                  <span className="truncate">{visibilityNote}</span>
                </div>
              </HintTooltip>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const columnHelper = createColumnHelper<DataTableFeatures, Account>()

// Column ids match the server's TAB_SORT_COLUMNS keys (lib/dashboard/entity-columns.ts).
export const accountColumns = columnHelper.columns([
  createSelectColumn<Account>(getAccountName),
  columnHelper.accessor((account) => account.account_global_legal_name, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account name" />,
    cell: ({ row }) => <AccountNameCell account={row.original} />,
    sortFn: "text",
    meta: { className: "w-[280px]" },
  }),
  columnHelper.accessor((account) => account.account_hq_industry, {
    id: "industry",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sub industry" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[220px]" },
  }),
  columnHelper.accessor((account) => account.account_hq_revenue_range, {
    id: "revenue",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue range" />,
    cell: ({ getValue }) => <TruncatedText value={formatRevenueRange(getValue()) || null} />,
    sortFn: "text",
    meta: { className: "w-[140px]" },
  }),
  columnHelper.accessor((account) => account.account_center_employees_range, {
    id: "employees",
    header: ({ column }) => <DataTableColumnHeader column={column} title="GCC aggregate headcount (India)" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[200px]" },
  }),
])

export function AccountRowMenu({ account, onOpen }: { account: Account; onOpen: (account: Account) => void }) {
  return (
    <>
      <ContextMenuItem onClick={() => onOpen(account)}>
        <RiEyeLine className="h-4 w-4" />
        View details
      </ContextMenuItem>
      {account.account_hq_website && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_website!), "_blank", "noopener,noreferrer")}>
            <RiGlobalLine className="h-4 w-4" />
            Open website
          </ContextMenuItem>
        </>
      )}
      {account.account_hq_linkedin_link && (
        <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_linkedin_link!), "_blank", "noopener,noreferrer")}>
          <RiExternalLinkLine className="h-4 w-4" />
          Open LinkedIn
        </ContextMenuItem>
      )}
    </>
  )
}
