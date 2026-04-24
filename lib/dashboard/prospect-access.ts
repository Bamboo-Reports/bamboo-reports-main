import type { LockedProspectTeaser, Prospect } from "@/lib/types"

export type ProspectAccessPartition = {
  visibleProspects: Prospect[]
  lockedProspectTeasers: LockedProspectTeaser[]
}

export function partitionProspectsByAccess(
  prospects: Prospect[],
  perAccountLimit: number | null
): ProspectAccessPartition {
  if (perAccountLimit === null) {
    return {
      visibleProspects: prospects,
      lockedProspectTeasers: [],
    }
  }

  if (perAccountLimit <= 0) {
    return {
      visibleProspects: [],
      lockedProspectTeasers: prospects.map((prospect, index) => ({
        id: `${prospect.account_global_legal_name}::locked::${index}`,
        locked: true as const,
        account_global_legal_name: prospect.account_global_legal_name,
        prospect_department: prospect.prospect_department,
        prospect_level: prospect.prospect_level,
        prospect_city: prospect.prospect_city,
        prospect_state: prospect.prospect_state,
        prospect_country: prospect.prospect_country,
        head_type: prospect.head_type,
      })),
    }
  }

  const accountCounts = new Map<string, number>()
  const visibleProspects: Prospect[] = []
  const lockedProspectTeasers: LockedProspectTeaser[] = []

  for (const [index, prospect] of prospects.entries()) {
    const accountName = prospect.account_global_legal_name
    const currentCount = accountCounts.get(accountName) ?? 0

    if (currentCount >= perAccountLimit) {
      lockedProspectTeasers.push({
        id: `${accountName}::locked::${index}`,
        locked: true,
        account_global_legal_name: accountName,
        prospect_department: prospect.prospect_department,
        prospect_level: prospect.prospect_level,
        prospect_city: prospect.prospect_city,
        prospect_state: prospect.prospect_state,
        prospect_country: prospect.prospect_country,
        head_type: prospect.head_type,
      })
      continue
    }

    visibleProspects.push(prospect)
    accountCounts.set(accountName, currentCount + 1)
  }

  return {
    visibleProspects,
    lockedProspectTeasers,
  }
}
