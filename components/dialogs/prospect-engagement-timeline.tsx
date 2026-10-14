"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { RiDownload2Line, RiFileChartLine, RiMegaphoneLine, RiRefreshLine, RiUserAddLine } from "@remixicon/react"
import type { ProspectEngagement } from "@/lib/types"
import { fetchProspectEngagements } from "@/lib/dashboard/api-client"
import {
  daysBetween,
  engagementKind,
  formatDaysAgo,
  formatGap,
  parseEngagedDate,
  type EngagementKind,
} from "@/lib/dashboard/engagements"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "8 Sep 2026". Built by hand because en-GB Intl renders September as "Sept", breaking the three-letter rhythm. */
function formatDay(time: number): string {
  const d = new Date(time)
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const KINDS: Record<EngagementKind, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  registration: { label: "Registration", Icon: RiUserAddLine },
  download: { label: "Download", Icon: RiDownload2Line },
  snapshot: { label: "Snapshot", Icon: RiFileChartLine },
  campaign: { label: "Campaign", Icon: RiMegaphoneLine },
}

type Touchpoint = {
  key: string
  campaign: string
  kind: EngagementKind
  time: number | null
  dateLabel: string
  /** Days since the previous touchpoint; null for the first one or when a date is unreadable. */
  gapDays: number | null
}

function toTouchpoints(rows: ProspectEngagement[]): Touchpoint[] {
  let previous: number | null = null
  return rows.map((row, idx) => {
    const time = parseEngagedDate(row.prospect_engaged_date)
    const touchpoint: Touchpoint = {
      key: `${row.prospect_engaged_date}-${row.prospect_engaged_campaign}-${idx}`,
      campaign: row.prospect_engaged_campaign?.trim() || "Unnamed campaign",
      kind: engagementKind(row.prospect_engaged_campaign),
      time,
      dateLabel: time === null ? (row.prospect_engaged_date?.trim() || "Date unknown") : formatDay(time),
      gapDays: idx === 0 ? null : daysBetween(previous, time),
    }
    previous = time
    return touchpoint
  })
}

function todayUtc(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

/**
 * A prospect's Bamboo Reports campaign touchpoints, oldest to latest, as a
 * vertical ledger (the CRM activity-timeline convention): dates in a
 * right-aligned column, a type icon on the rail, then the campaign. The time
 * between touchpoints sits on a dashed stretch of the rail, aligned with the
 * campaign names. Most engaged prospects have a single touchpoint, which reads as
 * one row. Loads from /api/prospects/[id]/engagements, already sorted.
 */
export function ProspectEngagementTimeline({ psUniqueKey }: { psUniqueKey: string }) {
  const [engagements, setEngagements] = useState<ProspectEngagement[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setEngagements(null)
    setFailed(false)
    fetchProspectEngagements(psUniqueKey)
      .then((res) => {
        if (!cancelled) setEngagements(res.engagements)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [psUniqueKey, attempt])

  const touchpoints = useMemo(() => (engagements ? toTouchpoints(engagements) : []), [engagements])
  const latest = touchpoints.length > 0 ? touchpoints[touchpoints.length - 1] : null
  const today = todayUtc()
  const lastActiveDays = latest ? daysBetween(latest.time, today) : null
  const loading = engagements === null && !failed

  return (
    <section className="space-y-4" aria-busy={loading}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/40 pb-2">
        <h3 className="text-base font-semibold tracking-tight">Bamboo Reports Activity</h3>
        {touchpoints.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {touchpoints.length > 1 ? `${touchpoints.length} touchpoints · ` : ""}
            {lastActiveDays !== null ? `Last active ${formatDaysAgo(lastActiveDays)}` : `Last active ${latest!.dateLabel}`}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/60 bg-background/40 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
        {loading ? (
          <div className="flex items-center">
            <span className="flex w-[5.5rem] shrink-0 justify-end">
              <Skeleton className="h-3 w-16" />
            </span>
            <Skeleton className="mx-3 h-9 w-9 shrink-0 rounded-lg sm:mx-4" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-52" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ) : failed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Could not load this prospect&apos;s campaign activity.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RiRefreshLine aria-hidden />
              Try again
            </Button>
          </div>
        ) : touchpoints.length === 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No campaign activity on record</p>
            <p className="text-xs text-muted-foreground">
              This prospect is marked as engaged, but their email does not appear in the subscribers sheet.
            </p>
          </div>
        ) : (
          <ol aria-label="Campaign touchpoints, oldest first">
            {touchpoints.map((tp, idx) => {
              const isLatest = idx === touchpoints.length - 1
              const { label, Icon } = KINDS[tp.kind]
              const agoDays = daysBetween(tp.time, today)
              return (
                <li key={tp.key}>
                  {idx > 0 ? (
                    // Elapsed time sits on a dashed stretch of the rail, in the
                    // content column so it lines up with the campaign names.
                    <div className="flex">
                      <span className="w-[5.5rem] shrink-0" aria-hidden />
                      <span className="flex w-9 shrink-0 justify-center mx-3 sm:mx-4" aria-hidden>
                        <span className="w-0 border-l border-dashed border-border" />
                      </span>
                      <p className="py-2.5 text-xs text-muted-foreground tabular-nums">
                        {tp.gapDays !== null ? formatGap(tp.gapDays) : "Later"}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex items-center">
                    <time
                      className="w-[5.5rem] shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums"
                      title={agoDays !== null ? formatDaysAgo(agoDays) : undefined}
                    >
                      {tp.dateLabel}
                    </time>
                    <span
                      className={`mx-3 grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:mx-4 ${
                        isLatest
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                      aria-hidden
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground break-words">{tp.campaign}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {label}
                        {isLatest && touchpoints.length > 1 ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-300"> · Latest</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
