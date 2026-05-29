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
  if (prospect.ps_unique_key) return prospect.ps_unique_key
  // No stable server key: build the most-discriminating composite we can so two
  // distinct prospects don't collide, and a null account doesn't serialize to
  // the literal "null".
  const account = prospect.account_global_legal_name ?? ""
  const discriminator =
    prospect.prospect_email ||
    prospect.prospect_linkedin_url ||
    [prospect.prospect_title, prospect.prospect_department, prospect.prospect_city]
      .filter(Boolean)
      .join("|")
  return `${account}::${getProspectDisplayName(prospect)}::${discriminator}`
}
