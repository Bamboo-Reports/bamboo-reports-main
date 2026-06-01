import { describe, expect, it } from "vitest"
import { buildSearchIndex, searchIndex } from "@/lib/search"
import { makeAccount, makeAlias, makeCenter, makeProspect } from "../fixtures/domain"

describe("search index", () => {
  it("does not search until the query has at least two characters", () => {
    const index = buildSearchIndex([makeAccount()], [], [])
    expect(searchIndex(index, "a").total).toBe(0)
  })

  it("indexes accounts, centers, and prospects", () => {
    const index = buildSearchIndex(
      [makeAccount({ account_global_legal_name: "Acme Corp" })],
      [makeCenter({ center_name: "Acme Bengaluru", center_city: "Bengaluru" })],
      [makeProspect({ prospect_full_name: "Ada Lovelace", prospect_title: "CTO" })]
    )
    const result = searchIndex(index, "acme")
    expect(result.total).toBe(3)
    expect(result.accounts.items[0].title).toBe("Acme Corp")
    expect(result.centers.items[0].title).toBe("Acme Bengaluru")
    expect(result.prospects.items[0].title).toBe("Ada Lovelace")
  })

  it("adds alias match metadata when an account is found through an alias", () => {
    const index = buildSearchIndex([makeAccount()], [], [], [makeAlias({ flagship_products: "Roadrunner" })])
    const result = searchIndex(index, "road")
    expect(result.accounts.items[0].matchedAlias).toEqual({
      field: "flagship_products",
      value: "Roadrunner",
    })
  })

  it("caps rendered matches per group at ten while preserving total count", () => {
    const accounts = Array.from({ length: 12 }, (_, index) =>
      makeAccount({ account_global_legal_name: `Acme ${String(index).padStart(2, "0")}` })
    )
    const result = searchIndex(buildSearchIndex(accounts, [], []), "acme")
    expect(result.accounts.items).toHaveLength(10)
    expect(result.accounts.totalMatches).toBe(12)
    expect(result.total).toBe(12)
  })
})
