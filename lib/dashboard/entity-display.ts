import { Briefcase, Building2, Users } from "lucide-react"

export type EntityDisplayType = "account" | "center" | "prospect"

/**
 * Relative-time label shared by the history and favorites lists. Accepts an
 * epoch number or an ISO string; returns "" for an unparseable value.
 */
export function formatTimeAgo(value: number | string): string {
  const ts = typeof value === "number" ? value : new Date(value).getTime()
  if (Number.isNaN(ts)) return ""
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
}

/** Icon and colour treatment for each entity type, shared across record lists. */
export const ENTITY_TYPE_META: Record<
  EntityDisplayType,
  { icon: typeof Building2; iconClass: string; borderClass: string; badgeClass: string; label: string }
> = {
  account: {
    icon: Building2,
    iconClass: "text-primary",
    borderClass: "border-primary/20",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    label: "Account",
  },
  center: {
    icon: Briefcase,
    iconClass: "text-[hsl(var(--chart-2))]",
    borderClass: "border-[hsl(var(--chart-2))]/25",
    badgeClass: "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.25)]",
    label: "Center",
  },
  prospect: {
    icon: Users,
    iconClass: "text-[hsl(var(--chart-3))]",
    borderClass: "border-[hsl(var(--chart-3))]/25",
    badgeClass: "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.25)]",
    label: "Prospect",
  },
}
