/**
 * Headcount totals exclude employees from these center types.
 * Keep this list in sync with the SQL filter in
 * app/actions/data.ts (getDashboardSummaryMetrics).
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
 * Whether a center's employees count toward headcount totals.
 * Centers with no center_type still count; only the excluded types are dropped.
 */
export function countsTowardHeadcount(centerType: string | null | undefined): boolean {
  if (centerType == null) return true
  return !EXCLUDED_SET.has(centerType.trim().toLowerCase())
}
