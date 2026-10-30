"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { RiCheckboxCircleLine, RiExternalLinkLine, RiEyeLine, RiGlobalLine } from "@remixicon/react"
import { CompanyLogo } from "@/components/ui/company-logo"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { TruncatedText, createSelectColumn } from "@/components/tables/data-table"
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import type { Account } from "@/lib/types"
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
        theme="auto"
      />
      <div className="min-w-0">
        <div className="min-w-0 truncate font-medium" title={accountName}>
          {accountName}
        </div>
        {(isNasscomVerified || visibilityNote) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isNasscomVerified && (
              <div
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#C03430]/15 text-[#C03430]"
                title="NASSCOM listed"
              >
                <RiCheckboxCircleLine className="h-3 w-3" aria-hidden="true" />
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
  )
}

const columnHelper = createColumnHelper<DataTableFeatures, Account>()

// Column ids match TABLE_COLUMNS.accounts and the server's TAB_SORT_COLUMNS keys.
export const accountColumns = columnHelper.columns([
  createSelectColumn<Account>(getAccountName),
  columnHelper.accessor((account) => account.account_global_legal_name, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account Name" />,
    cell: ({ row }) => <AccountNameCell account={row.original} />,
    sortFn: "text",
    enableHiding: false,
    meta: { className: "w-[280px]" },
  }),
  columnHelper.accessor((account) => account.account_hq_industry, {
    id: "industry",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sub Industry" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[220px]" },
  }),
  columnHelper.accessor((account) => account.account_hq_revenue_range, {
    id: "revenue",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue Range" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[140px]" },
  }),
  columnHelper.accessor((account) => account.account_center_employees_range, {
    id: "employees",
    header: ({ column }) => <DataTableColumnHeader column={column} title="GCC Aggregate Headcount (India)" />,
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
        View Details
      </ContextMenuItem>
      {account.account_hq_website && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_website!), "_blank", "noopener,noreferrer")}>
            <RiGlobalLine className="h-4 w-4" />
            Open Website
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
