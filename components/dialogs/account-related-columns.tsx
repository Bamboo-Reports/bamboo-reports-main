"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { useEffect, useRef, useState } from "react"
import { RiCheckLine, RiLinkedinBoxLine, RiMailLine } from "@remixicon/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/company-logo"
import { TruncatedText } from "@/components/tables/data-table"
import { TruncatedText as TruncatedLine } from "@/components/ui/truncated-text"
import { HintTooltip } from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { Center, Prospect } from "@/lib/types"
import { cn, ensureAbsoluteUrl } from "@/lib/utils"
import { rangeLowerBound } from "@/lib/utils/range-order"
import { formatCenterLocation, formatProspectLocation } from "@/lib/utils/helpers"

/**
 * Columns for the centre and prospect tables inside an account window. They
 * match the dashboard tables but leave out the account name, since every row
 * belongs to the account that is open.
 */

/** "Active Center" reads as "Active"; other statuses as stored. */
export function centerStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown"
  if (status === "Active Center") return "Active"
  return status
}

/** Tint of the dot beside a centre status. */
export function statusDot(status: string | null | undefined): string {
  if (status === "Active Center") return "bg-include"
  if (status === "Upcoming") return "bg-amber-500"
  if (status === "Non Operational") return "bg-exclude"
  return "bg-muted-foreground/50"
}

export const prospectFullName = (p: Prospect) =>
  p.prospect_full_name || [p.prospect_first_name, p.prospect_last_name].filter(Boolean).join(" ")

const centerHelper = createColumnHelper<DataTableFeatures, Center>()

export const accountCenterColumns = centerHelper.columns([
  centerHelper.accessor((center) => center.center_name, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre name" />,
    cell: ({ row }) => {
      const center = row.original
      return (
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo
            domain={center.center_account_website ?? undefined}
            companyName={center.account_global_legal_name}
            size="sm"
            zoom
            theme="auto"
          />
          <TruncatedLine className="font-medium" text={center.center_name || "N/A"} />
        </div>
      )
    },
    sortFn: "text",
    meta: { className: "w-[300px]" },
  }),
  centerHelper.accessor((center) => formatCenterLocation(center.center_city, center.center_state, center.center_country), {
    id: "location",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[200px]" },
  }),
  centerHelper.accessor((center) => center.center_type, {
    id: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre type" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[160px]" },
  }),
  centerHelper.accessor((center) => center.center_employees_range, {
    id: "employees",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Centre headcount" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    // Bands sort by size ("51 - 100" before "1K - 5K"), as in the main centres table.
    sortFn: (a, b, columnId) => {
      const low = rangeLowerBound(String(a.getValue(columnId) ?? ""))
      const high = rangeLowerBound(String(b.getValue(columnId) ?? ""))
      return low === high ? 0 : low < high ? -1 : 1
    },
    meta: { className: "w-[160px]" },
  }),
  centerHelper.accessor((center) => (center.center_inc_year != null ? String(center.center_inc_year) : null), {
    id: "since",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Since" />,
    cell: ({ getValue }) => <span className="tabular-nums">{getValue() ?? "N/A"}</span>,
    sortFn: "text",
    meta: { className: "w-[96px]" },
  }),
  centerHelper.accessor((center) => centerStatusLabel(center.center_status), {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row, getValue }) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot(row.original.center_status))} />
        {getValue()}
      </span>
    ),
    sortFn: "text",
    meta: { className: "w-[140px]" },
  }),
])

function ProspectActions({ prospect }: { prospect: Prospect }) {
  const name = prospectFullName(prospect) || "this prospect"
  const email = prospect.prospect_email?.trim()
  // A tick in place of the icon confirms the copy; only a failure gets a toast.
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
  }, [])
  return (
    <div className="flex justify-end gap-0.5">
      {prospect.prospect_linkedin_url && (
        <HintTooltip label={`${name} on LinkedIn`}>
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={ensureAbsoluteUrl(prospect.prospect_linkedin_url)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} on LinkedIn`}
              onClick={() => captureEvent(ANALYTICS_EVENTS.OUTBOUND_LINK_CLICKED, { entity: "prospect", link_type: "linkedin" })}
            >
              <RiLinkedinBoxLine />
            </a>
          </Button>
        </HintTooltip>
      )}
      {email && (
        <HintTooltip label={copied ? "Copied" : `Copy ${name}'s email`} hint={email}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy ${name}'s email`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(email)
                setCopied(true)
                if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
                copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
              } catch {
                toast.error("Could not copy the email address")
              }
            }}
          >
            {copied ? <RiCheckLine className="text-include" /> : <RiMailLine />}
          </Button>
        </HintTooltip>
      )}
    </div>
  )
}

const prospectHelper = createColumnHelper<DataTableFeatures, Prospect>()

export const accountProspectColumns = prospectHelper.columns([
  prospectHelper.display({
    id: "avatar",
    header: () => <span className="sr-only">Avatar</span>,
    cell: ({ row }) => {
      const initials = prospectFullName(row.original)
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
      return (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <span className="text-sm font-semibold text-foreground">{initials || "?"}</span>
        </div>
      )
    },
    meta: { className: "w-[72px]" },
  }),
  prospectHelper.accessor(prospectFullName, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      const prospect = row.original
      const engaged = (prospect.prospect_engaged ?? "").trim().toLowerCase() === "yes"
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <TruncatedLine className="font-medium" text={prospectFullName(prospect) || "N/A"} />
            {engaged && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-include/[0.08] px-1.5 text-xs font-medium text-include-strong">Engaged</span>
            )}
          </div>
          <TruncatedLine className="text-xs text-muted-foreground" text={prospect.prospect_title || "N/A"} />
        </div>
      )
    },
    sortFn: "text",
    meta: { className: "w-[300px]" },
  }),
  prospectHelper.accessor((prospect) => prospect.prospect_department, {
    id: "department",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[170px]" },
  }),
  prospectHelper.accessor((prospect) => prospect.prospect_level, {
    id: "level",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Level" />,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
    sortFn: "text",
    meta: { className: "w-[140px]" },
  }),
  prospectHelper.accessor(
    (prospect) => formatProspectLocation(prospect.prospect_city, prospect.prospect_state, prospect.prospect_country),
    {
      id: "location",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ getValue }) => <TruncatedText value={getValue()} />,
      sortFn: "text",
      meta: { className: "w-[200px]" },
    }
  ),
  prospectHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Links</span>,
    cell: ({ row }) => <ProspectActions prospect={row.original} />,
    meta: { className: "w-[96px]", stopRowClick: true },
  }),
])
