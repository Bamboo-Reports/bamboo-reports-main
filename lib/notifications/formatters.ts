const TABLE_LABELS: Record<string, string> = {
  accounts: "Accounts",
  centers: "Centers",
  prospects: "Prospects",
}

const TABLE_LABELS_SINGULAR: Record<string, string> = {
  accounts: "Account",
  centers: "Center",
  prospects: "Prospect",
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

export function formatTableLabel(tableName: string, count: number): string {
  const normalized = tableName.trim().toLowerCase()
  if (count === 1) return TABLE_LABELS_SINGULAR[normalized] ?? normalized
  return TABLE_LABELS[normalized] ?? normalized
}

export function formatSummaryTitle(summary: {
  table_name: string
  change_type: "added" | "updated"
  record_count: number
}): string {
  const count = summary.record_count
  const label = formatTableLabel(summary.table_name, count)

  if (summary.change_type === "added") {
    return `${count} new ${label} added`
  }
  return `${count} ${label} updated`
}

export function formatRelativeEventDate(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  const deltaSeconds = Math.round((parsed - Date.now()) / 1000)
  const absoluteSeconds = Math.abs(deltaSeconds)

  if (absoluteSeconds < 5) return "just now"
  if (absoluteSeconds < 60) return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second")

  const deltaMinutes = Math.round(deltaSeconds / 60)
  if (Math.abs(deltaMinutes) < 60) return RELATIVE_TIME_FORMATTER.format(deltaMinutes, "minute")

  const deltaHours = Math.round(deltaMinutes / 60)
  if (Math.abs(deltaHours) < 24) return RELATIVE_TIME_FORMATTER.format(deltaHours, "hour")

  const deltaDays = Math.round(deltaHours / 24)
  if (Math.abs(deltaDays) < 7) return RELATIVE_TIME_FORMATTER.format(deltaDays, "day")

  return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function formatAbsoluteEventDate(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
