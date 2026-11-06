/** Helpers for the My exports window: titles, sizes and browsers. Day groups live in lib/utils/day-groups. */

export { describeWhen, groupByDay } from "@/lib/utils/day-groups"

const DATASET_ORDER = ["accounts", "centers", "services", "prospects"] as const
const DATASET_LABELS: Record<string, string> = { accounts: "Accounts", centers: "Centres", services: "Services", prospects: "Prospects" }

export const datasetLabel = (key: string) => DATASET_LABELS[key] ?? key

/** Datasets in the order the sheets appear in the file. */
export function orderDatasets(datasets: string[]): string[] {
  const known = DATASET_ORDER.filter((key) => datasets.includes(key))
  return [...known, ...datasets.filter((key) => !(DATASET_ORDER as readonly string[]).includes(key))]
}

/** "All four sheets", or the sheet names: "Accounts, Centres". */
export function exportTitle(datasets: string[]): string {
  const ordered = orderDatasets(datasets)
  if (DATASET_ORDER.every((key) => ordered.includes(key))) return "All four sheets"
  return ordered.map(datasetLabel).join(", ") || "Export"
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i < 2 ? 0 : 1)} ${units[i]}`
}

/** "Chrome on Windows" from a user agent string; null when it cannot tell. */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  // Mobile builds carry their own token next to Chrome's or Safari's (EdgA,
  // EdgiOS, CriOS, FxiOS), so those are checked before the generic ones.
  const browser = /Edg(?:e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os
}

/** The row selection an export was limited to, read from its saved filters. */
export function selectionSummary(filters: unknown): string | null {
  if (!filters || typeof filters !== "object") return null
  const selection = (filters as { selection?: unknown }).selection
  if (!selection || typeof selection !== "object") return null
  const s = selection as { dataset?: unknown; count?: unknown; accountNames?: unknown; centerKeys?: unknown; prospectIds?: unknown }
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0)
  const n =
    typeof s.count === "number"
      ? s.count
      : s.dataset === "centers"
        ? count(s.centerKeys)
        : s.dataset === "prospects"
          ? count(s.prospectIds)
          : count(s.accountNames)
  const noun = s.dataset === "centers" ? "centre" : s.dataset === "prospects" ? "prospect" : "account"
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`
}

/** Values of one filter the exports list carries; the rest is reported as a count. */
export const MAX_LISTED_FILTER_VALUES = 50

/**
 * The saved filters of an export, cut down for the My exports list: a row
 * selection becomes its dataset and count (not thousands of keys), and a
 * long value list keeps its first values plus how many more there were. The
 * list only describes the filters; it never re-applies them.
 */
export function summarizeExportFilters(filters: unknown): unknown {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return filters
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (key === "selection" && value && typeof value === "object") {
      const s = value as { dataset?: unknown; accountNames?: unknown; centerKeys?: unknown; prospectIds?: unknown }
      const keys = s.dataset === "centers" ? s.centerKeys : s.dataset === "prospects" ? s.prospectIds : s.accountNames
      out[key] = { dataset: s.dataset, count: Array.isArray(keys) ? keys.length : 0 }
    } else if (Array.isArray(value) && value.length > MAX_LISTED_FILTER_VALUES) {
      const more = value.length - MAX_LISTED_FILTER_VALUES
      out[key] = [...value.slice(0, MAX_LISTED_FILTER_VALUES), { value: `and ${more.toLocaleString()} more`, mode: "include" }]
    } else {
      out[key] = value
    }
  }
  return out
}
