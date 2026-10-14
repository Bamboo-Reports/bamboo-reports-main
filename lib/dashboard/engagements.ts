import type { Prospect, ProspectEngagement } from "@/lib/types"

/** The prospects sheet marks engaged prospects with "Yes" in prospect_engaged. */
export function isEngagedProspect(prospect: Pick<Prospect, "prospect_engaged">): boolean {
  return prospect.prospect_engaged?.trim().toLowerCase() === "yes"
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Parses the subscribers sheet's engaged date ("8-September-2026"; short month
 * names like "8-Sep-2026" also work) to a UTC timestamp. Returns null for
 * anything else so a malformed cell sorts last instead of failing the list.
 */
export function parseEngagedDate(value: string | null | undefined): number | null {
  const match = /^\s*(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})\s*$/.exec(value ?? "")
  if (!match) return null
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()]
  if (month === undefined) return null
  const day = Number(match[1])
  const year = Number(match[3])
  const time = Date.UTC(year, month, day)
  // Rejects day overflow such as 31-February, which Date.UTC rolls forward.
  return new Date(time).getUTCDate() === day ? time : null
}

/** Oldest first (first touchpoint at the top); undated rows go last, ties keep campaign name order. */
export function sortEngagements(rows: ProspectEngagement[]): ProspectEngagement[] {
  return rows
    .map((row) => ({ row, time: parseEngagedDate(row.prospect_engaged_date) }))
    .sort((a, b) => {
      if (a.time !== b.time) {
        if (a.time === null) return 1
        if (b.time === null) return -1
        return a.time - b.time
      }
      return (a.row.prospect_engaged_campaign ?? "").localeCompare(b.row.prospect_engaged_campaign ?? "")
    })
    .map(({ row }) => row)
}

export type EngagementKind = "registration" | "download" | "snapshot" | "campaign"

/** Campaign type from its name ("BR Q2 2026 Registration Campaign" is a registration). */
export function engagementKind(campaign: string | null | undefined): EngagementKind {
  const name = (campaign ?? "").toLowerCase()
  if (name.includes("registration") || name.includes("register")) return "registration"
  if (name.includes("download")) return "download"
  if (name.includes("snapshot")) return "snapshot"
  return "campaign"
}

const DAY_MS = 86_400_000

/** Whole days from one engaged date to a later one; null when either is unparseable. */
export function daysBetween(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null
  return Math.round((to - from) / DAY_MS)
}

/** "today", "3 days ago", "5 weeks ago", "4 months ago", "2 years ago". */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 730) {
    const months = Math.floor(days / 30)
    return months === 1 ? "1 month ago" : `${months} months ago`
  }
  return `${Math.floor(days / 365)} years ago`
}

/** Spacing label between two consecutive touchpoints. */
export function formatGap(days: number): string {
  if (days <= 0) return "Same day"
  return days === 1 ? "1 day later" : `${days} days later`
}
