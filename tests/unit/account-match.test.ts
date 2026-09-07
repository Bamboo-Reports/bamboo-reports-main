import { describe, expect, it } from "vitest"
import {
  buildAccountMatchIndex,
  matchAccountList,
  normalizeAccountKey,
  parseMatchRequestNames,
  MAX_MATCH_NAMES,
} from "@/lib/accounts/account-match"

const accounts = [
  { name: "Infosys Limited", visibility: "include", visibility_note: null },
  { name: "Tata Consultancy Services", visibility: "include", visibility_note: null },
  { name: "Globex Corporation", visibility: "exclude", visibility_note: "Non-GCC" },
  { name: "Acme Inc", visibility: "include", visibility_note: null },
  { name: "Acme Ltd", visibility: "include", visibility_note: null },
  { name: "Wayne Enterprises", visibility: null, visibility_note: null },
]
const aliases = [
  { account_global_legal_name: "Tata Consultancy Services", abbreviated_name: "TCS", brand_name: null, short_legal_name: null, currently_known_as: null },
  { account_global_legal_name: "Globex Corporation", abbreviated_name: "GBX", brand_name: "Globex", short_legal_name: null, currently_known_as: null },
]
const index = buildAccountMatchIndex(accounts, aliases)

describe("normalizeAccountKey", () => {
  it("strips the article, legal suffixes and punctuation", () => {
    expect(normalizeAccountKey("The Infosys Ltd.")).toBe("infosys")
    expect(normalizeAccountKey("Acme Pvt. Ltd")).toBe("acme")
    expect(normalizeAccountKey("Johnson & Co")).toBe("johnson")
    expect(normalizeAccountKey("A.B.C. Corp")).toBe("abc")
  })

  it("keeps distinguishing words like group", () => {
    expect(normalizeAccountKey("Adani Group")).toBe("adanigroup")
  })
})

describe("matchAccountList", () => {
  it("matches exact names case-insensitively", () => {
    const [r] = matchAccountList(["infosys limited"], index)
    expect(r.status).toBe("matched")
    expect(r.match).toMatchObject({ name: "Infosys Limited", via: "name" })
  })

  it("matches alias values and reports the alias", () => {
    const [r] = matchAccountList(["tcs"], index)
    expect(r.status).toBe("matched")
    expect(r.match).toMatchObject({ name: "Tata Consultancy Services", via: "alias", aliasValue: "TCS" })
  })

  it("matches on the normalized key when the suffix differs", () => {
    const [r] = matchAccountList(["Infosys Ltd"], index)
    expect(r.status).toBe("matched")
    expect(r.match).toMatchObject({ name: "Infosys Limited", via: "normalized" })
  })

  it("asks for review when the normalized key is ambiguous", () => {
    const [r] = matchAccountList(["Acme"], index)
    expect(r.status).toBe("review")
    expect(r.match).toBeNull()
    expect(r.candidates.map((c) => c.name).sort()).toEqual(["Acme Inc", "Acme Ltd"])
  })

  it("offers fuzzy candidates instead of auto-matching partial names", () => {
    const [r] = matchAccountList(["Wayne Enterprises India"], index)
    expect(r.status).toBe("review")
    expect(r.match).toBeNull()
    expect(r.candidates[0]).toMatchObject({ name: "Wayne Enterprises", via: "fuzzy" })
  })

  it("reports not found when nothing resembles the name", () => {
    const [r] = matchAccountList(["Zzyzx Quantum"], index)
    expect(r).toEqual({ input: "Zzyzx Quantum", status: "not_found", match: null, candidates: [] })
  })

  it("carries visibility through to the candidate", () => {
    const [r] = matchAccountList(["Globex"], index)
    expect(r.match?.visibility).toEqual({ visibility: "exclude", note: "Non-GCC" })
  })
})

describe("parseMatchRequestNames", () => {
  it("trims, drops blanks and rejects bad shapes", () => {
    expect(parseMatchRequestNames({ names: [" Infosys ", "", "TCS"] })).toEqual({ names: ["Infosys", "TCS"] })
    expect(parseMatchRequestNames({})).toMatchObject({ error: expect.any(String) })
    expect(parseMatchRequestNames({ names: [] })).toMatchObject({ error: expect.any(String) })
    expect(parseMatchRequestNames({ names: [1] })).toMatchObject({ error: expect.any(String) })
    expect(parseMatchRequestNames({ names: Array(MAX_MATCH_NAMES + 1).fill("x") })).toMatchObject({ error: expect.any(String) })
    expect(parseMatchRequestNames({ names: ["x".repeat(201)] })).toMatchObject({ error: expect.any(String) })
  })
})
