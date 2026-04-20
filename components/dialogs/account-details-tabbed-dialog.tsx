"use client"

import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CentersMap } from "@/components/maps/centers-map"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Building2,
  MapPin,
  DollarSign,
  Users,
  Award,
  TrendingUp,
  Calendar,
  Package,
  Building,
  UserCircle,
  Layers,
  ExternalLink,
  Linkedin,
} from "lucide-react"
import { formatRevenueInMillions, parseRevenue } from "@/lib/utils/helpers"
import type { Account, AccountFinancialInfo, Center, Prospect, Service, Tech } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"
import { CenterDetailsDialog } from "./center-details-dialog"
import { ProspectDetailsDialog } from "./prospect-details-dialog"
import { CenterGridCard } from "@/components/cards/center-grid-card"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { Badge } from "@/components/ui/badge"
import { TechTreemap } from "@/components/charts/tech-treemap"
import { getAccountFinancialInfo } from "@/app/actions"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

function formatCompactNumber(value: number | null): string | null {
  if (value === null) return null
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

function formatRevenueAxis(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function QuickFilterGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string
  options: Array<{ name: string; count: number }>
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}) {
  if (options.length === 0) return null
  const totalCount = options.reduce((s, o) => s + o.count, 0)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${selected.size === 0 ? "bg-foreground text-background border-foreground" : "bg-background/40 text-muted-foreground border-border/60 hover:bg-background/60"}`}
      >
        All
        <span className={`text-[10px] tabular-nums ${selected.size === 0 ? "text-background/70" : "text-muted-foreground/70"}`}>{totalCount}</span>
      </button>
      {options.map((opt) => {
        const active = selected.has(opt.name)
        return (
          <button
            key={opt.name}
            type="button"
            onClick={() => onToggle(opt.name)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${active ? "bg-foreground text-background border-foreground" : "bg-background/40 text-foreground border-border/60 hover:bg-background/60"}`}
          >
            {opt.name}
            <span className={`text-[10px] tabular-nums ${active ? "text-background/70" : "text-muted-foreground/70"}`}>{opt.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) return null
  const str = typeof value === "number" ? value.toString() : value
  if (str.trim() === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm border-b border-border/30 last:border-b-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-words">{str}</span>
    </div>
  )
}

function KPITile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number | null | undefined
  caption?: string | null
}) {
  if (value === null || value === undefined) return null
  const str = typeof value === "number" ? value.toString() : value
  if (str.trim() === "") return null
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 backdrop-blur-sm p-4 dark:bg-white/5 dark:border-white/10">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold tracking-tight break-words">{str}</div>
      {caption && caption.trim() !== "" && (
        <div className="text-xs text-muted-foreground mt-1">{caption}</div>
      )}
    </div>
  )
}

function SectionHeader({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

const revenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

interface AccountDetailsDialogProps {
  account: Account | null
  centers: Center[]
  prospects: Prospect[]
  services: Service[]
  tech: Tech[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountDetailsDialog({
  account,
  centers,
  prospects,
  services,
  tech,
  open,
  onOpenChange,
}: AccountDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState("info")
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [isCenterDialogOpen, setIsCenterDialogOpen] = useState(false)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [isProspectDialogOpen, setIsProspectDialogOpen] = useState(false)
  const [financialData, setFinancialData] = useState<AccountFinancialInfo | null>(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [financialError, setFinancialError] = useState<string | null>(null)
  const [financialTickerLoaded, setFinancialTickerLoaded] = useState<string | null>(null)
  const [centerTypeFilter, setCenterTypeFilter] = useState<Set<string>>(new Set())
  const [centerHeadcountFilter, setCenterHeadcountFilter] = useState<Set<string>>(new Set())
  const [prospectDeptFilter, setProspectDeptFilter] = useState<Set<string>>(new Set())
  const [prospectLevelFilter, setProspectLevelFilter] = useState<Set<string>>(new Set())
  const accountName = account?.account_global_legal_name ?? ""
  const ticker = account?.account_hq_stock_ticker?.trim() ?? ""

  // Filter centers and prospects for this account
  const accountCenters = account
    ? centers.filter((center) => center.account_global_legal_name === account.account_global_legal_name)
    : []
  const accountProspects = account
    ? prospects
        .filter((prospect) => prospect.account_global_legal_name === account.account_global_legal_name)
        .sort((a, b) => {
          const nameA = `${a.prospect_first_name ?? ""} ${a.prospect_last_name ?? ""}`.trim().toLowerCase()
          const nameB = `${b.prospect_first_name ?? ""} ${b.prospect_last_name ?? ""}`.trim().toLowerCase()
          return nameA.localeCompare(nameB)
        })
    : []
  const accountTech = account
    ? tech.filter((item) => item.account_global_legal_name === account.account_global_legal_name)
    : []

  // Merge city and country for location
  const location = [account?.account_hq_city, account?.account_hq_country]
    .filter(Boolean)
    .join(", ")

  const sortByCount = (items: string[]): Array<{ name: string; count: number }> => {
    const counts = new Map<string, number>()
    for (const v of items) {
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }

  const centerTypeOptions = React.useMemo(
    () => sortByCount(accountCenters.map((c) => (c.center_type ?? "").trim())),
    [accountCenters],
  )
  const centerHeadcountOptions = React.useMemo(
    () => sortByCount(accountCenters.map((c) => (c.center_employees_range ?? "").trim())),
    [accountCenters],
  )
  const filteredCenters = React.useMemo(() => {
    return accountCenters.filter((c) => {
      if (centerTypeFilter.size > 0 && !centerTypeFilter.has((c.center_type ?? "").trim())) return false
      if (centerHeadcountFilter.size > 0 && !centerHeadcountFilter.has((c.center_employees_range ?? "").trim())) return false
      return true
    })
  }, [accountCenters, centerTypeFilter, centerHeadcountFilter])

  const prospectDeptOptions = React.useMemo(
    () => sortByCount(accountProspects.map((p) => (p.prospect_department ?? "").trim())),
    [accountProspects],
  )
  const prospectLevelOptions = React.useMemo(
    () => sortByCount(accountProspects.map((p) => (p.prospect_level ?? "").trim())),
    [accountProspects],
  )
  const filteredProspects = React.useMemo(() => {
    return accountProspects.filter((p) => {
      if (prospectDeptFilter.size > 0 && !prospectDeptFilter.has((p.prospect_department ?? "").trim())) return false
      if (prospectLevelFilter.size > 0 && !prospectLevelFilter.has((p.prospect_level ?? "").trim())) return false
      return true
    })
  }, [accountProspects, prospectDeptFilter, prospectLevelFilter])

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleCenterClick = (center: Center) => {
    setSelectedCenter(center)
    setIsCenterDialogOpen(true)
  }

  const handleProspectClick = (prospect: Prospect) => {
    setSelectedProspect(prospect)
    setIsProspectDialogOpen(true)
  }

  // Get status indicator color
  const getStatusColor = (status: string) => {
    if (status === "Active Center") return "bg-green-500"
    if (status === "Upcoming") return "bg-yellow-500"
    if (status === "Non Operational") return "bg-red-500"
    return "bg-gray-500"
  }

  useEffect(() => {
    setActiveTab("info")
    setFinancialData(null)
    setFinancialLoading(false)
    setFinancialError(null)
    setFinancialTickerLoaded(null)
    setCenterTypeFilter(new Set())
    setCenterHeadcountFilter(new Set())
    setProspectDeptFilter(new Set())
    setProspectLevelFilter(new Set())
  }, [accountName])

  useEffect(() => {
    let cancelled = false

    async function loadFinancialData() {
      if (!open || activeTab !== "info" || !ticker || financialTickerLoaded === ticker) {
        return
      }

      setFinancialLoading(true)
      setFinancialError(null)

      const response = await getAccountFinancialInfo(ticker)
      if (cancelled) return

      if (response.success && response.data) {
        setFinancialData(response.data)
        setFinancialTickerLoaded(ticker)
        setFinancialError(null)
      } else {
        setFinancialData(null)
        setFinancialTickerLoaded(ticker)
        setFinancialError(response.error || "Unable to fetch financial data")
      }

      setFinancialLoading(false)
    }

    void loadFinancialData()
    return () => {
      cancelled = true
    }
  }, [activeTab, financialTickerLoaded, open, ticker])

  if (!account) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto glassmorphism-dialog">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <CompanyLogo
                domain={account.account_hq_website}
                companyName={account.account_global_legal_name}
                size="md"
                theme="auto"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{account.account_global_legal_name}</span>
                  <div className="flex items-center gap-1.5">
                    {account.account_hq_website && (
                      <a
                        href={account.account_hq_website.startsWith("http") ? account.account_hq_website : `https://${account.account_hq_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={account.account_hq_website}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    {account.account_hq_linkedin_link && (
                      <a
                        href={account.account_hq_linkedin_link.startsWith("http") ? account.account_hq_linkedin_link : `https://${account.account_hq_linkedin_link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-[#0A66C2] transition-colors"
                        title="LinkedIn"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-sm font-normal text-muted-foreground mt-1">
                  {location || account.account_hq_region}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className={`grid w-full ${accountCenters.length > 0 && accountProspects.length > 0 ? "grid-cols-3" : accountCenters.length > 0 || accountProspects.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <TabsTrigger value="info" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Account Info
              </TabsTrigger>
              {accountCenters.length > 0 && (
              <TabsTrigger value="centers" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Centers
                <Badge variant="secondary" className="ml-1">
                  {accountCenters.length}
                </Badge>
              </TabsTrigger>
              )}
              {accountProspects.length > 0 && (
              <TabsTrigger value="prospects" className="flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Prospects
                <Badge variant="secondary" className="ml-1">
                  {accountProspects.length}
                </Badge>
              </TabsTrigger>
              )}
            </TabsList>

            {/* Account Info Tab */}
            <TabsContent value="info" className="space-y-8 mt-4">
              {/* Company Snapshot */}
              <section className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm p-5 lg:p-6 dark:bg-white/5 dark:border-white/10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-5">
                    {account.account_about && account.account_about.trim() !== "" && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">About</p>
                        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{account.account_about}</p>
                      </div>
                    )}
                    {account.account_hq_key_offerings && account.account_hq_key_offerings.trim() !== "" && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          Key Offerings
                        </p>
                        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{account.account_hq_key_offerings}</p>
                      </div>
                    )}
                  </div>
                  <div className="lg:border-l lg:border-border/50 lg:pl-6">
                    <MetaRow label="Account Type" value={account.account_hq_company_type} />
                    <MetaRow label="Stock Ticker" value={account.account_hq_stock_ticker} />
                    <MetaRow label="HQ Location" value={location} />
                    <MetaRow label="Region" value={account.account_hq_region} />
                    <MetaRow label="Industry" value={account.account_hq_industry} />
                    <MetaRow label="Sub Industry" value={account.account_hq_sub_industry} />
                    <MetaRow label="Primary Category" value={account.account_primary_category} />
                    <MetaRow label="Primary Nature" value={account.account_primary_nature} />
                  </div>
                </div>
              </section>

              {/* Scale & Financials */}
              <section className="space-y-4">
                <SectionHeader title="Scale & Financials">
                  {account.account_hq_forbes_2000_rank && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Award className="h-3 w-3" />
                      Forbes #{account.account_hq_forbes_2000_rank}
                    </Badge>
                  )}
                  {account.account_hq_fortune_500_rank && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Award className="h-3 w-3" />
                      Fortune #{account.account_hq_fortune_500_rank}
                    </Badge>
                  )}
                </SectionHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPITile
                    icon={DollarSign}
                    label="Revenue"
                    value={formatRevenueInMillions(parseRevenue(account.account_hq_revenue))}
                    caption={account.account_hq_revenue_range}
                  />
                  <KPITile
                    icon={Users}
                    label="Employees"
                    value={account.account_hq_employee_count}
                    caption={account.account_hq_employee_range}
                  />
                  {financialData && (
                    <>
                      <KPITile
                        icon={TrendingUp}
                        label="Market Cap"
                        value={formatCompactNumber(financialData.marketCap)}
                        caption={[financialData.inputTicker, financialData.exchange].filter(Boolean).join(" • ")}
                      />
                      <KPITile
                        icon={TrendingUp}
                        label="Net Profit"
                        value={financialData.netProfit !== null ? formatCompactNumber(financialData.netProfit) : null}
                        caption={[financialData.inputTicker, financialData.exchange].filter(Boolean).join(" • ")}
                      />
                    </>
                  )}
                </div>

                {ticker && !financialError && !financialLoading && financialData && financialData.annualRevenueSeries.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm p-4 dark:bg-white/5 dark:border-white/10">
                    <div className="text-sm font-semibold text-muted-foreground mb-3">
                      Annual Revenue (FY)
                    </div>
                    <ChartContainer config={revenueChartConfig} className="h-[280px] w-full">
                      <AreaChart
                        data={financialData.annualRevenueSeries}
                        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                      >
                        <defs>
                          <linearGradient id="annualRevenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tickFormatter={formatRevenueAxis}
                          width={72}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              formatter={(value) => formatCompactNumber(value as number) ?? "N/A"}
                            />
                          }
                        />
                        <Area
                          type="natural"
                          dataKey="revenue"
                          fill="url(#annualRevenueFill)"
                          stroke="var(--color-revenue)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                )}
              </section>

              {/* India Presence */}
              {(account.account_first_center_year || account.years_in_india || account.account_center_employees || account.account_center_employees_range || account.account_nasscom_status || accountCenters.length > 0) && (
                <section className="space-y-4">
                  <SectionHeader title="India Presence">
                    {account.account_nasscom_status && (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Award className="h-3 w-3" />
                        NASSCOM: {account.account_nasscom_status}
                      </Badge>
                    )}
                  </SectionHeader>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPITile icon={Calendar} label="First Center" value={account.account_first_center_year} />
                    <KPITile icon={Calendar} label="Years in India" value={account.years_in_india} />
                    <KPITile icon={Users} label="Center Employees" value={account.account_center_employees} />
                    <KPITile icon={Users} label="GCC Headcount (India)" value={account.account_center_employees_range} />
                  </div>
                  {accountCenters.length > 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm overflow-hidden h-[360px] lg:h-[420px] dark:bg-white/5 dark:border-white/10">
                      <div className="flex h-full flex-col">
                        <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground border-b border-border/40">
                          <MapPin className="h-4 w-4" />
                          Centers Map
                        </div>
                        <div className="flex-1 min-h-0">
                          <CentersMap centers={accountCenters} heightClass="h-full" />
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Technology Stack */}
              {accountTech.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader title="Technology Stack" />
                  <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm overflow-hidden h-[360px] lg:h-[420px] dark:bg-white/5 dark:border-white/10">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground border-b border-border/40">
                        <Layers className="h-4 w-4" />
                        Detected Stack
                      </div>
                      <div className="flex-1 min-h-0">
                        <TechTreemap tech={accountTech} heightClass="h-full" showTitle={false} />
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </TabsContent>

            {/* Centers Tab */}
            {accountCenters.length > 0 && (
            <TabsContent value="centers" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <QuickFilterGroup
                    label="Center Type"
                    options={centerTypeOptions}
                    selected={centerTypeFilter}
                    onToggle={(v) => toggleInSet(setCenterTypeFilter, v)}
                    onClear={() => setCenterTypeFilter(new Set())}
                  />
                  <QuickFilterGroup
                    label="Headcount Range"
                    options={centerHeadcountOptions}
                    selected={centerHeadcountFilter}
                    onToggle={(v) => toggleInSet(setCenterHeadcountFilter, v)}
                    onClear={() => setCenterHeadcountFilter(new Set())}
                  />
                </div>
                {filteredCenters.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCenters.map((center, index) => (
                      <CenterGridCard
                        key={`${center.cn_unique_key}-${index}`}
                        center={center}
                        onClick={() => handleCenterClick(center)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">No centers match the selected filters.</p>
                )}
            </TabsContent>
            )}

            {/* Prospects Tab */}
            {accountProspects.length > 0 && (
            <TabsContent value="prospects" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <QuickFilterGroup
                    label="Department"
                    options={prospectDeptOptions}
                    selected={prospectDeptFilter}
                    onToggle={(v) => toggleInSet(setProspectDeptFilter, v)}
                    onClear={() => setProspectDeptFilter(new Set())}
                  />
                  <QuickFilterGroup
                    label="Level"
                    options={prospectLevelOptions}
                    selected={prospectLevelFilter}
                    onToggle={(v) => toggleInSet(setProspectLevelFilter, v)}
                    onClear={() => setProspectLevelFilter(new Set())}
                  />
                </div>
                {filteredProspects.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProspects.map((prospect, index) => (
                      <ProspectGridCard
                        key={`${prospect.prospect_first_name}-${prospect.prospect_last_name}-${index}`}
                        prospect={prospect}
                        onClick={() => handleProspectClick(prospect)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">No prospects match the selected filters.</p>
                )}
            </TabsContent>
            )}

          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Center Details Dialog */}
      <CenterDetailsDialog
        center={selectedCenter}
        services={services}
        open={isCenterDialogOpen}
        onOpenChange={setIsCenterDialogOpen}
      />

      {/* Prospect Details Dialog */}
      <ProspectDetailsDialog
        prospect={selectedProspect}
        open={isProspectDialogOpen}
        onOpenChange={setIsProspectDialogOpen}
      />
    </>
  )
}
