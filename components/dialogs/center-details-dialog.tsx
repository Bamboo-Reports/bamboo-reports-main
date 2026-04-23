"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Calendar,
  Code,
  DollarSign,
  ExternalLink,
  Headphones,
  Lightbulb,
  Linkedin,
  MoreHorizontal,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react"
import type { Center, Service } from "@/lib/types"
import { CompanyLogo } from "@/components/ui/company-logo"
import { DialogBreadcrumb } from "@/components/ui/dialog-breadcrumb"

interface CenterDetailsDialogProps {
  center: Center | null
  services: Service[]
  open: boolean
  onOpenChange: (open: boolean) => void
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
  const isEmpty =
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  if (isEmpty) return null
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
      {caption ? <div className="mt-0.5 text-[11px] text-muted-foreground">{caption}</div> : null}
    </div>
  )
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function CenterDetailsDialog({
  center,
  services,
  open,
  onOpenChange,
}: CenterDetailsDialogProps) {
  if (!center) return null

  const centerServices = services.find(
    (service) => service.cn_unique_key === center.cn_unique_key,
  )

  const getStatusColor = (status: string) => {
    if (status === "Active Center") return "bg-emerald-500"
    if (status === "Upcoming") return "bg-amber-500"
    if (status === "Non Operational") return "bg-destructive"
    return "bg-muted-foreground"
  }

  const getStatusGlow = (status: string) => {
    if (status === "Active Center") return "shadow-[0_0_10px_rgba(16,185,129,0.55)]"
    if (status === "Upcoming") return "shadow-[0_0_10px_rgba(245,158,11,0.55)]"
    if (status === "Non Operational") return "shadow-[0_0_10px_rgba(239,68,68,0.55)]"
    return ""
  }

  const statusShortLabel = (status: string) => {
    if (status === "Active Center") return "Active"
    if (status === "Non Operational") return "Non Operational"
    return status
  }

  const isPresent = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return false
    if (typeof value === "number") return true
    const trimmed = value.trim()
    return trimmed !== "" && trimmed !== "-"
  }

  const announcedCombined = [center.announced_month, center.announced_year].filter(Boolean).join(" ")
  const centerLocation = [center.center_city, center.center_state]
    .map((part) => (typeof part === "string" ? part.trim() : part))
    .filter(Boolean)
    .join(", ")

  const ServiceSection = ({
    icon: Icon,
    title,
    content,
  }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    content: string | undefined
  }) => {
    if (!content || content.trim() === "" || content === "-") return null
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return (
      <div className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
          {lines.map((line, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glassmorphism-dialog max-h-[90vh] max-w-[95vw] overflow-y-auto">
        <DialogHeader>
          <DialogBreadcrumb
            items={[
              { label: center.account_global_legal_name, onClick: () => onOpenChange(false) },
              { label: "Centers", onClick: () => onOpenChange(false) },
              { label: center.center_name },
            ]}
          />
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
            <CompanyLogo
              domain={center.center_account_website}
              companyName={center.account_global_legal_name}
              size="md"
              theme="auto"
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span>{center.center_name}</span>
                <div className="flex items-center gap-1.5">
                  {center.center_website ? (
                    <a
                      href={
                        center.center_website.startsWith("http")
                          ? center.center_website
                          : `https://${center.center_website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground transition-colors hover:text-primary"
                      title={center.center_website}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {center.center_linkedin ? (
                    <a
                      href={
                        center.center_linkedin.startsWith("http")
                          ? center.center_linkedin
                          : `https://${center.center_linkedin}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground transition-colors hover:text-[#0A66C2]"
                      title="LinkedIn"
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${getStatusColor(center.center_status)} ${getStatusGlow(center.center_status)}`}
                  aria-label={center.center_status}
                  title={center.center_status}
                />

              </div>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                {center.account_global_legal_name}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-6 space-y-8">
          {/* Center Snapshot */}
          <section className="rounded-xl border border-border/60 bg-background/40 p-5 backdrop-blur-sm lg:p-6 dark:border-white/10 dark:bg-white/5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                {centerServices?.primary_service ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Primary Services
                    </p>
                    <ul className="space-y-1 text-sm leading-relaxed text-foreground/90">
                      {centerServices.primary_service
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />
                            <span>{line}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                {centerServices?.focus_region ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Focus Region
                    </p>
                    <ul className="space-y-1 text-sm leading-relaxed text-foreground/90">
                      {centerServices.focus_region
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />
                            <span>{line}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                {isPresent(center.center_address) ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Address
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {center.center_address}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="lg:border-l lg:border-border/50 lg:pl-6">
                <MetaRow label="Status" value={statusShortLabel(center.center_status)} />
                <MetaRow label="Center Type" value={center.center_type} />
                <MetaRow label="Center Focus" value={center.center_focus} />
                <MetaRow label="Location" value={centerLocation} />
                <MetaRow label="Country" value={center.center_country} />
                <MetaRow label="Zip Code" value={center.center_zip_code} />
                <MetaRow label="Boardline" value={center.center_boardline} />
                <MetaRow label="Business Segment" value={center.center_business_segment} />
                <MetaRow label="Sub-Segment" value={center.center_business_sub_segment} />
                <MetaRow label="Management Partner" value={center.center_management_partner} />
                <MetaRow label="JV Status" value={center.center_jv_status} />
                <MetaRow label="JV Name" value={center.center_jv_name} />
              </div>
            </div>
          </section>

          {/* Scale & Timeline */}
          <section className="space-y-4">
            <SectionHeader title="Scale & Timeline" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPITile
                icon={Users}
                label="Employees"
                value={center.center_employees}
                caption={center.center_employees_range}
              />
              <KPITile
                icon={Calendar}
                label="Incorporation Year"
                value={center.center_inc_year}
                caption={center.center_timeline}
              />
              <KPITile
                icon={Calendar}
                label="Announced"
                value={announcedCombined || null}
              />
              <KPITile
                icon={Calendar}
                label="End Year"
                value={center.center_end_year}
              />
            </div>
          </section>

          {/* Services Offered */}
          {centerServices ? (
            <section className="space-y-4">
              <SectionHeader title="Services Offered" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ServiceSection icon={Code} title="IT Services" content={centerServices.service_it} />
                <ServiceSection icon={Lightbulb} title="ER&D Services" content={centerServices.service_erd} />
                <ServiceSection icon={DollarSign} title="Finance & Accounting" content={centerServices.service_fna} />
                <ServiceSection icon={UserCog} title="HR Services" content={centerServices.service_hr} />
                <ServiceSection icon={ShoppingCart} title="Procurement" content={centerServices.service_procurement} />
                <ServiceSection icon={TrendingUp} title="Sales & Marketing" content={centerServices.service_sales_marketing} />
                <ServiceSection icon={Headphones} title="Customer Support" content={centerServices.service_customer_support} />
                <ServiceSection icon={MoreHorizontal} title="Other Services" content={centerServices.service_others} />
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
