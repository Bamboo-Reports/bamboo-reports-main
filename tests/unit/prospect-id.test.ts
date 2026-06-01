import { describe, expect, it } from "vitest"
import { getProspectDisplayName, getProspectRecordId } from "@/lib/dashboard/prospect-id"
import type { Prospect } from "@/lib/types"

function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    account_global_legal_name: "Acme Corp",
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
  }
}

describe("getProspectDisplayName", () => {
  it("prefers the full name when present", () => {
    const p = makeProspect({ prospect_full_name: "Ada Lovelace", prospect_first_name: "Ada", prospect_last_name: "L" })
    expect(getProspectDisplayName(p)).toBe("Ada Lovelace")
  })

  it("falls back to first + last name", () => {
    const p = makeProspect({ prospect_first_name: "Grace", prospect_last_name: "Hopper" })
    expect(getProspectDisplayName(p)).toBe("Grace Hopper")
  })

  it("uses whichever name part exists", () => {
    expect(getProspectDisplayName(makeProspect({ prospect_first_name: "Grace" }))).toBe("Grace")
    expect(getProspectDisplayName(makeProspect({ prospect_last_name: "Hopper" }))).toBe("Hopper")
  })

  it("falls back to 'Unknown Prospect' when no name is available", () => {
    expect(getProspectDisplayName(makeProspect())).toBe("Unknown Prospect")
  })
})

describe("getProspectRecordId", () => {
  it("uses ps_unique_key when present", () => {
    const p = makeProspect({ ps_unique_key: "PS-123", prospect_full_name: "Ada Lovelace" })
    expect(getProspectRecordId(p)).toBe("PS-123")
  })

  it("builds an account::name::email composite when the key is missing", () => {
    const p = makeProspect({
      prospect_full_name: "Ada Lovelace",
      prospect_email: "ada@acme.com",
    })
    expect(getProspectRecordId(p)).toBe("Acme Corp::Ada Lovelace::ada@acme.com")
  })

  it("uses the LinkedIn URL as the discriminator when there is no email", () => {
    const p = makeProspect({
      prospect_full_name: "Ada Lovelace",
      prospect_linkedin_url: "https://linkedin.com/in/ada",
    })
    expect(getProspectRecordId(p)).toBe("Acme Corp::Ada Lovelace::https://linkedin.com/in/ada")
  })

  it("falls back to title|department|city when there is no email or LinkedIn", () => {
    const p = makeProspect({
      prospect_full_name: "Ada Lovelace",
      prospect_title: "CTO",
      prospect_department: "Engineering",
      prospect_city: "London",
    })
    expect(getProspectRecordId(p)).toBe("Acme Corp::Ada Lovelace::CTO|Engineering|London")
  })

  it("does not serialize a null account as the literal 'null'", () => {
    const p = makeProspect({ prospect_full_name: "Ada Lovelace", prospect_email: "ada@acme.com" })
    // Real data can carry a null account even though the type says string.
    const withNullAccount = { ...p, account_global_legal_name: null as unknown as string }
    const id = getProspectRecordId(withNullAccount)
    expect(id.startsWith("null::")).toBe(false)
    expect(id).toBe("::Ada Lovelace::ada@acme.com")
  })

  it("gives two distinct keyless prospects distinct ids (regression for the collision fix)", () => {
    const base = { account_global_legal_name: "Acme Corp", prospect_full_name: "John Smith" }
    const a = makeProspect({ ...base, prospect_email: "john.smith@one.com" })
    const b = makeProspect({ ...base, prospect_email: "john.smith@two.com" })
    expect(getProspectRecordId(a)).not.toBe(getProspectRecordId(b))
  })
})
