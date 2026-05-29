import type { Prospect } from "@/lib/types"

export function getProspectDisplayName(prospect: Prospect): string {
  return (
    prospect.prospect_full_name ||
    [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ") ||
    "Unknown Prospect"
  )
}

/** Stable identity for a prospect row, used for selection and favorites. */
export function getProspectRecordId(prospect: Prospect): string {
  return prospect.ps_unique_key || `${prospect.account_global_legal_name}::${getProspectDisplayName(prospect)}`
}
