"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { RiExternalLinkLine, RiEyeLine, RiFileCopyLine } from "@remixicon/react"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { TruncatedText, createSelectColumn } from "@/components/tables/data-table"
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { getProspectRecordId } from "@/lib/dashboard/prospect-id"
import type { Prospect } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { formatProspectLocation } from "@/lib/utils/helpers"

export const getProspectKey = getProspectRecordId

const getFullName = (prospect: Prospect) =>
  prospect.prospect_full_name ||
  [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ")

function ProspectAvatar({ prospect }: { prospect: Prospect }) {
  const initials = getFullName(prospect)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <span className="text-sm font-bold text-primary">{initials}</span>
    </div>
  )
}

function ProspectNameCell({ prospect }: { prospect: Prospect }) {
  const fullName = getFullName(prospect) || "N/A"
  const accountName = prospect.account_global_legal_name || "N/A"
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={fullName}>
        {fullName}
      </div>
      <div className="truncate text-xs text-muted-foreground" title={accountName}>
        {accountName}
      </div>
    </div>
  )
}

const columnHelper = createColumnHelper<DataTableFeatures, Prospect>()

// Column ids match the server's TAB_SORT_COLUMNS keys (lib/dashboard/entity-columns.ts).
export const prospectColumns = columnHelper.columns([
  createSelectColumn<Prospect>((prospect) => getFullName(prospect) || "prospect"),
  columnHelper.display({
    id: "avatar",
    header: () => <span className="sr-only">Avatar</span>,
    cell: ({ row }) => <ProspectAvatar prospect={row.original} />,
    meta: { className: "w-[72px]" },
  }),
  columnHelper.accessor(getFullName, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <ProspectNameCell prospect={row.original} />,
    sortFn: "text",
    meta: { className: "w-[220px]" },
  }),
  columnHelper.accessor(
    (prospect) => formatProspectLocation(prospect.prospect_city, prospect.prospect_state, prospect.prospect_country),
    {
      id: "location",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ getValue }) => <TruncatedText value={getValue()} />,
      sortFn: "text",
      meta: { className: "w-[200px]" },
    }
  ),
  columnHelper.accessor((prospect) => prospect.prospect_title, {
    id: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Job Title" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[180px]" },
  }),
  columnHelper.accessor((prospect) => prospect.prospect_department, {
    id: "department",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[180px]" },
  }),
])

export function ProspectRowMenu({ prospect, onOpen }: { prospect: Prospect; onOpen: (prospect: Prospect) => void }) {
  const copy = useCopyToClipboard()
  return (
    <>
      <ContextMenuItem onClick={() => onOpen(prospect)}>
        <RiEyeLine className="h-4 w-4" />
        View Details
      </ContextMenuItem>
      {prospect.prospect_email && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => copy(prospect.prospect_email!, "Email")}>
            <RiFileCopyLine className="h-4 w-4" />
            Copy Email
          </ContextMenuItem>
        </>
      )}
      {prospect.prospect_linkedin_url && (
        <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(prospect.prospect_linkedin_url!), "_blank", "noopener,noreferrer")}>
          <RiExternalLinkLine className="h-4 w-4" />
          Open LinkedIn
        </ContextMenuItem>
      )}
    </>
  )
}
