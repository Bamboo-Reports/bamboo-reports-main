import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildAccountSummaryContext } from "@/lib/ai/account-summary-context"
import { makeAccount, makeCenter, makeProspect, makeService, makeTech } from "../fixtures/domain"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  centerFindMany: vi.fn(),
  queryRaw: vi.fn(),
  getProspectsPerAccountLimit: vi.fn(),
  isSectionEnabled: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: () => ({
    accountWarehouse: { findUnique: mocks.accountFindUnique },
    centerWarehouse: { findMany: mocks.centerFindMany },
    $queryRaw: mocks.queryRaw,
  }),
  queryWithRetry: (fn: () => Promise<unknown>) => fn(),
}))

vi.mock("@/lib/config/dashboard-access", () => ({
  getProspectsPerAccountLimit: () => mocks.getProspectsPerAccountLimit(),
  isSectionEnabled: (section: string) => mocks.isSectionEnabled(section),
}))

describe("account summary context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProspectsPerAccountLimit.mockReturnValue(1)
    mocks.isSectionEnabled.mockReturnValue(true)
    mocks.accountFindUnique.mockResolvedValue(makeAccount({
      account_about: "A verified account description.",
      account_hq_key_offerings: "Cloud\nSecurity",
      account_center_employees: 750,
    }))
    mocks.centerFindMany.mockResolvedValue([
      makeCenter({ cn_unique_key: "CN-1", center_city: "Bengaluru", center_employees: 400 }),
      makeCenter({ cn_unique_key: "CN-2", center_city: "Bengaluru", center_employees: 300 }),
    ])
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
      if (query.includes("FROM services")) return [makeService({ primary_service: "Product Engineering" })]
      if (query.includes("FROM functions")) return [{ cn_unique_key: "CN-1", function_name: "Engineering" }]
      if (query.includes("FROM tech")) return [makeTech({ software_category: "CRM", software_vendor: "Salesforce" })]
      if (query.includes("FROM prospects")) {
        return [
          makeProspect({ prospect_full_name: "Private One", prospect_email: "one@example.com", prospect_department: "Engineering" }),
          makeProspect({ prospect_full_name: "Private Two", prospect_email: "two@example.com", prospect_department: "Engineering" }),
        ]
      }
      return []
    })
  })

  it("builds exact aggregate facts without prospect identities", async () => {
    const result = await buildAccountSummaryContext("Acme Corp")

    expect(result).toMatchObject({
      account: {
        name: "Acme Corp",
        keyOfferings: ["Cloud", "Security"],
      },
      centers: {
        total: 2,
        knownHeadcount: 700,
        byCity: [{ name: "Bengaluru", count: 2 }],
      },
      prospects: {
        visibleCount: 1,
        restrictedCount: 1,
        byDepartment: [{ name: "Engineering", count: 2 }],
      },
    })
    expect(JSON.stringify(result)).not.toContain("Private One")
    expect(JSON.stringify(result)).not.toContain("one@example.com")
  })

  it("excludes disabled center and prospect datasets", async () => {
    mocks.isSectionEnabled.mockImplementation((section: string) => section === "accounts")

    const result = await buildAccountSummaryContext("Acme Corp")

    expect(result?.centers).toBeNull()
    expect(result?.services).toBeNull()
    expect(result?.prospects).toBeNull()
    expect(mocks.centerFindMany).not.toHaveBeenCalled()
  })

  it("returns null when the account does not exist", async () => {
    mocks.accountFindUnique.mockResolvedValue(null)
    await expect(buildAccountSummaryContext("Missing")).resolves.toBeNull()
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})
