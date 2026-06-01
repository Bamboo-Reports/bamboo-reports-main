import { describe, expect, it } from "vitest"
import { aliasSearchText, buildAliasMap, findAliasMatch } from "@/lib/search/alias-utils"
import { makeAlias } from "../fixtures/domain"

describe("alias utilities", () => {
  it("groups aliases by lower-cased account name and skips empty account names", () => {
    const map = buildAliasMap([
      makeAlias({ uuid: "1", account_global_legal_name: "Acme Corp" }),
      makeAlias({ uuid: "2", account_global_legal_name: "ACME CORP" }),
      makeAlias({ uuid: "3", account_global_legal_name: "" }),
    ])
    expect(map.get("acme corp")).toHaveLength(2)
    expect(map.has("")).toBe(false)
  })

  it("builds lower-cased searchable text from all alias fields", () => {
    expect(aliasSearchText([makeAlias()])).toContain("acme cloud")
    expect(aliasSearchText([makeAlias()])).toContain("roadrunner")
    expect(aliasSearchText([])).toBe("")
  })

  it("returns the first matching alias field in configured priority order", () => {
    const match = findAliasMatch([makeAlias({ brand_name: "Acme Cloud", abbreviated_name: "ACM" })], "acm")
    expect(match).toEqual({ field: "abbreviated_name", value: "ACM" })
  })

  it("returns null when no alias field matches", () => {
    expect(findAliasMatch([makeAlias()], "missing")).toBeNull()
    expect(findAliasMatch(undefined, "acme")).toBeNull()
    expect(findAliasMatch([makeAlias()], "")).toBeNull()
  })
})
