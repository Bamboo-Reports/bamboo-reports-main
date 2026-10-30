/**
 * Headcount totals exclude employees from these center types.
 * Keep this list in sync with the SQL filter in CENTER_METRICS
 * (lib/dashboard/dashboard-core.ts).
 */
export const HEADCOUNT_EXCLUDED_CENTER_TYPES = [
  "Manufacturing",
  "Sales & Marketing",
  "BPO",
  "Distribution",
] as const

const EXCLUDED_SET = new Set(
  HEADCOUNT_EXCLUDED_CENTER_TYPES.map((t) => t.toLowerCase())
)

/**
 * SQL for the headcount of the grouped centers: the sum of center_employees
 * over every center whose type counts toward headcount (see
 * countsTowardHeadcount). Shared by the summary cards and the maps so both
 * report the same number.
 */
export const HEADCOUNT_SUM_SQL =
  "coalesce(sum(case when (center_type is null or lower(center_type) not in (" +
  HEADCOUNT_EXCLUDED_CENTER_TYPES.map((t) => `'${t.toLowerCase()}'`).join(", ") +
  ")) then center_employees else 0 end), 0)::int"

/**
 * Whether a center's employees count toward headcount totals.
 * Centers with no center_type still count; only the excluded types are dropped.
 */
export function countsTowardHeadcount(centerType: string | null | undefined): boolean {
  if (centerType == null) return true
  return !EXCLUDED_SET.has(centerType.trim().toLowerCase())
}
