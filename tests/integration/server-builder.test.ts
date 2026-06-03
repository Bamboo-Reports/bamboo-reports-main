import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildServerExport } from "@/lib/exports/server-builder"
import { makeAccount, makeCenter, makeProspect, makeService } from "../fixtures/domain"

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  centerFindMany: vi.fn(),
  queryRaw: vi.fn(),
  getProspectsPerAccountLimit: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: () => ({
    accountWarehouse: { findMany: mocks.accountFindMany },
    centerWarehouse: { findMany: mocks.centerFindMany },
    $queryRaw: mocks.queryRaw,
  }),
}))

vi.mock("@/lib/config/dashboard-access", () => ({
  getProspectsPerAccountLimit: () => mocks.getProspectsPerAccountLimit(),
}))

describe("server export builder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProspectsPerAccountLimit.mockReturnValue(null)
    mocks.accountFindMany.mockResolvedValue([makeAccount({ account_global_legal_name: "Acme Corp" })])
    mocks.centerFindMany.mockResolvedValue([makeCenter({ cn_unique_key: "CN-1" })])
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
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
    expect(mocks.accountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { account_global_legal_name: { in: ["Acme Corp"] } },
    }))
    expect(mocks.centerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { cn_unique_key: { in: ["CN-1"] } },
    }))
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2)
    expect(mocks.queryRaw.mock.calls.map(([strings]) => String(strings))).toEqual(
      expect.arrayContaining([
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
})
