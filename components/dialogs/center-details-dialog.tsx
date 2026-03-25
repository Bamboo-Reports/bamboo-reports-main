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
  Users,
  Calendar,
  Target,
  Briefcase,
  Phone,
  Globe,
  Code,
  Lightbulb,
  DollarSign,
  UserCog,
  ShoppingCart,
  TrendingUp,
  Headphones,
  MoreHorizontal,
  ExternalLink,
  Linkedin,
} from "lucide-react"
import type { Center, Service } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"
import { InfoRow } from "@/components/ui/info-row"

interface CenterDetailsDialogProps {
  center: Center | null
  services: Service[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CenterDetailsDialog({
  center,
  services,
  open,
  onOpenChange,
}: CenterDetailsDialogProps) {
  if (!center) return null

  // Find services for this center
  const centerServices = services.find(
    (service) => service.cn_unique_key === center.cn_unique_key
  )

  // Status indicator color and glow
  const getStatusColor = (status: string) => {
    if (status === "Active Center") return "bg-green-500"
    if (status === "Upcoming") return "bg-yellow-500"
    if (status === "Non Operational") return "bg-red-500"
    return "bg-gray-500"
  }

  const getStatusGlow = (status: string) => {
    if (status === "Active Center") return "shadow-[0_0_10px_rgba(34,197,94,0.5)]"
    if (status === "Upcoming") return "shadow-[0_0_10px_rgba(234,179,8,0.5)]"
    if (status === "Non Operational") return "shadow-[0_0_10px_rgba(239,68,68,0.5)]"
    return ""
  }

  const isPresent = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return false
    if (typeof value === "number") return true
    const trimmed = value.trim()
    return trimmed !== "" && trimmed !== "-"
  }

  const ServiceSection = ({
    icon: Icon,
    title,
    content,
  }: {
    icon: any
    title: string
    content: string | undefined
  }) => {
    if (!content || content.trim() === "" || content === "-") return null

    return (
      <div className="p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md dark:shadow-[0_10px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-5 w-5 text-primary" />
          <h4 className="font-semibold text-sm">{title}</h4>
        </div>
        <div className="text-sm text-muted-foreground whitespace-pre-line">
          {content}
        </div>
      </div>
    )
  }

  const hasBusinessInfo =
    isPresent(center.center_business_segment) ||
    isPresent(center.center_business_sub_segment) ||
    isPresent(center.center_management_partner) ||
    isPresent(center.center_jv_status) ||
    isPresent(center.center_jv_name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto glassmorphism-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <CompanyLogo
              domain={center.center_account_website}
              companyName={center.account_global_legal_name}
              size="md"
              theme="auto"
            />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span>{center.center_name}</span>
                <div className="flex items-center gap-1.5">
                  {center.center_website && (
                    <a
                      href={center.center_website.startsWith("http") ? center.center_website : `https://${center.center_website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title={center.center_website}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {center.center_linkedin && (
                    <a
                      href={center.center_linkedin.startsWith("http") ? center.center_linkedin : `https://${center.center_linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-[#0A66C2] transition-colors"
                      title="LinkedIn"
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${getStatusColor(center.center_status)} ${getStatusGlow(center.center_status)}`}
                  />
                  <span className="text-sm font-normal text-muted-foreground">
                    {center.center_status}
                  </span>
                </div>
              </div>
              <p className="text-sm font-normal text-muted-foreground mt-1">
                {center.account_global_legal_name}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {/* Center Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Center Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoRow
                icon={Building2}
                label="Center Type"
                value={center.center_type}
              />
              <InfoRow
                icon={Target}
                label="Center Focus"
                value={center.center_focus}
              />
              <InfoRow
                icon={Calendar}
                label="Incorporation Year"
                value={center.center_inc_year}
              />
              <InfoRow
                icon={Users}
                label="Employees"
                value={center.center_employees}
              />
              <InfoRow
                icon={Users}
                label="Center Headcount"
                value={center.center_employees_range}
              />
              <InfoRow
                icon={Phone}
                label="Boardline Number"
                value={center.center_boardline}
              />
              <InfoRow
                icon={Calendar}
                label="End Year"
                value={center.center_end_year}
              />
              <InfoRow
                icon={Calendar}
                label="Announced Year"
                value={center.announced_year}
              />
              <InfoRow
                icon={Calendar}
                label="Announced Month"
                value={center.announced_month}
              />
            </div>
          </div>

          {/* Location Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoRow
                icon={MapPin}
                label="City"
                value={center.center_city}
              />
              <InfoRow
                icon={MapPin}
                label="State"
                value={center.center_state}
              />
              <InfoRow
                icon={Globe}
                label="Country"
                value={center.center_country}
              />
              <InfoRow
                icon={Globe}
                label="Region"
                value={center.center_region}
              />
              <InfoRow
                icon={MapPin}
                label="Zip Code"
                value={center.center_zip_code}
              />
              <InfoRow
                icon={MapPin}
                label="Address"
                value={center.center_address}
              />
            </div>
          </div>

          {/* Business Information Section */}
          {hasBusinessInfo && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Business Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoRow
                  icon={Briefcase}
                  label="Business Segment"
                  value={center.center_business_segment}
                />
                <InfoRow
                  icon={Briefcase}
                  label="Business Sub-Segment"
                  value={center.center_business_sub_segment}
                />
                <InfoRow
                  icon={Users}
                  label="Management Partner"
                  value={center.center_management_partner}
                />
                <InfoRow
                  icon={Briefcase}
                  label="JV Status"
                  value={center.center_jv_status}
                />
                <InfoRow
                  icon={Briefcase}
                  label="JV Name"
                  value={center.center_jv_name}
                />
              </div>
            </div>
          )}

          {/* Services Section */}
          {centerServices && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Services Offered
              </h3>

              {/* Primary Service and Focus Region */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <InfoRow
                  icon={Target}
                  label="Primary Service"
                  value={centerServices.primary_service}
                />
                <InfoRow
                  icon={Globe}
                  label="Focus Region"
                  value={centerServices.focus_region}
                />
              </div>

              {/* Service Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ServiceSection
                  icon={Code}
                  title="IT Services"
                  content={centerServices.service_it}
                />
                <ServiceSection
                  icon={Lightbulb}
                  title="ER&D Services"
                  content={centerServices.service_erd}
                />
                <ServiceSection
                  icon={DollarSign}
                  title="Finance & Accounting"
                  content={centerServices.service_fna}
                />
                <ServiceSection
                  icon={UserCog}
                  title="HR Services"
                  content={centerServices.service_hr}
                />
                <ServiceSection
                  icon={ShoppingCart}
                  title="Procurement"
                  content={centerServices.service_procurement}
                />
                <ServiceSection
                  icon={TrendingUp}
                  title="Sales & Marketing"
                  content={centerServices.service_sales_marketing}
                />
                <ServiceSection
                  icon={Headphones}
                  title="Customer Support"
                  content={centerServices.service_customer_support}
                />
                <ServiceSection
                  icon={MoreHorizontal}
                  title="Other Services"
                  content={centerServices.service_others}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
