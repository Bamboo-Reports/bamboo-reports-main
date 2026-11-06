"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  RiArrowRightUpLine,
  RiCloseLine,
  RiCodeLine,
  RiGlobalLine,
  RiHeadphoneLine,
  RiLightbulbLine,
  RiLineChartLine,
  RiLinkedinBoxLine,
  RiMoneyDollarCircleLine,
  RiMoreLine,
  RiRobot2Line,
  RiShoppingCartLine,
  RiUserSettingsLine,
} from "@remixicon/react"
import type { Center, Service, Tech } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { HintTooltip } from "@/components/ui/tooltip"
import { CompanyLogo } from "@/components/ui/company-logo"
import { TechTreemap } from "@/components/charts/tech-treemap"
import { formatCenterLocation } from "@/lib/utils/helpers"
import { useCenterDetail } from "@/hooks/use-center-detail"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { Skeleton } from "@/components/ui/skeleton"
import { RelatedLoadError } from "./related-load-error"
import { useRecordHistory } from "@/contexts/record-history-context"
import { centerHistoryItem } from "@/lib/dashboard/record-history"
import { cn, ensureAbsoluteUrl } from "@/lib/utils"
import { FactGroup, StatRow } from "./account-details-parts"
import { centerStatusLabel } from "./account-related-columns"

interface CenterDetailsDialogProps {
  center: Center | null
  services: Service[]
  tech: Tech[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountOpen?: (accountName: string) => void
  /** Server mode (#249): load the center's services/tech from /api/centers/[key] instead of the array props. */
  fetchDetail?: boolean
}

function statusDot(status: string | null | undefined): string {
  if (status === "Active Center") return "bg-include"
  if (status === "Upcoming") return "bg-amber-500"
  if (status === "Non Operational") return "bg-exclude"
  return "bg-muted-foreground/50"
}

/** Lines of a multi-line field, without blanks or "-" placeholders. */
const parseLines = (content: string | null | undefined) =>
  content ? content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== "-") : []

const present = (value: string | number | null | undefined) =>
  value !== null && value !== undefined && (typeof value === "number" || (value.trim() !== "" && value.trim() !== "-"))

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function Tags({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex min-h-6 items-center rounded-md bg-muted px-2 py-0.5 text-xs">
          {item}
        </span>
      ))}
    </div>
  )
}

/** A centre: what it does and how big it is on the left, where it is and who runs it on the right. */
export function CenterDetailsDialog({
  center,
  services: servicesProp,
  tech: techProp,
  open,
  onOpenChange,
  onAccountOpen,
  fetchDetail = false,
}: CenterDetailsDialogProps) {
  const detailKey = fetchDetail && open ? (center?.cn_unique_key ?? "") : ""
  const { data: detail, loading: detailLoading, error: detailError, retry: retryDetail } = useCenterDetail(detailKey)

  const recordOpened = useRecordHistory()
  React.useEffect(() => {
    if (open && center) recordOpened(centerHistoryItem(center))
  }, [open, center, recordOpened])

  if (!center) return null

  const services = fetchDetail ? (detail?.services ?? []) : servicesProp
  const tech = fetchDetail ? (detail?.tech ?? []) : techProp
  const centerServices = services.find((service) => service.cn_unique_key === center.cn_unique_key)
  const centerTech = tech.filter((item) => item.cn_unique_key === center.cn_unique_key)

  const serviceCategories = [
    { key: "it", icon: RiCodeLine, title: "IT services", items: parseLines(centerServices?.service_it) },
    { key: "ai", icon: RiRobot2Line, title: "AI services", items: parseLines(centerServices?.service_ai) },
    { key: "erd", icon: RiLightbulbLine, title: "ER&D services", items: parseLines(centerServices?.service_erd) },
    { key: "finance", icon: RiMoneyDollarCircleLine, title: "Finance and accounting", items: parseLines(centerServices?.service_fna) },
    { key: "hr", icon: RiUserSettingsLine, title: "HR services", items: parseLines(centerServices?.service_hr) },
    { key: "procurement", icon: RiShoppingCartLine, title: "Procurement", items: parseLines(centerServices?.service_procurement) },
    { key: "sales", icon: RiLineChartLine, title: "Sales and marketing", items: parseLines(centerServices?.service_sales_marketing) },
    { key: "support", icon: RiHeadphoneLine, title: "Customer support", items: parseLines(centerServices?.service_customer_support) },
    { key: "other", icon: RiMoreLine, title: "Other services", items: parseLines(centerServices?.service_others) },
  ].filter((category) => category.items.length > 0)

  const primaryServices = parseLines(centerServices?.primary_service)
  const focusRegions = parseLines(centerServices?.focus_region)
  const location = formatCenterLocation(center.center_city, center.center_state)
  const showCountry = center.center_country?.trim().toUpperCase() !== "TBA" && location !== "India"
  const announced = [center.announced_month, center.announced_year].filter(Boolean).join(" ")
  const trackLink = (linkType: "website" | "linkedin") =>
    captureEvent(ANALYTICS_EVENTS.OUTBOUND_LINK_CLICKED, { entity: "center", link_type: linkType })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-3rem)] max-h-none w-[calc(100vw-3rem)] max-w-[1480px] grid-cols-[minmax(0,1fr)] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <DialogDescription className="sr-only">
          Centre profile: services, scale, technology, location and the account it belongs to.
        </DialogDescription>

        <div className="shrink-0 border-b px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <CompanyLogo domain={center.center_account_website ?? undefined} companyName={center.account_global_legal_name} size="md" theme="auto" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <DialogTitle className="min-w-0 truncate text-xl font-semibold tracking-[-0.015em]">{center.center_name}</DialogTitle>
                {center.center_status && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", statusDot(center.center_status))} />
                    {centerStatusLabel(center.center_status)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {[location, showCountry ? center.center_country : null].filter(Boolean).join(", ")}
                {location && " · "}
                {onAccountOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      captureEvent(ANALYTICS_EVENTS.RELATED_RECORD_OPENED, { parent_entity: "center", entity: "account" })
                      onAccountOpen(center.account_global_legal_name)
                    }}
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {center.account_global_legal_name}
                    <RiArrowRightUpLine className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  center.account_global_legal_name
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {center.center_website && (
                <HintTooltip label="Website" hint={center.center_website}>
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={ensureAbsoluteUrl(center.center_website)} target="_blank" rel="noopener noreferrer" aria-label="Website" onClick={() => trackLink("website")}>
                      <RiGlobalLine />
                    </a>
                  </Button>
                </HintTooltip>
              )}
              {center.center_linkedin && (
                <HintTooltip label="LinkedIn">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={ensureAbsoluteUrl(center.center_linkedin)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" onClick={() => trackLink("linkedin")}>
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 px-6 py-5">
              {primaryServices.length > 0 && (
                <Section title="Primary services">
                  <Tags items={primaryServices} />
                </Section>
              )}
              {focusRegions.length > 0 && (
                <Section title="Focus regions">
                  <Tags items={focusRegions} />
                </Section>
              )}

              <Section title="Scale and timeline">
                <StatRow
                  stats={[
                    { label: "Employees", value: center.center_employees?.toLocaleString("en-US") ?? center.center_employees_range, caption: center.center_employees != null ? center.center_employees_range : null },
                    { label: "Incorporated", value: center.center_inc_year, caption: center.center_timeline },
                    { label: "Announced", value: announced || null },
                    { label: "End year", value: center.center_end_year },
                  ]}
                />
              </Section>

              {detailError && (
                <div className="mt-7">
                  <RelatedLoadError message="Services and tech stack for this centre could not load." onRetry={retryDetail} />
                </div>
              )}

              {detailLoading && (
                <Section title="Services offered">
                  <Skeleton className="h-[132px] w-full rounded-xl" />
                </Section>
              )}
              {!detailLoading && serviceCategories.length > 0 && (
                <Section title="Services offered">
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {serviceCategories.map((category, index) => (
                      <div key={category.key} className={cn("grid gap-3 px-4 py-3 sm:grid-cols-[190px_minmax(0,1fr)]", index > 0 && "border-t border-border/70")}>
                        <span className="flex items-center gap-2 pt-0.5 text-[13px] text-muted-foreground">
                          <category.icon className="h-4 w-4 shrink-0" />
                          {category.title}
                        </span>
                        <Tags items={category.items} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {detailLoading && (
                <Section title="Technology stack">
                  <Skeleton className="h-[240px] w-full rounded-xl" />
                </Section>
              )}
              {!detailLoading && centerTech.length > 0 && (
                <Section title="Technology stack">
                  <TechTreemap tech={centerTech} />
                </Section>
              )}
            </div>

            <aside className="border-t bg-[color-mix(in_srgb,hsl(var(--muted))_30%,hsl(var(--background)))] px-5 py-5 lg:border-l lg:border-t-0">
              {/* Stays in view while the left side scrolls; leaves out what the header and the number row already show. */}
              <div className="lg:sticky lg:top-5">
                <FactGroup
                  title="Centre"
                  rows={[
                    ["Type", center.center_type],
                    ["Focus", center.center_focus],
                  ]}
                />
                <FactGroup
                  title="Location"
                  rows={[
                    ["Micro location", present(center.center_micro_location) ? center.center_micro_location : null],
                    ["Zip code", present(center.center_zip_code) ? center.center_zip_code : null],
                    ["Boardline", present(center.center_boardline) ? center.center_boardline : null],
                  ]}
                />
                {present(center.center_address) && (
                  <section className="mb-5">
                    <h4 className="mb-1 text-xs font-medium text-muted-foreground">Address</h4>
                    <p className="whitespace-pre-line text-[13px] leading-relaxed">{center.center_address}</p>
                  </section>
                )}
                <FactGroup
                  title="Partnership"
                  rows={[
                    ["Management partner", present(center.center_management_partner) ? center.center_management_partner : null],
                    ["JV status", present(center.center_jv_status) ? center.center_jv_status : null],
                    ["JV name", present(center.center_jv_name) ? center.center_jv_name : null],
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
