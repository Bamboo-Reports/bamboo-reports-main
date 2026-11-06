"use client"

import React, { useEffect, useMemo, useState } from "react"
import { functionalUpdate, useTable, type PaginationState, type SortingState, type Updater } from "@tanstack/react-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { CentersMap } from "@/components/maps/centers-map"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RiCloseLine, RiGlobalLine, RiLinkedinBoxLine, RiSearchLine } from "@remixicon/react"
import type { Account, AccountFinancialInfo, Center, Prospect, Service, Tech } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"
import { CenterDetailsDialog } from "./center-details-dialog"
import { ProspectDetailsDialog } from "./prospect-details-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { DataLayoutSwitcher, DataTable, DataTablePagination } from "@/components/tables/data-table"
import { dataTableFeatures } from "@/components/tables/data-table-features"
import { CenterRowMenu } from "@/components/tables/center-columns"
import { ProspectRowMenu } from "@/components/tables/prospect-columns"
import { accountCenterColumns, accountProspectColumns, centerStatusLabel, prospectFullName } from "./account-related-columns"
import { CenterGridCard } from "@/components/cards/center-grid-card"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { RECORD_LIST_LAYOUT_STORAGE_KEY, useDataLayoutPreference } from "@/hooks/use-data-layout-preference"
import { Button } from "@/components/ui/button"
import { HintTooltip } from "@/components/ui/tooltip"
import { TechTreemap } from "@/components/charts/tech-treemap"
import { AnnualRevenueChart } from "@/components/charts/annual-revenue-chart"
import { requestAccountFinancialInfo } from "@/lib/finance/request-client"
import { useAccountRelated } from "@/hooks/use-account-related"
import { RelatedLoadError } from "./related-load-error"
import { useRecordHistory } from "@/contexts/record-history-context"
import { accountHistoryItem } from "@/lib/dashboard/record-history"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { cn } from "@/lib/utils"
import { knownText } from "@/lib/utils/helpers"
import {
  FactChip,
  FactGroup,
  FilterMenu,
  sortByCount,
  StatRow,
  toggleInSet,
} from "./account-details-parts"

function formatCompactNumber(value: number | null): string | null {
  if (value === null) return null
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

const withProtocol = (url: string) => (url.startsWith("http") ? url : `https://${url}`)

/** Rows (or cards) per page in the centre and prospect lists; each fills 2, 3 or 4 grid columns evenly. */
const RECORD_PAGE_SIZES = [12, 24, 48, 96] as const
const PAGE_SIZE = RECORD_PAGE_SIZES[0]
const VISIBLE_OFFERINGS = 8


interface AccountDetailsDialogProps {
  account: Account | null
  centers: Center[]
  prospects: Prospect[]
  services: Service[]
  tech: Tech[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Server mode (#249): load the account's related data from /api/accounts/[name]/related instead of the array props. */
  fetchRelated?: boolean
}

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

export function AccountDetailsDialog({
  account,
  centers: centersProp,
  prospects: prospectsProp,
  services: servicesProp,
  tech: techProp,
  open,
  onOpenChange,
  fetchRelated = false,
}: AccountDetailsDialogProps) {

  const recordOpened = useRecordHistory()
  useEffect(() => {
    if (open && account) recordOpened(accountHistoryItem(account))
  }, [open, account, recordOpened])

  const relatedName = fetchRelated && open ? (account?.account_global_legal_name ?? "") : ""
  const { data: related, loading: relatedFetching, error: relatedError, retry: retryRelated } = useAccountRelated(relatedName)

  const relatedLoading = fetchRelated && open && !!account && relatedFetching
  // Memoized so a null `related` does not hand a fresh [] to the memos below on every render.
  const centers = React.useMemo(() => (fetchRelated ? (related?.centers ?? []) : centersProp), [fetchRelated, related, centersProp])
  const prospects = React.useMemo(() => (fetchRelated ? (related?.prospects ?? []) : prospectsProp), [fetchRelated, related, prospectsProp])
  const services = React.useMemo(() => (fetchRelated ? (related?.services ?? []) : servicesProp), [fetchRelated, related, servicesProp])
  const tech = React.useMemo(() => (fetchRelated ? (related?.tech ?? []) : techProp), [fetchRelated, related, techProp])
  const [activeTab, setActiveTab] = useState("info")
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [isCenterDialogOpen, setIsCenterDialogOpen] = useState(false)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [isProspectDialogOpen, setIsProspectDialogOpen] = useState(false)
  const [financialData, setFinancialData] = useState<AccountFinancialInfo | null>(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [financialError, setFinancialError] = useState<string | null>(null)
  const [financialTickerLoaded, setFinancialTickerLoaded] = useState<string | null>(null)
  const [showAllOfferings, setShowAllOfferings] = useState(false)
  // Table or Grid for the centre and prospect lists, remembered across records.
  const [listLayout, setListLayout] = useDataLayoutPreference(RECORD_LIST_LAYOUT_STORAGE_KEY)

  const [centerQuery, setCenterQuery] = useState("")
  const [centerTypeFilter, setCenterTypeFilter] = useState<Set<string>>(new Set())
  const [centerHeadcountFilter, setCenterHeadcountFilter] = useState<Set<string>>(new Set())
  const [centerStatusFilter, setCenterStatusFilter] = useState<Set<string>>(new Set())
  const [centerSorting, setCenterSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const [centerPagination, setCenterPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  const [prospectQuery, setProspectQuery] = useState("")
  const [prospectHeadTypeFilter, setProspectHeadTypeFilter] = useState<Set<string>>(new Set())
  const [prospectDeptFilter, setProspectDeptFilter] = useState<Set<string>>(new Set())
  const [prospectLevelFilter, setProspectLevelFilter] = useState<Set<string>>(new Set())
  const [prospectSorting, setProspectSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const [prospectPagination, setProspectPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  const accountName = account?.account_global_legal_name ?? ""
  const ticker = account?.account_hq_stock_ticker?.trim() ?? ""

  const accountCenters = React.useMemo(
    () => account
      ? centers.filter((center) => center.account_global_legal_name === account.account_global_legal_name)
      : [],
    [account, centers]
  )
  const accountProspects = React.useMemo(
    () => account
      ? prospects.filter((prospect) => prospect.account_global_legal_name === account.account_global_legal_name)
      : [],
    [account, prospects]
  )
  const accountTech = React.useMemo(
    () => account ? tech.filter((item) => item.account_global_legal_name === account.account_global_legal_name) : [],
    [account, tech]
  )

  // Centre filters cascade: each list shows the values left once the other filters apply.
  const centerMatches = (c: Center, skip: "type" | "headcount" | "status" | null) =>
    (skip === "type" || centerTypeFilter.size === 0 || centerTypeFilter.has((c.center_type ?? "").trim())) &&
    (skip === "headcount" || centerHeadcountFilter.size === 0 || centerHeadcountFilter.has((c.center_employees_range ?? "").trim())) &&
    (skip === "status" || centerStatusFilter.size === 0 || centerStatusFilter.has(centerStatusLabel(c.center_status)))
  const centerTypeOptions = useMemo(
    () => sortByCount(accountCenters.filter((c) => centerMatches(c, "type")).map((c) => (c.center_type ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountCenters, centerHeadcountFilter, centerStatusFilter]
  )
  const centerHeadcountOptions = useMemo(
    () => sortByCount(accountCenters.filter((c) => centerMatches(c, "headcount")).map((c) => (c.center_employees_range ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountCenters, centerTypeFilter, centerStatusFilter]
  )
  const centerStatusOptions = useMemo(
    () => sortByCount(accountCenters.filter((c) => centerMatches(c, "status")).map((c) => centerStatusLabel(c.center_status))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountCenters, centerTypeFilter, centerHeadcountFilter]
  )
  const filteredCenters = useMemo(() => {
    const q = centerQuery.trim().toLowerCase()
    const rows = accountCenters.filter(
      (c) =>
        centerMatches(c, null) &&
        (!q || [c.center_name, c.center_type, c.center_city, c.center_state].some((v) => (v ?? "").toLowerCase().includes(q)))
    )
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCenters, centerQuery, centerTypeFilter, centerHeadcountFilter, centerStatusFilter])

  // Prospect filters cascade the same way (head type, department, level).
  const prospectMatches = (p: Prospect, skip: "head" | "dept" | "level" | null) =>
    (skip === "head" || prospectHeadTypeFilter.size === 0 || prospectHeadTypeFilter.has((p.head_type ?? "").trim())) &&
    (skip === "dept" || prospectDeptFilter.size === 0 || prospectDeptFilter.has((p.prospect_department ?? "").trim())) &&
    (skip === "level" || prospectLevelFilter.size === 0 || prospectLevelFilter.has((p.prospect_level ?? "").trim()))
  const prospectHeadTypeOptions = useMemo(
    () => sortByCount(accountProspects.filter((p) => prospectMatches(p, "head")).map((p) => (p.head_type ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountProspects, prospectDeptFilter, prospectLevelFilter]
  )
  const prospectDeptOptions = useMemo(
    () => sortByCount(accountProspects.filter((p) => prospectMatches(p, "dept")).map((p) => (p.prospect_department ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountProspects, prospectHeadTypeFilter, prospectLevelFilter]
  )
  const prospectLevelOptions = useMemo(
    () => sortByCount(accountProspects.filter((p) => prospectMatches(p, "level")).map((p) => (p.prospect_level ?? "").trim())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountProspects, prospectHeadTypeFilter, prospectDeptFilter]
  )
  const filteredProspects = useMemo(() => {
    const q = prospectQuery.trim().toLowerCase()
    const rows = accountProspects.filter(
      (p) =>
        prospectMatches(p, null) &&
        (!q ||
          [prospectFullName(p), p.prospect_title, p.prospect_department, p.prospect_city].some((v) => (v ?? "").toLowerCase().includes(q)))
    )
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountProspects, prospectQuery, prospectHeadTypeFilter, prospectDeptFilter, prospectLevelFilter])

  // A new search or filter starts from page 1 again.
  useEffect(() => setCenterPagination((p) => ({ ...p, pageIndex: 0 })), [centerQuery, centerTypeFilter, centerHeadcountFilter, centerStatusFilter])
  useEffect(() => setProspectPagination((p) => ({ ...p, pageIndex: 0 })), [prospectQuery, prospectHeadTypeFilter, prospectDeptFilter, prospectLevelFilter])

  // The dashboard's TanStack setup, sorting and paging in the browser. No row
  // selection: ticks here would mix with the dashboard's own selection.
  const makeHandlers = (
    list: "centers" | "prospects",
    sorting: SortingState,
    setSorting: React.Dispatch<React.SetStateAction<SortingState>>,
    pagination: PaginationState,
    setPagination: React.Dispatch<React.SetStateAction<PaginationState>>
  ) => ({
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = functionalUpdate(updater, sorting)
      captureEvent(ANALYTICS_EVENTS.SORT_CHANGED, {
        entity: list === "centers" ? "center" : "prospect",
        sort_key: next[0]?.id ?? sorting[0]?.id ?? "none",
        sort_direction: next[0] ? (next[0].desc ? "desc" : "asc") : "none",
      })
      setSorting(next)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = functionalUpdate(updater, pagination)
      if (next.pageIndex !== pagination.pageIndex) {
        captureEvent(ANALYTICS_EVENTS.RECORD_DIALOG_PAGE_CHANGED, { entity: "account", list, page: next.pageIndex + 1 })
      }
      // A new page size starts from the first page.
      setPagination(next.pageSize !== pagination.pageSize ? { ...next, pageIndex: 0 } : next)
      document.querySelector(`[data-record-list="${list}"] .overflow-auto`)?.scrollTo({ top: 0 })
    },
  })
  const centerTable = useTable({
    features: dataTableFeatures,
    data: filteredCenters,
    columns: accountCenterColumns,
    getRowId: (center, index) => `${center.cn_unique_key ?? "centre"}-${index}`,
    enableMultiSort: false,
    sortDescFirst: false,
    autoResetPageIndex: false,
    state: { sorting: centerSorting, pagination: centerPagination },
    ...makeHandlers("centers", centerSorting, setCenterSorting, centerPagination, setCenterPagination),
  })
  const prospectTable = useTable({
    features: dataTableFeatures,
    data: filteredProspects,
    columns: accountProspectColumns,
    getRowId: (prospect, index) => `${prospect.ps_unique_key ?? "prospect"}-${index}`,
    enableMultiSort: false,
    sortDescFirst: false,
    autoResetPageIndex: false,
    state: { sorting: prospectSorting, pagination: prospectPagination },
    ...makeHandlers("prospects", prospectSorting, setProspectSorting, prospectPagination, setProspectPagination),
  })

  const trackFilter = (filterKey: string, action: "toggle" | "clear") =>
    captureEvent(ANALYTICS_EVENTS.RECORD_DIALOG_FILTER_CHANGED, { entity: "account", filter_key: filterKey, action })
  const filterHandlers = (filterKey: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => ({
    onToggle: (value: string) => {
      trackFilter(filterKey, "toggle")
      toggleInSet(setter, value)
    },
    onClear: () => {
      trackFilter(filterKey, "clear")
      setter(new Set())
    },
  })

  const handleTabChange = (tab: string) => {
    captureEvent(ANALYTICS_EVENTS.RECORD_TAB_CHANGED, { entity: "account", tab, record_id: accountName })
    setActiveTab(tab)
  }

  const trackOutboundLink = (linkType: "website" | "linkedin") =>
    captureEvent(ANALYTICS_EVENTS.OUTBOUND_LINK_CLICKED, { entity: "account", link_type: linkType })

  const handleCenterClick = (center: Center) => {
    captureEvent(ANALYTICS_EVENTS.RELATED_RECORD_OPENED, { parent_entity: "account", entity: "center" })
    setSelectedCenter(center)
    setIsCenterDialogOpen(true)
  }

  const handleProspectClick = (prospect: Prospect) => {
    captureEvent(ANALYTICS_EVENTS.RELATED_RECORD_OPENED, { parent_entity: "account", entity: "prospect" })
    setSelectedProspect(prospect)
    setIsProspectDialogOpen(true)
  }

  useEffect(() => {
    setActiveTab("info")
    setFinancialData(null)
    setFinancialLoading(false)
    setFinancialError(null)
    setFinancialTickerLoaded(null)
    setShowAllOfferings(false)
    setCenterQuery("")
    setCenterTypeFilter(new Set())
    setCenterHeadcountFilter(new Set())
    setCenterStatusFilter(new Set())
    setCenterSorting([{ id: "name", desc: false }])
    setProspectQuery("")
    setProspectHeadTypeFilter(new Set())
    setProspectDeptFilter(new Set())
    setProspectLevelFilter(new Set())
    setProspectSorting([{ id: "name", desc: false }])
  }, [accountName])

  useEffect(() => {
    let cancelled = false

    async function loadFinancialData() {
      if (!open || activeTab !== "info" || !ticker || financialTickerLoaded === ticker) {
        return
      }

      setFinancialLoading(true)
      setFinancialError(null)

      const response = await requestAccountFinancialInfo(ticker)
      if (cancelled) return

      if (response.success && response.data) {
        setFinancialData(response.data)
        setFinancialTickerLoaded(ticker)
        setFinancialError(null)
      } else {
        setFinancialData(null)
        setFinancialTickerLoaded(ticker)
        setFinancialError(response.error || "Unable to fetch financial data")
        captureEvent(ANALYTICS_EVENTS.FINANCIALS_LOAD_FAILED, {
          error_message: response.error || "Unable to fetch financial data",
        })
      }

      setFinancialLoading(false)
    }

    void loadFinancialData()
    return () => {
      cancelled = true
    }
  }, [activeTab, financialTickerLoaded, open, ticker])

  if (!account) return null

  const tickerLabel = ticker ? [financialData?.exchange, ticker].filter(Boolean).join(": ") : null
  const offerings = (account.account_hq_key_offerings ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const shownOfferings = showAllOfferings ? offerings : offerings.slice(0, VISIBLE_OFFERINGS)
  const nasscomListed = (account.account_nasscom_status ?? "").trim().toLowerCase() === "yes"
  const marketSource = [financialData?.inputTicker, financialData?.exchange].filter(Boolean).join(", ") || null
  const showIndia = Boolean(
      account.account_first_center_year || account.years_in_india || account.account_center_employees ||
        account.account_center_employees_range || account.account_primary_city || account.account_hub_structure || accountCenters.length > 0
    )
  const tabTriggerClass =
    "relative h-10 rounded-none bg-transparent px-0 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Fixed height, pinned header and tabs: only the tab content scrolls. */}
        <DialogContent className="flex h-[calc(100dvh-3rem)] max-h-none w-[calc(100vw-3rem)] max-w-[1480px] grid-cols-[minmax(0,1fr)] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
          <DialogDescription className="sr-only">
            Account profile, centres and prospects.
          </DialogDescription>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-6 pt-5">
              <div className="flex items-center gap-3">
                <CompanyLogo domain={account.account_hq_website ?? undefined} companyName={account.account_global_legal_name} size="md" theme="auto" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-xl font-semibold tracking-[-0.015em]">{account.account_global_legal_name}</DialogTitle>
                  {/* Industry, type, ticker, listings and rankings live in the fact sheet; only the Non-GCC flag is called out here. */}
                  {account.account_visibility === "exclude" && (
                    <div className="mt-2">
                      <FactChip tone="warn">Non-GCC</FactChip>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {account.account_hq_website && (
                    <HintTooltip label="Website" hint={account.account_hq_website}>
                      <Button asChild variant="ghost" size="icon-sm">
                        <a href={withProtocol(account.account_hq_website)} target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundLink("website")} aria-label="Website">
                          <RiGlobalLine />
                        </a>
                      </Button>
                    </HintTooltip>
                  )}
                  {account.account_hq_linkedin_link && (
                    <HintTooltip label="LinkedIn">
                      <Button asChild variant="ghost" size="icon-sm">
                        <a href={withProtocol(account.account_hq_linkedin_link)} target="_blank" rel="noopener noreferrer" onClick={() => trackOutboundLink("linkedin")} aria-label="LinkedIn">
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

              <TabsList className="mt-3 h-auto justify-start gap-6 rounded-none border-0 bg-transparent p-0 shadow-none">
                <TabsTrigger value="info" className={tabTriggerClass}>Account info</TabsTrigger>
                {relatedLoading && <Skeleton className="my-3 h-4 w-20" />}
                {relatedLoading && <Skeleton className="my-3 h-4 w-24" />}
                {accountCenters.length > 0 && (
                  <TabsTrigger value="centers" className={tabTriggerClass}>
                    <span className="inline-flex items-baseline gap-1.5">
                      Centres
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">{accountCenters.length.toLocaleString("en-US")}</span>
                    </span>
                  </TabsTrigger>
                )}
                {accountProspects.length > 0 && (
                  <TabsTrigger value="prospects" className={tabTriggerClass}>
                    <span className="inline-flex items-baseline gap-1.5">
                      Prospects
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">{accountProspects.length.toLocaleString("en-US")}</span>
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {relatedError && (
              <div className="shrink-0 px-6 pt-4">
                <RelatedLoadError message="Centres, prospects and tech stack for this account could not load." onRetry={retryRelated} />
              </div>
            )}

            {/* Account info: the profile on the left, the facts you look up on the right. */}
            <TabsContent value="info" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
              <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 px-6 py-5">
                  {account.account_about?.trim() && (
                    <Section title="About">
                      <p className="whitespace-pre-line text-sm leading-relaxed">{account.account_about}</p>
                    </Section>
                  )}

                  {offerings.length > 0 && (
                    <Section title="Key offerings" meta={offerings.length}>
                      <div className="flex flex-wrap gap-1.5">
                        {shownOfferings.map((offering) => (
                          <span key={offering} className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs">
                            {offering}
                          </span>
                        ))}
                        {offerings.length > VISIBLE_OFFERINGS && (
                          <button
                            type="button"
                            onClick={() => setShowAllOfferings((v) => !v)}
                            className="inline-flex h-6 items-center rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showAllOfferings ? "Show fewer" : `+${offerings.length - VISIBLE_OFFERINGS} more`}
                          </button>
                        )}
                      </div>
                    </Section>
                  )}

                  <Section title="Scale and financials">
                    {financialLoading && !financialData ? (
                      <Skeleton className="h-[74px] w-full rounded-xl" />
                    ) : (
                      <StatRow
                        stats={[
                          {
                            label: "Revenue",
                            // Stored in millions; shown in the same compact form as market cap and net profit.
                            value: account.account_hq_revenue != null ? formatCompactNumber(account.account_hq_revenue * 1_000_000) : null,
                            caption: account.account_hq_revenue_range,
                          },
                          { label: "Market cap", value: financialData ? formatCompactNumber(financialData.marketCap) : null, caption: marketSource },
                          { label: "Net profit", value: financialData?.netProfit != null ? formatCompactNumber(financialData.netProfit) : null, caption: marketSource },
                          { label: "Employees", value: account.account_hq_employee_count?.toLocaleString("en-US"), caption: account.account_hq_employee_range },
                        ]}
                      />
                    )}
                    {ticker && !financialError && !financialLoading && financialData && financialData.annualRevenueSeries.length > 0 && (
                      <AnnualRevenueChart series={financialData.annualRevenueSeries} className="mt-3" />
                    )}
                  </Section>

                  {showIndia && (
                    <Section title="India presence">
                      <StatRow
                        stats={[
                          {
                            label: "First centre",
                            value: account.account_first_center_year,
                            caption: account.years_in_india != null ? `${account.years_in_india} years in India` : null,
                          },
                          {
                            label: "Centre employees",
                            value: account.account_center_employees?.toLocaleString("en-US") ?? account.account_center_employees_range,
                            caption: account.account_center_employees != null ? account.account_center_employees_range : null,
                          },
                          { label: "Primary city", value: account.account_primary_city },
                          { label: "Hub structure", value: account.account_hub_structure },
                        ]}
                      />
                      {accountCenters.length > 0 && (
                        <div className="mt-3 h-[320px] overflow-hidden rounded-xl border lg:h-[380px]">
                          <CentersMap centers={accountCenters} heightClass="h-full" showAccountsCount={false} />
                        </div>
                      )}
                    </Section>
                  )}

                  {relatedLoading && (
                    <Section title="Technology stack">
                      <Skeleton className="h-[240px] w-full rounded-xl" />
                    </Section>
                  )}
                  {!relatedLoading && accountTech.length > 0 && (
                    <Section title="Technology stack">
                      <TechTreemap tech={accountTech} />
                    </Section>
                  )}
                </div>

                <aside className="border-t bg-[color-mix(in_srgb,hsl(var(--muted))_30%,hsl(var(--background)))] px-5 py-5 lg:border-l lg:border-t-0">
                  {/* Stays in view while the profile on the left scrolls. */}
                  <div className="lg:sticky lg:top-5">
                  <FactGroup
                    title="Company"
                    rows={[
                      ["Type", account.account_hq_company_type],
                      ["Stock ticker", tickerLabel],
                      ["Industry", account.account_hq_industry],
                      ["Sub industry", account.account_hq_sub_industry],
                      ["Category", account.account_primary_category],
                      ["Nature", account.account_primary_nature],
                    ]}
                  />
                  <FactGroup
                    title="Headquarters"
                    rows={[
                      // Each on its own row; blank or "TBA" is left out.
                      ["City", knownText(account.account_hq_city)],
                      ["State", knownText(account.account_hq_state)],
                      ["Country", knownText(account.account_hq_country)],
                      ["Region", knownText(account.account_hq_region)],
                    ]}
                  />
                  <FactGroup
                    title="Rankings and listings"
                    rows={[
                      ["Forbes 2000", account.account_hq_forbes_2000_rank ? `#${account.account_hq_forbes_2000_rank}` : null],
                      ["Fortune 500", account.account_hq_fortune_500_rank ? `#${account.account_hq_fortune_500_rank}` : null],
                      ["NASSCOM GCC", account.account_nasscom_status ? (nasscomListed ? "Listed" : account.account_nasscom_status) : null],
                    ]}
                  />
                  </div>
                </aside>
              </div>
            </TabsContent>

            {/* Centres: the dashboard's TanStack table (or its grid), with search and filters above and the same pagination below. */}
            {accountCenters.length > 0 && (
              <TabsContent value="centers" data-record-list="centers" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 py-3">
                  <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
                    <RiSearchLine className="h-4 w-4 shrink-0" />
                    <input
                      value={centerQuery}
                      onChange={(event) => setCenterQuery(event.target.value)}
                      placeholder={`Search ${accountCenters.length.toLocaleString("en-US")} centres`}
                      aria-label="Search centres"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </label>
                  <FilterMenu label="Type" options={centerTypeOptions} selected={centerTypeFilter} {...filterHandlers("center_type", setCenterTypeFilter)} />
                  <FilterMenu label="Headcount" options={centerHeadcountOptions} selected={centerHeadcountFilter} {...filterHandlers("center_headcount", setCenterHeadcountFilter)} />
                  <FilterMenu label="Status" options={centerStatusOptions} selected={centerStatusFilter} {...filterHandlers("center_status", setCenterStatusFilter)} />
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {filteredCenters.length === accountCenters.length ? (
                      `${accountCenters.length.toLocaleString("en-US")} centres`
                    ) : (
                      <>
                        <span className="text-foreground">{filteredCenters.length.toLocaleString("en-US")}</span>
                        {` of ${accountCenters.length.toLocaleString("en-US")} centres`}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col border-t">
                  {listLayout === "table" ? (
                    <DataTable
                      key="table"
                      table={centerTable}
                      onRowOpen={handleCenterClick}
                      getRowLabel={(center) => `View centre details for ${center.center_name || "centre"}`}
                      renderRowMenu={(center) => <CenterRowMenu center={center} onOpen={handleCenterClick} />}
                    />
                  ) : (
                    <div key="grid" className="min-h-0 flex-1 overflow-auto">
                      {filteredCenters.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                          {centerTable.getRowModel().rows.map((row) => (
                            <CenterGridCard key={row.id} center={row.original} onClick={() => handleCenterClick(row.original)} />
                          ))}
                        </div>
                      ) : (
                        <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">No centres match these filters</p>
                      )}
                    </div>
                  )}
                  <DataTablePagination
                    table={centerTable}
                    totalRows={filteredCenters.length}
                    pageSizeOptions={RECORD_PAGE_SIZES}
                    leading={<DataLayoutSwitcher value={listLayout} onValueChange={setListLayout} />}
                  />
                </div>
              </TabsContent>
            )}

            {/* Prospects: the same table and pagination, with LinkedIn and email on each row. */}
            {accountProspects.length > 0 && (
              <TabsContent value="prospects" data-record-list="prospects" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 py-3">
                  <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
                    <RiSearchLine className="h-4 w-4 shrink-0" />
                    <input
                      value={prospectQuery}
                      onChange={(event) => setProspectQuery(event.target.value)}
                      placeholder={`Search ${accountProspects.length.toLocaleString("en-US")} prospects`}
                      aria-label="Search prospects"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </label>
                  <FilterMenu label="Department" options={prospectDeptOptions} selected={prospectDeptFilter} {...filterHandlers("prospect_department", setProspectDeptFilter)} />
                  <FilterMenu label="Level" options={prospectLevelOptions} selected={prospectLevelFilter} {...filterHandlers("prospect_level", setProspectLevelFilter)} />
                  <FilterMenu label="Head type" options={prospectHeadTypeOptions} selected={prospectHeadTypeFilter} {...filterHandlers("prospect_head_type", setProspectHeadTypeFilter)} />
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {filteredProspects.length === accountProspects.length ? (
                      `${accountProspects.length.toLocaleString("en-US")} prospects`
                    ) : (
                      <>
                        <span className="text-foreground">{filteredProspects.length.toLocaleString("en-US")}</span>
                        {` of ${accountProspects.length.toLocaleString("en-US")} prospects`}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col border-t">
                  {listLayout === "table" ? (
                    <DataTable
                      key="table"
                      table={prospectTable}
                      onRowOpen={handleProspectClick}
                      getRowLabel={(prospect) => `View prospect details for ${prospectFullName(prospect) || "prospect"}`}
                      renderRowMenu={(prospect) => <ProspectRowMenu prospect={prospect} onOpen={handleProspectClick} />}
                    />
                  ) : (
                    <div key="grid" className="min-h-0 flex-1 overflow-auto">
                      {filteredProspects.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                          {prospectTable.getRowModel().rows.map((row) => (
                            <ProspectGridCard key={row.id} prospect={row.original} onClick={() => handleProspectClick(row.original)} />
                          ))}
                        </div>
                      ) : (
                        <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">No prospects match these filters</p>
                      )}
                    </div>
                  )}
                  <DataTablePagination
                    table={prospectTable}
                    totalRows={filteredProspects.length}
                    pageSizeOptions={RECORD_PAGE_SIZES}
                    leading={<DataLayoutSwitcher value={listLayout} onValueChange={setListLayout} />}
                  />
                </div>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <CenterDetailsDialog
        center={selectedCenter}
        services={services}
        tech={tech}
        open={isCenterDialogOpen}
        onOpenChange={setIsCenterDialogOpen}
        onAccountOpen={() => {
          setIsCenterDialogOpen(false)
          setActiveTab("info")
        }}
      />

      <ProspectDetailsDialog
        prospect={selectedProspect}
        allProspects={prospects}
        open={isProspectDialogOpen}
        onOpenChange={setIsProspectDialogOpen}
        onAccountOpen={() => {
          setIsProspectDialogOpen(false)
          setActiveTab("info")
        }}
      />
    </>
  )
}
