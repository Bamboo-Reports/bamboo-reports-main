import ExcelJS from "exceljs"
import { getPrismaOrThrow } from "@/lib/db/prisma"
import { getProspectsPerAccountLimit } from "@/lib/config/dashboard-access"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import type { Account, Center, Prospect, Service } from "@/lib/types"

export type ServerExportDatasetKey = "accounts" | "centers" | "services" | "prospects"

const DATASET_LABELS: Record<ServerExportDatasetKey, string> = {
  accounts: "Accounts",
  centers: "Centers",
  services: "Services",
  prospects: "Prospects",
}

export type ServerExportSelection = {
  datasets: ServerExportDatasetKey[]
  /**
   * When provided, limits the export to rows whose account matches one
   * of these global legal names. When null/undefined, exports everything.
   */
  accountNames?: string[] | null
  /**
   * When provided, limits centers/services to these cn_unique_keys.
   * When null/undefined, exports everything.
   */
  centerKeys?: string[] | null
  /**
   * When provided, limits prospects to these ps_unique_keys (a precise row
   * selection).
   */
  prospectKeys?: string[] | null
  /**
   * When provided, limits keyless prospects to these composite row identities.
   * Used for precise row-selection exports where ps_unique_key is missing.
   */
  keylessProspectIds?: string[] | null
}

export type ServerExportResult = {
  buffer: Buffer
  rowCounts: Record<ServerExportDatasetKey, number>
  totalRows: number
}

function normalizeAccount(row: Account & { account_hq_revenue?: bigint | number | null }): Account {
  return {
    ...row,
    account_hq_revenue:
      typeof row.account_hq_revenue === "bigint"
        ? Number(row.account_hq_revenue)
        : row.account_hq_revenue ?? null,
  }
}

async function fetchAccounts(accountNames: string[] | null | undefined): Promise<Account[]> {
  const prisma = getPrismaOrThrow()
  const rows = (accountNames && accountNames.length > 0
    ? await prisma.$queryRaw`SELECT * FROM accounts WHERE account_global_legal_name = ANY(${accountNames}) ORDER BY account_global_legal_name`
    : await prisma.$queryRaw`SELECT * FROM accounts ORDER BY account_global_legal_name`) as Array<Account & { account_hq_revenue?: bigint | number | null }>
  return rows.map((row) => normalizeAccount(row))
}

async function fetchCenters(centerKeys: string[] | null | undefined): Promise<Center[]> {
  const prisma = getPrismaOrThrow()
  return (centerKeys && centerKeys.length > 0
    ? await prisma.$queryRaw`SELECT * FROM centers WHERE cn_unique_key = ANY(${centerKeys}) ORDER BY center_name`
    : await prisma.$queryRaw`SELECT * FROM centers ORDER BY center_name`) as Center[]
}

async function fetchServices(centerKeys: string[] | null | undefined): Promise<Service[]> {
  const prisma = getPrismaOrThrow()
  if (centerKeys && centerKeys.length > 0) {
    return (await prisma.$queryRaw`SELECT * FROM services WHERE cn_unique_key = ANY(${centerKeys}) ORDER BY center_name`) as Service[]
  }
  return (await prisma.$queryRaw`SELECT * FROM services ORDER BY center_name`) as Service[]
}

async function fetchProspects(
  accountNames: string[] | null | undefined,
  prospectKeys: string[] | null | undefined,
  keylessProspectIds: string[] | null | undefined
): Promise<Prospect[]> {
  const prisma = getPrismaOrThrow()
  const keys = prospectKeys && prospectKeys.length > 0 ? prospectKeys : null
  const keylessIds = keylessProspectIds && keylessProspectIds.length > 0 ? keylessProspectIds : null
  const names = accountNames && accountNames.length > 0 ? accountNames : null
  if (keys && keylessIds) {
    return (await prisma.$queryRaw`
      SELECT * FROM prospects
      WHERE ps_unique_key = ANY(${keys})
        OR (
          (ps_unique_key IS NULL OR ps_unique_key = '')
          AND CONCAT(
            COALESCE(account_global_legal_name, ''),
            '::',
            COALESCE(
              NULLIF(prospect_full_name, ''),
              NULLIF(CONCAT_WS(' ', NULLIF(prospect_first_name, ''), NULLIF(prospect_last_name, '')), ''),
              'Unknown Prospect'
            ),
            '::',
            COALESCE(
              NULLIF(prospect_email, ''),
              NULLIF(prospect_linkedin_url, ''),
              CONCAT_WS('|', NULLIF(prospect_title, ''), NULLIF(prospect_department, ''), NULLIF(prospect_city, ''))
            )
          ) = ANY(${keylessIds})
        )
      ORDER BY prospect_last_name, prospect_first_name
    `) as Prospect[]
  }
  if (keylessIds) {
    return (await prisma.$queryRaw`
      SELECT * FROM prospects
      WHERE (ps_unique_key IS NULL OR ps_unique_key = '')
        AND CONCAT(
          COALESCE(account_global_legal_name, ''),
          '::',
          COALESCE(
            NULLIF(prospect_full_name, ''),
            NULLIF(CONCAT_WS(' ', NULLIF(prospect_first_name, ''), NULLIF(prospect_last_name, '')), ''),
            'Unknown Prospect'
          ),
          '::',
          COALESCE(
            NULLIF(prospect_email, ''),
            NULLIF(prospect_linkedin_url, ''),
            CONCAT_WS('|', NULLIF(prospect_title, ''), NULLIF(prospect_department, ''), NULLIF(prospect_city, ''))
          )
        ) = ANY(${keylessIds})
      ORDER BY prospect_last_name, prospect_first_name
    `) as Prospect[]
  }
  // A precise row selection targets ps_unique_key; any keyless prospects in the
  // selection fall back to their account so nothing selected is dropped.
  if (keys && names) {
    return (await prisma.$queryRaw`
      SELECT * FROM prospects
      WHERE ps_unique_key = ANY(${keys})
      UNION ALL
      SELECT * FROM prospects
      WHERE account_global_legal_name = ANY(${names})
        AND (ps_unique_key IS NULL OR ps_unique_key <> ALL(${keys}))
      ORDER BY prospect_last_name, prospect_first_name
    `) as Prospect[]
  }
  if (keys) {
    return (await prisma.$queryRaw`SELECT * FROM prospects WHERE ps_unique_key = ANY(${keys}) ORDER BY prospect_last_name, prospect_first_name`) as Prospect[]
  }
  if (names) {
    return (await prisma.$queryRaw`SELECT * FROM prospects WHERE account_global_legal_name = ANY(${names}) ORDER BY prospect_last_name, prospect_first_name`) as Prospect[]
  }
  return (await prisma.$queryRaw`SELECT * FROM prospects ORDER BY prospect_last_name, prospect_first_name`) as Prospect[]
}

function addWorksheet<T extends Record<string, unknown>>(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: T[]
) {
  const worksheet = workbook.addWorksheet(sheetName)
  if (rows.length === 0) return worksheet

  const seen = new Set<string>()
  const keys: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }

  worksheet.columns = keys.map((key) => ({ header: key, key }))
  for (const row of rows) {
    worksheet.addRow(row)
  }
  return worksheet
}

export async function buildServerExport(
  selection: ServerExportSelection
): Promise<ServerExportResult> {
  const { datasets, accountNames, centerKeys, prospectKeys, keylessProspectIds } = selection
  const prospectsPerAccountLimit = getProspectsPerAccountLimit()

  const [accounts, centers, services, rawProspects] = await Promise.all([
    datasets.includes("accounts") ? fetchAccounts(accountNames) : Promise.resolve([] as Account[]),
    datasets.includes("centers") ? fetchCenters(centerKeys) : Promise.resolve([] as Center[]),
    datasets.includes("services") ? fetchServices(centerKeys) : Promise.resolve([] as Service[]),
    datasets.includes("prospects") ? fetchProspects(accountNames, prospectKeys, keylessProspectIds) : Promise.resolve([] as Prospect[]),
  ])
  const { visibleProspects: prospects } = partitionProspectsByAccess(rawProspects, prospectsPerAccountLimit)

  const workbook = new ExcelJS.Workbook()

  const rowCounts: Record<ServerExportDatasetKey, number> = {
    accounts: 0,
    centers: 0,
    services: 0,
    prospects: 0,
  }

  if (datasets.includes("accounts")) {
    addWorksheet(workbook, DATASET_LABELS.accounts, accounts as unknown as Array<Record<string, unknown>>)
    rowCounts.accounts = accounts.length
  }
  if (datasets.includes("centers")) {
    addWorksheet(workbook, DATASET_LABELS.centers, centers as unknown as Array<Record<string, unknown>>)
    rowCounts.centers = centers.length
  }
  if (datasets.includes("services")) {
    addWorksheet(workbook, DATASET_LABELS.services, services as unknown as Array<Record<string, unknown>>)
    rowCounts.services = services.length
  }
  if (datasets.includes("prospects")) {
    addWorksheet(workbook, DATASET_LABELS.prospects, prospects as unknown as Array<Record<string, unknown>>)
    rowCounts.prospects = prospects.length
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer)

  const totalRows =
    rowCounts.accounts + rowCounts.centers + rowCounts.services + rowCounts.prospects

  return { buffer, rowCounts, totalRows }
}
