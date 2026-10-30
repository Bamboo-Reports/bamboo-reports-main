"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { RiExternalLinkLine, RiEyeLine, RiGlobalLine } from "@remixicon/react"
import { CompanyLogo } from "@/components/ui/company-logo"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { TruncatedText, createSelectColumn } from "@/components/tables/data-table"
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import type { Center } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { formatCenterLocation } from "@/lib/utils/helpers"

export const getCenterKey = (center: Center) => center.cn_unique_key ?? ""
const getCenterName = (center: Center) => center.center_name || "center"

function CenterNameCell({ center }: { center: Center }) {
  return (
    <div className="flex items-center gap-3">
      <CompanyLogo
        domain={center.center_account_website ?? undefined}
        companyName={center.account_global_legal_name}
        size="sm"
        theme="auto"
      />
      <div className="min-w-0">
        <div className="truncate font-medium" title={center.center_name || "N/A"}>
          {center.center_name || "N/A"}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={center.account_global_legal_name || "N/A"}>
          {center.account_global_legal_name || "N/A"}
        </div>
      </div>
    </div>
  )
}

const columnHelper = createColumnHelper<DataTableFeatures, Center>()

// Column ids match TABLE_COLUMNS.centers and the server's TAB_SORT_COLUMNS keys.
export const centerColumns = columnHelper.columns([
  createSelectColumn<Center>(getCenterName),
  columnHelper.accessor((center) => center.center_name, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre Name" />,
    cell: ({ row }) => <CenterNameCell center={row.original} />,
    sortFn: "text",
    enableHiding: false,
    meta: { className: "w-[260px]" },
  }),
  columnHelper.accessor((center) => formatCenterLocation(center.center_city, center.center_state), {
    id: "location",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[200px]" },
  }),
  columnHelper.accessor((center) => center.center_type, {
    id: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre Type" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[200px]" },
  }),
  columnHelper.accessor((center) => center.center_employees_range, {
    id: "employees",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre Headcount" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[160px]" },
  }),
])

export function CenterRowMenu({ center, onOpen }: { center: Center; onOpen: (center: Center) => void }) {
  return (
    <>
      <ContextMenuItem onClick={() => onOpen(center)}>
        <RiEyeLine className="h-4 w-4" />
        View Details
      </ContextMenuItem>
      {center.center_website && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_website!), "_blank", "noopener,noreferrer")}>
            <RiGlobalLine className="h-4 w-4" />
            Open Website
          </ContextMenuItem>
        </>
      )}
      {center.center_linkedin && (
        <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(center.center_linkedin!), "_blank", "noopener,noreferrer")}>
          <RiExternalLinkLine className="h-4 w-4" />
          Open LinkedIn
        </ContextMenuItem>
      )}
    </>
  )
}
