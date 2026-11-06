"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { HeadTypeBadge } from "@/components/ui/head-type-badge"
import { functionalUpdate, useTable, type PaginationState, type SortingState, type Updater } from "@tanstack/react-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { RiArrowRightUpLine, RiCheckLine, RiCloseLine, RiFileCopyLine, RiLinkedinBoxLine, RiMailLine, RiSearchLine } from "@remixicon/react"
import type { Prospect } from "@/lib/types"
import { knownText } from "@/lib/utils/helpers"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { Button } from "@/components/ui/button"
import { HintTooltip } from "@/components/ui/tooltip"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { useAccountRelated } from "@/hooks/use-account-related"
import { RelatedLoadError } from "./related-load-error"
import { Skeleton } from "@/components/ui/skeleton"
import { ProspectEngagementTimeline } from "@/components/dialogs/prospect-engagement-timeline"
import { isEngagedProspect } from "@/lib/dashboard/engagements"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { useRecordHistory } from "@/contexts/record-history-context"
import { prospectHistoryItem } from "@/lib/dashboard/record-history"
import { ensureAbsoluteUrl } from "@/lib/utils"
import { DataLayoutSwitcher, DataTable, DataTablePagination } from "@/components/tables/data-table"
import { dataTableFeatures } from "@/components/tables/data-table-features"
import { ProspectRowMenu } from "@/components/tables/prospect-columns"
import { RECORD_LIST_LAYOUT_STORAGE_KEY, useDataLayoutPreference } from "@/hooks/use-data-layout-preference"
import { FactGroup, FilterMenu, sortByCount, toggleInSet } from "./account-details-parts"
import { accountProspectColumns, prospectFullName } from "./account-related-columns"

interface ProspectDetailsDialogProps {
  prospect: Prospect | null
  allProspects: Prospect[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountOpen?: (accountName: string) => void
  /** Server mode (#249): load company contacts from the related endpoint instead of the allProspects prop. */
  fetchRelated?: boolean
}

/** Same sizes as the account window's lists. */
const RECORD_PAGE_SIZES = [12, 24, 48, 96] as const

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="mb-3 flex items-baseline gap-1.5 text-sm font-medium">
        {title}
        {meta !== undefined && <span className="text-xs font-normal tabular-nums text-muted-foreground">{meta}</span>}
      </h3>
      {children}
    </section>
  )
}

/** A prospect: their activity and colleagues on the left, contact, role and location on the right. */
export function ProspectDetailsDialog({
  prospect,
  allProspects: allProspectsProp,
  open,
  onOpenChange,
  onAccountOpen,
  fetchRelated = false,
}: ProspectDetailsDialogProps) {
  const copy = useCopyToClipboard()
  const [copied, setCopied] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Prospect | null>(prospect)
  const [contactQuery, setContactQuery] = useState("")
  const [headTypeFilter, setHeadTypeFilter] = useState<Set<string>>(new Set())
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: RECORD_PAGE_SIZES[0] })
  const [listLayout, setListLayout] = useDataLayoutPreference(RECORD_LIST_LAYOUT_STORAGE_KEY)

  const resetContacts = () => {
    setContactQuery("")
    setHeadTypeFilter(new Set())
    setDeptFilter(new Set())
    setLevelFilter(new Set())
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }

  useEffect(() => {
    setCurrent(prospect)
    resetContacts()
  }, [prospect])

  const p = current

  // Records the shown prospect, including contacts switched to from More contacts (#310).
  const recordOpened = useRecordHistory()
  useEffect(() => {
    if (open && current) recordOpened(prospectHistoryItem(current))
  }, [open, current, recordOpened])

  const relatedAccount = fetchRelated && open ? (p?.account_global_legal_name ?? "") : ""
  const { data: related, loading: relatedFetching, error: relatedError, retry: retryRelated } = useAccountRelated(relatedAccount)
  const relatedProspects = related?.prospects ?? null
  const relatedLoading = fetchRelated && open && !!p && relatedFetching
  const allProspects = useMemo(() => (fetchRelated ? (relatedProspects ?? []) : allProspectsProp), [fetchRelated, relatedProspects, allProspectsProp])

  const companyContacts = useMemo(
    () =>
      p
        ? allProspects.filter(
            (other) =>
              other.account_global_legal_name === p.account_global_legal_name &&
              (p.ps_unique_key
                ? other.ps_unique_key !== p.ps_unique_key
                : other.prospect_first_name !== p.prospect_first_name || other.prospect_last_name !== p.prospect_last_name)
          )
        : [],
    [p, allProspects]
  )

  // Cascading filters: each list shows the values left once the other two filters apply.
  const matches = (c: Prospect, skip: "head" | "dept" | "level" | null) =>
    (skip === "head" || headTypeFilter.size === 0 || headTypeFilter.has((c.head_type ?? "").trim())) &&
    (skip === "dept" || deptFilter.size === 0 || deptFilter.has((c.prospect_department ?? "").trim())) &&
    (skip === "level" || levelFilter.size === 0 || levelFilter.has((c.prospect_level ?? "").trim()))
  const headTypeOptions = useMemo(
    () => sortByCount(companyContacts.filter((c) => matches(c, "head")).map((c) => (c.head_type ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyContacts, deptFilter, levelFilter]
  )
  const deptOptions = useMemo(
    () => sortByCount(companyContacts.filter((c) => matches(c, "dept")).map((c) => (c.prospect_department ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyContacts, headTypeFilter, levelFilter]
  )
  const levelOptions = useMemo(
    () => sortByCount(companyContacts.filter((c) => matches(c, "level")).map((c) => (c.prospect_level ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyContacts, headTypeFilter, deptFilter]
  )
  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase()
    return companyContacts.filter(
      (c) =>
        matches(c, null) &&
        (!q || [prospectFullName(c), c.prospect_title, c.prospect_department, c.prospect_city].some((v) => (v ?? "").toLowerCase().includes(q)))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyContacts, contactQuery, headTypeFilter, deptFilter, levelFilter])

  useEffect(() => setPagination((prev) => ({ ...prev, pageIndex: 0 })), [contactQuery, headTypeFilter, deptFilter, levelFilter])

  const contactTable = useTable({
    features: dataTableFeatures,
    data: filteredContacts,
    columns: accountProspectColumns,
    getRowId: (contact, index) => `${contact.ps_unique_key ?? "contact"}-${index}`,
    enableMultiSort: false,
    sortDescFirst: false,
    autoResetPageIndex: false,
    state: { sorting, pagination },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = functionalUpdate(updater, sorting)
      captureEvent(ANALYTICS_EVENTS.SORT_CHANGED, {
        entity: "prospect",
        sort_key: next[0]?.id ?? sorting[0]?.id ?? "none",
        sort_direction: next[0] ? (next[0].desc ? "desc" : "asc") : "none",
      })
      setSorting(next)
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = functionalUpdate(updater, pagination)
      if (next.pageIndex !== pagination.pageIndex) {
        captureEvent(ANALYTICS_EVENTS.RECORD_DIALOG_PAGE_CHANGED, { entity: "prospect", list: "contacts", page: next.pageIndex + 1 })
      }
      setPagination(next.pageSize !== pagination.pageSize ? { ...next, pageIndex: 0 } : next)
    },
  })

  const filterHandlers = (filterKey: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => ({
    onToggle: (value: string) => {
      captureEvent(ANALYTICS_EVENTS.RECORD_DIALOG_FILTER_CHANGED, { entity: "prospect", filter_key: filterKey, action: "toggle" })
      toggleInSet(setter, value)
    },
    onClear: () => {
      captureEvent(ANALYTICS_EVENTS.RECORD_DIALOG_FILTER_CHANGED, { entity: "prospect", filter_key: filterKey, action: "clear" })
      setter(new Set())
    },
  })

  /** Shows another contact in this same window, back at the top. */
  const openContact = (contact: Prospect) => {
    captureEvent(ANALYTICS_EVENTS.RELATED_RECORD_OPENED, { parent_entity: "prospect", entity: "prospect" })
    setCurrent(contact)
    resetContacts()
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (!p) return null

  const fullName = prospectFullName(p).trim()
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  const engaged = isEngagedProspect(p)
  const headType = p.head_type?.trim()
  const showHeadType = Boolean(headType && headType.toLowerCase() !== "others")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-3rem)] max-h-none w-[calc(100vw-3rem)] max-w-[1480px] grid-cols-[minmax(0,1fr)] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <DialogDescription className="sr-only">
          Prospect profile: campaign activity, other contacts at the account, contact details, role and location.
        </DialogDescription>

        <div className="shrink-0 border-b px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted text-base font-semibold text-foreground">{initials || "?"}</div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <DialogTitle className="min-w-0 truncate text-xl font-semibold tracking-[-0.015em]">{fullName || "Prospect"}</DialogTitle>
                {engaged && (
                  <span className="rounded-md bg-include/[0.12] px-1.5 text-xs font-medium leading-5 text-include">Engaged</span>
                )}
                {showHeadType && headType && <HeadTypeBadge headType={headType} />}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {p.prospect_title}
                {p.prospect_title && p.account_global_legal_name && " at "}
                {p.account_global_legal_name &&
                  (onAccountOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        captureEvent(ANALYTICS_EVENTS.RELATED_RECORD_OPENED, { parent_entity: "prospect", entity: "account" })
                        onAccountOpen(p.account_global_legal_name)
                      }}
                      className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.account_global_legal_name}
                      <RiArrowRightUpLine className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    p.account_global_legal_name
                  ))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {p.prospect_email && (
                <HintTooltip label="Send email" hint={p.prospect_email}>
                  <Button asChild variant="ghost" size="icon-sm">
                    <a
                      href={`mailto:${p.prospect_email}`}
                      aria-label="Send email"
                      onClick={() => captureEvent(ANALYTICS_EVENTS.CONTACT_EMAIL_CLICKED, { entity: "prospect" })}
                    >
                      <RiMailLine />
                    </a>
                  </Button>
                </HintTooltip>
              )}
              {p.prospect_linkedin_url && (
                <HintTooltip label="View LinkedIn profile">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a
                      href={ensureAbsoluteUrl(p.prospect_linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View LinkedIn profile"
                      onClick={() => captureEvent(ANALYTICS_EVENTS.OUTBOUND_LINK_CLICKED, { entity: "prospect", link_type: "linkedin" })}
                    >
                      <RiLinkedinBoxLine />
                    </a>
                  </Button>
                </HintTooltip>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
                <RiCloseLine />
              </Button>
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 px-6 py-5">
              {open && engaged && p.ps_unique_key ? (
                <div className="mb-7">
                  <ProspectEngagementTimeline psUniqueKey={p.ps_unique_key} />
                </div>
              ) : null}

              {p.account_global_legal_name && (
                <Section title={`More contacts at ${p.account_global_legal_name}`} meta={!relatedLoading && !relatedError ? companyContacts.length.toLocaleString("en-US") : undefined}>
                  {relatedError ? (
                    <RelatedLoadError message="Other contacts at this company could not load." onRetry={retryRelated} />
                  ) : relatedLoading ? (
                    <Skeleton className="h-[320px] w-full rounded-xl" />
                  ) : companyContacts.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No other contacts at this account</p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
                          <RiSearchLine className="h-4 w-4 shrink-0" />
                          <input
                            value={contactQuery}
                            onChange={(event) => setContactQuery(event.target.value)}
                            placeholder={`Search ${companyContacts.length.toLocaleString("en-US")} contacts`}
                            aria-label="Search contacts"
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                          />
                        </label>
                        <FilterMenu label="Department" options={deptOptions} selected={deptFilter} {...filterHandlers("prospect_department", setDeptFilter)} />
                        <FilterMenu label="Level" options={levelOptions} selected={levelFilter} {...filterHandlers("prospect_level", setLevelFilter)} />
                        <FilterMenu label="Head type" options={headTypeOptions} selected={headTypeFilter} {...filterHandlers("prospect_head_type", setHeadTypeFilter)} />
                      </div>
                      <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
                        {listLayout === "table" ? (
                          <DataTable
                            key="table"
                            table={contactTable}
                            onRowOpen={openContact}
                            getRowLabel={(contact) => `Show ${prospectFullName(contact) || "this contact"}`}
                            renderRowMenu={(contact) => <ProspectRowMenu prospect={contact} onOpen={openContact} />}
                          />
                        ) : filteredContacts.length > 0 ? (
                          <div key="grid" className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                            {contactTable.getRowModel().rows.map((row) => (
                              <ProspectGridCard key={row.id} prospect={row.original} onClick={() => openContact(row.original)} />
                            ))}
                          </div>
                        ) : (
                          <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">No contacts match these filters</p>
                        )}
                        <DataTablePagination
                          table={contactTable}
                          totalRows={filteredContacts.length}
                          pageSizeOptions={RECORD_PAGE_SIZES}
                          leading={<DataLayoutSwitcher value={listLayout} onValueChange={setListLayout} />}
                        />
                      </div>
                    </>
                  )}
                </Section>
              )}
            </div>

            <aside className="border-t bg-[color-mix(in_srgb,hsl(var(--muted))_30%,hsl(var(--background)))] px-5 py-5 lg:border-l lg:border-t-0">
              {/* Stays in view while the left side scrolls; leaves out what the header already shows. */}
              <div className="lg:sticky lg:top-5">
                <FactGroup
                  title="Contact"
                  rows={[
                    [
                      "Email",
                      p.prospect_email ? (
                        <span className="inline-flex max-w-full items-center gap-1">
                          <span className="break-all">{p.prospect_email}</span>
                          <HintTooltip label={copied ? "Copied" : "Copy email"}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                captureEvent(ANALYTICS_EVENTS.CONTACT_EMAIL_COPIED, { entity: "prospect" })
                                copy(p.prospect_email!, "Email")
                                setCopied(true)
                                setTimeout(() => setCopied(false), 1500)
                              }}
                              className="shrink-0 text-muted-foreground"
                            >
                              {copied ? <RiCheckLine className="h-3.5 w-3.5 text-include" /> : <RiFileCopyLine className="h-3.5 w-3.5" />}
                            </Button>
                          </HintTooltip>
                        </span>
                      ) : null,
                    ],
                  ]}
                />
                <FactGroup
                  title="Role"
                  rows={[
                    ["Department", p.prospect_department],
                    ["Level", p.prospect_level],
                    ["In company since", p.prospect_in_company_year],
                    ["Current role since", p.prospect_current_year],
                  ]}
                />
                <FactGroup
                  title="Location"
                  rows={[
                    ["Centre", p.center_name],
                    ["City", knownText(p.prospect_city)],
                    ["State", knownText(p.prospect_state)],
                    ["Country", knownText(p.prospect_country)],
                  ]}
                />
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
