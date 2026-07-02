import type { Account, Center, LockedProspectTeaser, Prospect, Service, Tech } from "@/lib/types"
import { getProspectsPerAccountLimit } from "@/lib/config/dashboard-access"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import { ACCOUNT_COLUMNS, CENTER_COLUMNS, PROSPECT_COLUMNS } from "@/lib/dashboard/entity-query"
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

const ACCOUNT_PROJECTION = [
  ...ACCOUNT_COLUMNS.filter((c) => c !== "account_hq_revenue"),
  "account_hq_revenue::float8 as account_hq_revenue",
].join(", ")

// Same columns as getDashboardServices / getDashboardTech in app/actions/data.ts.
const SERVICE_COLUMNS =
  "cn_unique_key, center_name, primary_service, focus_region, service_it, service_erd, service_fna, service_hr, " +
  "service_procurement, service_sales_marketing, service_customer_support, service_others, software_vendor, software_in_use"
const TECH_COLUMNS = "account_global_legal_name, cn_unique_key, software_in_use, software_vendor, software_category"

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
          text: `select ${SERVICE_COLUMNS} from services where cn_unique_key in (select cn_unique_key from centers where account_global_legal_name = $1) order by center_name`,
          values,
        })
      : empty,
    accountsEnabled || centersEnabled
      ? queryWarehouse<Tech>({
          text: `select ${TECH_COLUMNS} from tech where account_global_legal_name = $1 order by software_category, software_in_use`,
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
