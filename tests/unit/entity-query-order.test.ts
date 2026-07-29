import { describe, expect, it } from "vitest"
import { resolveOrder } from "@/lib/dashboard/entity-query"
import { buildCentersQuery } from "@/lib/dashboard/filtering-sql"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

/**
 * Paginated queries run one statement per page, so a non-total ORDER BY lets
 * tied rows come back in a different order per page: a row can appear on two
 * pages while another never appears at all. Every ordering must therefore end in
 * a tiebreak that is unique per row.
 */
describe("resolveOrder tiebreak", () => {
  it("appends the center key to the default center_name order", () => {
    expect(resolveOrder("centers", undefined)).toBe("center_name asc, cn_unique_key asc")
  })

  it("appends the center key to a user-chosen sort", () => {
    expect(resolveOrder("centers", { column: "center_city", direction: "desc" })).toBe(
      "center_city desc nulls last, cn_unique_key asc"
    )
  })

  it("does not repeat a sort column that is already the tiebreak", () => {
    expect(resolveOrder("accounts", undefined)).toBe("account_global_legal_name asc")
    expect(resolveOrder("accounts", { column: "account_global_legal_name", direction: "asc" })).toBe(
      "account_global_legal_name asc nulls last"
    )
  })

  it("falls back to the default order for an unknown or non-string sort column", () => {
    expect(resolveOrder("accounts", { column: "drop table accounts", direction: "asc" })).toBe(
      "account_global_legal_name asc"
    )
    expect(resolveOrder("accounts", { column: 7, direction: "asc" })).toBe("account_global_legal_name asc")
  })

  it("breaks prospect ties on the ETL row identity, since prospects have no key", () => {
    // ps_unique_key is nullable and non-unique (see the keyless-prospect
    // handling in lib/exports/server-builder.ts), so it cannot stand alone.
    const order = resolveOrder("prospects", { column: "prospect_title", direction: "asc" })
    expect(order).toBe(
      "prospect_title asc nulls last, ps_unique_key asc, prospect_email asc, prospect_full_name asc, " +
        "prospect_first_name asc, prospect_last_name asc, account_global_legal_name asc"
    )
  })

  it("keeps every ordering total in the emitted SQL", () => {
    const q = buildCentersQuery(createDefaultFilters(), {}, {
      columns: "cn_unique_key",
      orderBy: resolveOrder("centers", { column: "center_state", direction: "asc" }),
      limit: 10,
      offset: 20,
    })
    expect(q.text).toContain("order by center_state asc nulls last, cn_unique_key asc")
  })
})
