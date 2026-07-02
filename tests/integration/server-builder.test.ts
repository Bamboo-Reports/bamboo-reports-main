import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildServerExport } from "@/lib/exports/server-builder"
import { makeAccount, makeCenter, makeProspect, makeService } from "../fixtures/domain"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  queryWarehouse: vi.fn(),
  getProspectsPerAccountLimit: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: () => ({
    $queryRaw: mocks.queryRaw,
  }),
}))

vi.mock("@/lib/db/warehouse", () => ({
  queryWarehouse: mocks.queryWarehouse,
}))

vi.mock("@/lib/config/dashboard-access", () => ({
  getProspectsPerAccountLimit: () => mocks.getProspectsPerAccountLimit(),
}))

describe("server export builder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProspectsPerAccountLimit.mockReturnValue(null)
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
      if (query.includes("FROM accounts")) return [makeAccount({ account_global_legal_name: "Acme Corp" })]
      if (query.includes("FROM centers")) return [makeCenter({ cn_unique_key: "CN-1" })]
      if (query.includes("FROM services")) return [makeService({ cn_unique_key: "CN-1" })]
      if (query.includes("FROM prospects")) {
        return [
          makeProspect({ account_global_legal_name: "Acme Corp", prospect_full_name: "Ada One" }),
          makeProspect({ account_global_legal_name: "Acme Corp", prospect_full_name: "Ada Two" }),
        ]
      }
      return []
    })
  })

  it("builds selected worksheets and row counts", async () => {
    const result = await buildServerExport({ datasets: ["accounts", "centers"] })
    expect(result.rowCounts).toEqual({ accounts: 1, centers: 1, services: 0, prospects: 0 })
    expect(result.totalRows).toBe(2)
    expect(result.buffer.byteLength).toBeGreaterThan(0)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Accounts", "Centers"])
  })

  it("applies the prospect access limit before writing row counts", async () => {
    mocks.getProspectsPerAccountLimit.mockReturnValue(1)
    const result = await buildServerExport({ datasets: ["prospects"] })
    expect(result.rowCounts.prospects).toBe(1)
    expect(result.totalRows).toBe(1)
  })

  it("passes precise account, center, and prospect selections into Prisma queries", async () => {
    await buildServerExport({
      datasets: ["accounts", "centers", "services", "prospects"],
      accountNames: ["Acme Corp"],
      centerKeys: ["CN-1"],
      prospectKeys: ["PS-1"],
    })
    expect(mocks.queryRaw).toHaveBeenCalledTimes(4)
    expect(mocks.queryRaw.mock.calls.map(([strings]) => String(strings))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SELECT * FROM accounts WHERE account_global_legal_name = ANY"),
        expect.stringContaining("SELECT * FROM centers WHERE cn_unique_key = ANY"),
        expect.stringContaining("cn_unique_key = ANY"),
        expect.stringContaining("ps_unique_key = ANY"),
      ])
    )
  })

  it("targets selected keyless prospects by composite row id instead of account fallback", async () => {
    await buildServerExport({
      datasets: ["prospects"],
      accountNames: ["Acme Corp"],
      keylessProspectIds: ["Acme Corp::Ada One::Head of Ops|Ops|Bengaluru"],
    })

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const query = strings.join(" ")
    expect(query).toContain("ps_unique_key IS NULL")
    expect(query).toContain("CONCAT(")
    expect(query).not.toContain("account_global_legal_name = ANY")
    expect(values).toContainEqual(["Acme Corp::Ada One::Head of Ops|Ops|Bengaluru"])
    expect(values).not.toContainEqual(["Acme Corp"])
  })

  it("builds empty selection (no names, no keys) for services and prospects", async () => {
    await buildServerExport({
      datasets: ["services", "prospects"],
    })
    // queryRaw is used for linked child tables that are intentionally not
    // modelled as Prisma relations in the read-only BI warehouse.
    const queryStrings = mocks.queryRaw.mock.calls.map(([strings]) => String(strings))
    expect(queryStrings).toContainEqual(expect.stringContaining("SELECT * FROM services ORDER BY center_name"))
    expect(queryStrings).toContainEqual(expect.stringContaining("SELECT * FROM prospects ORDER BY prospect_last_name, prospect_first_name"))
  })

  it("builds prospect query with both prospectKeys and keylessProspectIds", async () => {
    await buildServerExport({
      datasets: ["prospects"],
      prospectKeys: ["PS-1"],
      keylessProspectIds: ["id1"],
    })
    const queryStrings = mocks.queryRaw.mock.calls.map(([strings]) => String(strings))
    expect(queryStrings).toContainEqual(expect.stringContaining("ps_unique_key = ANY"))
  })

  it("builds prospect query with only prospectKeys", async () => {
    await buildServerExport({
      datasets: ["prospects"],
      prospectKeys: ["PS-1"],
    })
    const queryStrings = mocks.queryRaw.mock.calls.map(([strings]) => String(strings))
    expect(queryStrings).toContainEqual(expect.stringContaining("SELECT * FROM prospects WHERE ps_unique_key = ANY"))
  })

  it("builds prospect query with only accountNames", async () => {
    await buildServerExport({
      datasets: ["prospects"],
      accountNames: ["Acme Corp"],
    })
    const queryStrings = mocks.queryRaw.mock.calls.map(([strings]) => String(strings))
    expect(queryStrings).toContainEqual(expect.stringContaining("SELECT * FROM prospects WHERE account_global_legal_name = ANY"))
  })

  describe("export by filters (#249 Phase 4)", () => {
    beforeEach(() => {
      mocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
        if (q.text.includes("from services")) return [makeService({ cn_unique_key: "CN-1" })]
        if (q.text.includes("from prospects")) return [makeProspect({ account_global_legal_name: "Acme Corp" })]
        if (q.text.includes("from centers")) return [makeCenter({ cn_unique_key: "CN-1" })]
        if (q.text.includes("from accounts")) return [makeAccount({ account_global_legal_name: "Acme Corp" })]
        return []
      })
    })

    const FILTERS = {
      accountVisibilityMode: "all",
      centerCityValues: [{ value: "Bengaluru", mode: "include" }],
    } as unknown as import("@/lib/types").Filters

    it("fetches every dataset through the filter engine and ignores key lists", async () => {
      const result = await buildServerExport({
        datasets: ["accounts", "centers", "services", "prospects"],
        accountNames: ["Should Be Ignored"],
        filters: { ...(await import("@/lib/dashboard/defaults")).createDefaultFilters(FILTERS) },
        access: {},
      })

      expect(mocks.queryRaw).not.toHaveBeenCalled()
      expect(mocks.queryWarehouse).toHaveBeenCalledTimes(4)
      const texts = mocks.queryWarehouse.mock.calls.map(([q]) => (q as { text: string }).text)
      expect(texts).toContainEqual(expect.stringContaining("select * from accounts"))
      expect(texts).toContainEqual(expect.stringContaining("select * from centers"))
      // Services come from the surviving centers subquery.
      expect(texts).toContainEqual(expect.stringContaining("select * from services where cn_unique_key in ("))
      expect(texts).toContainEqual(expect.stringContaining("select * from prospects"))
      // The Bengaluru filter parameter flows into every query.
      for (const [q] of mocks.queryWarehouse.mock.calls) {
        expect((q as { values: unknown[] }).values.flat()).toContain("Bengaluru")
      }
      expect(result.rowCounts).toEqual({ accounts: 1, centers: 1, services: 1, prospects: 1 })
    })

    it("normalizes string bigint revenue from the HTTP driver", async () => {
      mocks.queryWarehouse.mockImplementation(async (q: { text: string }) =>
        q.text.includes("from accounts")
          ? [{ ...makeAccount({ account_global_legal_name: "Acme Corp" }), account_hq_revenue: "12000000000" }]
          : []
      )
      const result = await buildServerExport({
        datasets: ["accounts"],
        filters: (await import("@/lib/dashboard/defaults")).createDefaultFilters(FILTERS),
        access: {},
      })
      expect(result.rowCounts.accounts).toBe(1)

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(result.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
      const sheet = workbook.getWorksheet("Accounts")!
      const headerRow = sheet.getRow(1).values as unknown[]
      const revenueCol = headerRow.indexOf("account_hq_revenue")
      expect(sheet.getRow(2).getCell(revenueCol).value).toBe(12000000000)
    })
  })
})
