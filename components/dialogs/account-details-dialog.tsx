"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
} from "lucide-react"
import { formatRevenueInMillions, parseRevenue } from "@/lib/utils/helpers"
import type { Account } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"

interface AccountDetailsDialogProps {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountDetailsDialog({
  account,
  open,
  onOpenChange,
}: AccountDetailsDialogProps) {
  if (!account) return null

  // Merge city and country for location
  const location = [account.account_hq_city, account.account_hq_country]
    .filter(Boolean)
    .join(", ")

  const InfoRow = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: any
    label: string
    value: string | number | null | undefined
  }) => {
    if (value === null || value === undefined) return null

    const displayValue = typeof value === "number" ? value.toString() : value
    if (displayValue.trim() === "") return null

    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 hover:border-border transition-colors dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="mt-0.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
          <p className="text-sm font-medium break-words whitespace-pre-line">{displayValue}</p>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[85vw] max-h-[90vh] overflow-y-auto glassmorphism-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <CompanyLogo
              domain={account.account_hq_website}
              companyName={account.account_global_legal_name}
              size="md"
              theme="auto"
            />
            <div className="flex-1">
              <div>{account.account_global_legal_name}</div>
              <p className="text-sm font-normal text-muted-foreground mt-1">
                {location || account.account_hq_region}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {/* Company Overview Section */}
          {(account.account_hq_company_type || account.account_hq_stock_ticker || account.account_about || account.account_hq_key_offerings) && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Company Overview
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
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
                label="Center Employees Range"
                value={account.account_center_employees_range}
              />
            </div>
          </div>

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
                  label="NASSCOM GCC Listing Status"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
