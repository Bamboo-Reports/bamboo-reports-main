import type { Account, Center, Prospect, Service, Tech } from "@/lib/types"
import {
  ACCOUNT_PROJECTION,
  CENTER_COLUMNS,
  PROSPECT_COLUMNS,
  SERVICE_COLUMNS,
  TECH_COLUMNS,
} from "@/lib/dashboard/entity-columns"
import { queryWarehouse } from "@/lib/db/warehouse"

export type AccountRelatedResult = {
  account: Account | null
  centers: Center[]
  services: Service[]
  tech: Tech[]
  prospects: Prospect[]
}

/**
 * Everything the account detail dialog needs for one account: the account row,
 * its centers, the services rows for those centers, its tech rows, and its
 * prospects.
 */
export async function getAccountRelated(name: string): Promise<AccountRelatedResult> {
  const values = [name]
  const [accountRows, centers, services, tech, prospects] = await Promise.all([
    queryWarehouse<Account>({
      text: `select ${ACCOUNT_PROJECTION} from accounts where account_global_legal_name = $1 limit 1`,
      values,
    }),
    queryWarehouse<Center>({
      text: `select ${CENTER_COLUMNS.join(", ")} from centers where account_global_legal_name = $1 order by center_name asc`,
      values,
    }),
    queryWarehouse<Service>({
      text: `select ${SERVICE_COLUMNS.join(", ")} from services where cn_unique_key in (select cn_unique_key from centers where account_global_legal_name = $1) order by center_name`,
      values,
    }),
    queryWarehouse<Tech>({
      text: `select ${TECH_COLUMNS.join(", ")} from tech where account_global_legal_name = $1 order by software_category, software_in_use`,
      values,
    }),
    queryWarehouse<Prospect>({
      text: `select ${PROSPECT_COLUMNS.join(", ")} from prospects where account_global_legal_name = $1 order by ps_unique_key`,
      values,
    }),
  ])

  return {
    account: accountRows[0] ?? null,
    centers,
    services,
    tech,
    prospects,
  }
}
