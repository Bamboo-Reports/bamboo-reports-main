/** Lists grouped by when things happened: Today, Yesterday, This week, then by month. */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY = 86_400_000

type When = { group: string; short: string; long: string }

/**
 * Where an item sits in a dated list and how its time reads:
 * Today and Yesterday, then "This week" with weekdays, then one group per month.
 */
export function describeWhen(value: string | number, now: Date = new Date()): When {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { group: "Earlier", short: String(value), long: String(value) }
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY)
  if (days <= 0) return { group: "Today", short: time, long: `Today, ${time}` }
  if (days === 1) return { group: "Yesterday", short: time, long: `Yesterday, ${time}` }
  if (days < 7) {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" })
    return { group: "This week", short: `${weekday} ${time}`, long: `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${time}` }
  }
  const sameYear = d.getFullYear() === now.getFullYear()
  const group = d.toLocaleDateString(undefined, sameYear ? { month: "long" } : { month: "long", year: "numeric" })
  const short = d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return { group, short, long: `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${time}` }
}

/** Consecutive rows that share a group, keeping their order (newest first). */
export function groupByDay<T>(
  rows: T[],
  dateOf: (row: T) => string | number,
  now: Date = new Date()
): Array<{ group: string; rows: T[] }> {
  const out: Array<{ group: string; rows: T[] }> = []
  for (const row of rows) {
    const { group } = describeWhen(dateOf(row), now)
    const last = out[out.length - 1]
    if (last && last.group === group) last.rows.push(row)
    else out.push({ group, rows: [row] })
  }
  return out
}
