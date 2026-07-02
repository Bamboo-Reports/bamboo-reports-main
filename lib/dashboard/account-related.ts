import type { Account, Center, LockedProspectTeaser, Prospect, Service, Tech } from "@/lib/types"
import { getProspectsPerAccountLimit } from "@/lib/config/dashboard-access"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import {
  ACCOUNT_PROJECTION,
  CENTER_COLUMNS,
  PROSPECT_COLUMNS,
  SERVICE_COLUMNS,
  TECH_COLUMNS,
} from "@/lib/dashboard/entity-columns"
import type { FilterAccess } from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"

export type AccountRelatedResult = {
  account: Account | null
  centers: Center[]
  services: Service[]
  tech: Tech[]
  prospects: Prospect[]
  lockedProspectTeasers: LockedProspectTeaser[]
}

/**
 * Everything the account detail dialog needs for one account: the account row,
 * its centers, the services rows for those centers, its tech rows, and its
 * prospects partitioned by the per-account access limit (same rule as the
 * dashboard payload in app/actions/data.ts). Section entitlements gate each
 * piece like getDashboardData does.
 */
export async function getAccountRelated(name: string, access: FilterAccess): Promise<AccountRelatedResult> {
  const values = [name]
  const accountsEnabled = access.accountsEnabled !== false
  const centersEnabled = access.centersEnabled !== false
  const prospectsEnabled = access.prospectsEnabled !== false

  const empty = Promise.resolve([] as never[])
  const [accountRows, centers, services, tech, rawProspects] = await Promise.all([
    accountsEnabled
      ? queryWarehouse<Account>({
          text: `select ${ACCOUNT_PROJECTION} from accounts where account_global_legal_name = $1 limit 1`,
          values,
        })
      : empty,
    centersEnabled
      ? queryWarehouse<Center>({
          text: `select ${CENTER_COLUMNS.join(", ")} from centers where account_global_legal_name = $1 order by center_name asc`,
          values,
        })
      : empty,
    centersEnabled
      ? queryWarehouse<Service>({
          text: `select ${SERVICE_COLUMNS.join(", ")} from services where cn_unique_key in (select cn_unique_key from centers where account_global_legal_name = $1) order by center_name`,
          values,
        })
      : empty,
    accountsEnabled || centersEnabled
      ? queryWarehouse<Tech>({
          text: `select ${TECH_COLUMNS.join(", ")} from tech where account_global_legal_name = $1 order by software_category, software_in_use`,
          values,
        })
      : empty,
    prospectsEnabled
      ? queryWarehouse<Prospect>({
          text: `select ${PROSPECT_COLUMNS.join(", ")} from prospects where account_global_legal_name = $1 order by ps_unique_key`,
          values,
        })
      : empty,
  ])

  const { visibleProspects, lockedProspectTeasers } = partitionProspectsByAccess(
    rawProspects,
    getProspectsPerAccountLimit()
  )

  return {
    account: accountRows[0] ?? null,
    centers,
    services,
    tech,
    prospects: visibleProspects,
    lockedProspectTeasers,
  }
}
