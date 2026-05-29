import { describe, expect, it } from "vitest"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import type { Prospect } from "@/lib/types"

function makeProspect(account: string, overrides: Partial<Prospect> = {}): Prospect {
  return {
    account_global_legal_name: account,
    center_name: null,
    prospect_full_name: null,
    prospect_first_name: null,
    prospect_last_name: null,
    prospect_title: null,
    prospect_department: null,
    prospect_level: null,
    prospect_linkedin_url: null,
    prospect_email: null,
    prospect_city: null,
    prospect_state: null,
    prospect_country: null,
    ...overrides,
  } as Prospect
}

describe("partitionProspectsByAccess", () => {
  it("returns everything visible when the limit is null", () => {
    const prospects = [makeProspect("Acme"), makeProspect("Acme")]
    const result = partitionProspectsByAccess(prospects, null)
    expect(result.visibleProspects).toHaveLength(2)
    expect(result.lockedProspectTeasers).toHaveLength(0)
  })

  it("locks every prospect when the limit is zero", () => {
    const prospects = [makeProspect("Acme"), makeProspect("Beta")]
    const result = partitionProspectsByAccess(prospects, 0)
    expect(result.visibleProspects).toHaveLength(0)
    expect(result.lockedProspectTeasers).toHaveLength(2)
    expect(result.lockedProspectTeasers[0]).toMatchObject({ locked: true, account_global_legal_name: "Acme" })
  })

  it("treats a negative limit the same as zero", () => {
    const result = partitionProspectsByAccess([makeProspect("Acme")], -3)
    expect(result.visibleProspects).toHaveLength(0)
    expect(result.lockedProspectTeasers).toHaveLength(1)
  })

  it("keeps up to the limit visible per account and locks the rest", () => {
    const prospects = [
      makeProspect("Acme", { prospect_full_name: "A1" }),
      makeProspect("Acme", { prospect_full_name: "A2" }),
      makeProspect("Acme", { prospect_full_name: "A3" }),
    ]
    const result = partitionProspectsByAccess(prospects, 2)
    expect(result.visibleProspects.map((p) => p.prospect_full_name)).toEqual(["A1", "A2"])
    expect(result.lockedProspectTeasers).toHaveLength(1)
  })

  it("tracks the per-account limit independently across accounts", () => {
    const prospects = [
      makeProspect("Acme"),
      makeProspect("Acme"),
      makeProspect("Beta"),
      makeProspect("Beta"),
    ]
    const result = partitionProspectsByAccess(prospects, 1)
    expect(result.visibleProspects).toHaveLength(2)
    expect(result.lockedProspectTeasers).toHaveLength(2)
    expect(result.visibleProspects.map((p) => p.account_global_legal_name)).toEqual(["Acme", "Beta"])
  })

  it("carries teaser fields over and gives each locked teaser a distinct id", () => {
    const prospects = [
      makeProspect("Acme", { prospect_department: "Eng", prospect_level: "C-Level" }),
      makeProspect("Acme", { prospect_department: "Sales", prospect_level: "VP" }),
    ]
    const result = partitionProspectsByAccess(prospects, 1)
    const teaser = result.lockedProspectTeasers[0]
    expect(teaser.prospect_department).toBe("Sales")
    expect(teaser.prospect_level).toBe("VP")
    const ids = result.lockedProspectTeasers.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
