import { RiBriefcaseLine, RiBuilding2Line, RiGroupLine } from "@remixicon/react"
export type EntityDisplayType = "account" | "center" | "prospect"

/**
 * Relative-time label for the history list. Accepts an epoch number or an ISO
 * string; returns "" for an unparseable value.
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

/** Icon and label for each entity type, shared across record lists. */
export const ENTITY_TYPE_META: Record<EntityDisplayType, { icon: typeof RiBuilding2Line; label: string }> = {
  account: { icon: RiBuilding2Line, label: "Account" },
  center: { icon: RiBriefcaseLine, label: "Centre" },
  prospect: { icon: RiGroupLine, label: "Prospect" },
}
