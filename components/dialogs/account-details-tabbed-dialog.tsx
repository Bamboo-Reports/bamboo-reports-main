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
  Globe,
  Briefcase,
  DollarSign,
  Users,
  Award,
  TrendingUp,
  Calendar,
  Package,
  Info,
  Building,
  UserCircle,
  Layers,
  ExternalLink,
  Linkedin,
} from "lucide-react"
import { formatRevenueInMillions, parseRevenue } from "@/lib/utils/helpers"
import { InfoRow } from "@/components/ui/info-row"
import type { Account, AccountFinancialInfo, Center, Prospect, Service, Tech } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"
import { CenterDetailsDialog } from "./center-details-dialog"
import { ProspectDetailsDialog } from "./prospect-details-dialog"
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
  const accountName = account?.account_global_legal_name ?? ""
  const ticker = account?.account_hq_stock_ticker?.trim() ?? ""

  // Filter centers and prospects for this account
  const accountCenters = account
    ? centers.filter((center) => center.account_global_legal_name === account.account_global_legal_name)
    : []
  const accountProspects = account
    ? prospects.filter((prospect) => prospect.account_global_legal_name === account.account_global_legal_name)
    : []
  const accountTech = account
    ? tech.filter((item) => item.account_global_legal_name === account.account_global_legal_name)
    : []

  // Merge city and country for location
  const location = [account?.account_hq_city, account?.account_hq_country]
    .filter(Boolean)
    .join(", ")

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Account Info
              </TabsTrigger>
              <TabsTrigger value="centers" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Centers
                <Badge variant="secondary" className="ml-1">
                  {accountCenters.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="prospects" className="flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Prospects
                <Badge variant="secondary" className="ml-1">
                  {accountProspects.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Account Info Tab */}
            <TabsContent value="info" className="space-y-6 mt-4">
              {/* Tech Stack & Centers Section */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Tech Stack & Centers
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm overflow-hidden h-[300px] lg:h-[420px]">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground border-b border-border/40">
                        <Layers className="h-4 w-4" />
                        Tech Stack
                      </div>
                      <div className="flex-1 min-h-0">
                        <TechTreemap tech={accountTech} heightClass="h-full" showTitle={false} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm overflow-hidden h-[300px] lg:h-[420px]">
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
                </div>
              </div>

              {/* Company Overview Section */}
              {(account.account_hq_company_type || account.account_hq_stock_ticker || account.account_about || account.account_hq_key_offerings) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Company Overview
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    <InfoRow
                      icon={Building2}
                      label="Account Type"
                      value={account.account_hq_company_type}
                    />
                    <InfoRow
                      icon={Building2}
                      label="HQ Stock Ticker"
                      value={account.account_hq_stock_ticker}
                    />
                    <InfoRow
                      icon={Building2}
                      label="About"
                      value={account.account_about}
                    />
                    <InfoRow
                      icon={Package}
                      label="Key Offerings"
                      value={account.account_hq_key_offerings}
                    />
                  </div>
                </div>
              )}

              {/* Location Section */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoRow
                    icon={MapPin}
                    label="Location"
                    value={location}
                  />
                  <InfoRow
                    icon={Globe}
                    label="Region"
                    value={account.account_hq_region}
                  />
                </div>
              </div>

              {/* Industry Information Section */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Industry Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoRow
                    icon={Briefcase}
                    label="Industry"
                    value={account.account_hq_industry}
                  />
                  <InfoRow
                    icon={Briefcase}
                    label="Sub Industry"
                    value={account.account_hq_sub_industry}
                  />
                  <InfoRow
                    icon={TrendingUp}
                    label="Primary Category"
                    value={account.account_primary_category}
                  />
                  <InfoRow
                    icon={TrendingUp}
                    label="Primary Nature"
                    value={account.account_primary_nature}
                  />
                </div>
              </div>

              {/* Business Metrics Section */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Business Metrics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoRow
                    icon={DollarSign}
                    label="Revenue (in Millions)"
                    value={formatRevenueInMillions(parseRevenue(account.account_hq_revenue))}
                  />
                  <InfoRow
                    icon={DollarSign}
                    label="Revenue Range"
                    value={account.account_hq_revenue_range}
                  />
                  <InfoRow
                    icon={Users}
                    label="Total Employees"
                    value={account.account_hq_employee_count}
                  />
                  <InfoRow
                    icon={Users}
                    label="Employees Range"
                    value={account.account_hq_employee_range}
                  />
                  <InfoRow
                    icon={Users}
                    label="Total Center Employees"
                    value={account.account_center_employees}
                  />
                  <InfoRow
                    icon={Users}
                    label="Aggregate India Headcount"
                    value={account.account_center_employees_range}
                  />
                </div>
              </div>

              {/* Financials Section */}
              {ticker && <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Financials
                </h3>

                {financialLoading ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                    Loading financial data for {ticker}...
                  </div>
                ) : financialError ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium">Unable to load financial data</p>
                    <p className="mt-1">{financialError}</p>
                  </div>
                ) : !financialData ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                    No financial data found for {ticker}.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <InfoRow icon={Building2} label="Stock Ticker" value={financialData.inputTicker} />
                      <InfoRow icon={Building2} label="Exchange" value={financialData.exchange} />
                      <InfoRow icon={DollarSign} label="Market Cap" value={formatCompactNumber(financialData.marketCap)} />
                      <InfoRow
                        icon={TrendingUp}
                        label="Net Profit"
                        value={financialData.netProfit !== null ? formatCompactNumber(financialData.netProfit) : "Not available"}
                      />
                    </div>

                    <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm shadow-sm p-4">
                      <div className="text-sm font-semibold text-muted-foreground mb-3">
                        Annual Revenue (FY)
                      </div>
                      {financialData.annualRevenueSeries.length > 0 ? (
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
                      ) : (
                        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                          Annual revenue trend not available.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>}

              {/* Rankings & Recognition Section */}
              {(account.account_hq_forbes_2000_rank || account.account_hq_fortune_500_rank || account.account_nasscom_status) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Rankings & Recognition
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InfoRow
                      icon={Award}
                      label="Forbes Ranking"
                      value={account.account_hq_forbes_2000_rank}
                    />
                    <InfoRow
                      icon={Award}
                      label="Fortune Ranking"
                      value={account.account_hq_fortune_500_rank}
                    />
                    <InfoRow
                      icon={Award}
                      label="NASSCOM Status"
                      value={account.account_nasscom_status}
                    />
                  </div>
                </div>
              )}

              {/* India Operations Section */}
              {(account.account_first_center_year || account.years_in_india) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    India Operations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InfoRow
                      icon={Calendar}
                      label="First Center Established"
                      value={account.account_first_center_year}
                    />
                    <InfoRow
                      icon={Calendar}
                      label="Years in India"
                      value={account.years_in_india}
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Centers Tab */}
            <TabsContent value="centers" className="mt-4">
              {accountCenters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No centers found for this account</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accountCenters.map((center, index) => (
                    <div
                      key={`${center.cn_unique_key}-${index}`}
                      className="p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 hover:border-border hover:bg-background/60 transition-all cursor-pointer dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:backdrop-blur-md dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                      onClick={() => handleCenterClick(center)}
                    >
                      <div className="flex items-start gap-3">
                        <CompanyLogo
                          domain={center.center_account_website}
                          companyName={center.account_global_legal_name}
                          size="sm"
                          theme="auto"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-base">{center.center_name}</h4>
                            <div
                              className={`h-2 w-2 rounded-full ${getStatusColor(center.center_status)}`}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{center.center_city}, {center.center_state}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Building className="h-3.5 w-3.5" />
                              <span>{center.center_type}</span>
                            </div>
                            {center.center_employees_range &&
                              center.center_employees_range.trim() !== "" && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Users className="h-3.5 w-3.5" />
                                  <span>{center.center_employees_range} employees</span>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Prospects Tab */}
            <TabsContent value="prospects" className="mt-4">
              {accountProspects.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <UserCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No prospects found for this account</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accountProspects.map((prospect, index) => (
                    <div
                      key={`${prospect.prospect_first_name}-${prospect.prospect_last_name}-${index}`}
                      className="p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 hover:border-border hover:bg-background/60 transition-all cursor-pointer dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:backdrop-blur-md dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                      onClick={() => handleProspectClick(prospect)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">
                            {prospect.prospect_first_name?.[0]}{prospect.prospect_last_name?.[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-base mb-1">
                            {prospect.prospect_first_name} {prospect.prospect_last_name}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Briefcase className="h-3.5 w-3.5" />
                              <span className="truncate">{prospect.prospect_title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              <span className="truncate">{prospect.prospect_department}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Award className="h-3.5 w-3.5" />
                              <span className="truncate">{prospect.prospect_level}</span>
                            </div>
                          </div>
                          {prospect.center_name && (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1">
                              <Building className="h-3.5 w-3.5" />
                              <span className="truncate">{prospect.center_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

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

