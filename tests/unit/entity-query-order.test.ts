import { describe, expect, it } from "vitest"
import { resolveOrder } from "@/lib/dashboard/entity-query"
import { buildCentersQuery } from "@/lib/dashboard/filtering-sql"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

/**
 * Paginated queries run one statement per page, so a non-total ORDER BY lets
 * tied rows come back in a different order per page: a row can appear on two
 * pages while another never appears at all. Every ordering must therefore end in
 * a tiebreak that is unique per row.
 *
 * Text columns sort in classes (symbols, then digits, then letters) via
 * textOrder; this helper mirrors its expected output.
 */
const textOrder = (column: string, direction: "asc" | "desc") =>
  `case when ${column} is null then 1 else 0 end asc, ` +
  `case when ${column} ~ '^[0-9]' then 1 when ${column} ~ '^[a-zA-Z]' then 2 else 0 end ${direction}, ` +
  `lower(${column}) collate "C" ${direction}, ${column} ${direction}`

describe("resolveOrder", () => {
  it("appends the center key to the default center_name order", () => {
    expect(resolveOrder("centers", undefined)).toBe(`${textOrder("center_name", "asc")}, cn_unique_key asc`)
  })

  it("appends the center key to a user-chosen sort", () => {
    expect(resolveOrder("centers", { column: "center_city", direction: "desc" })).toBe(
      `${textOrder("center_city", "desc")}, cn_unique_key asc`
    )
  })

  it("classes text sorts as symbols, then digits, then letters, nulls last", () => {
    const order = resolveOrder("centers", { column: "center_city", direction: "asc" })
    // Nulls are forced last independently of direction.
    expect(order).toContain("case when center_city is null then 1 else 0 end asc")
    // Class ranks: digit-leading 1, letter-leading 2, everything else (symbols) 0.
    expect(order).toContain("case when center_city ~ '^[0-9]' then 1 when center_city ~ '^[a-zA-Z]' then 2 else 0 end asc")
    // Within a class, byte-order collation on the lowercased value.
    expect(order).toContain('lower(center_city) collate "C" asc')
  })

  it("keeps native numeric ordering for numeric columns", () => {
    expect(resolveOrder("accounts", { column: "account_hq_revenue", direction: "desc" })).toBe(
      "account_hq_revenue desc nulls last, account_global_legal_name asc"
    )
    expect(resolveOrder("centers", { column: "center_employees", direction: "asc" })).toBe(
      "center_employees asc nulls last, cn_unique_key asc"
    )
  })

  it("does not repeat a sort column that is already the tiebreak", () => {
    expect(resolveOrder("accounts", undefined)).toBe(textOrder("account_global_legal_name", "asc"))
    expect(resolveOrder("accounts", { column: "account_global_legal_name", direction: "asc" })).toBe(
      textOrder("account_global_legal_name", "asc")
    )
  })

  it("falls back to the default order for an unknown or non-string sort column", () => {
    expect(resolveOrder("accounts", { column: "drop table accounts", direction: "asc" })).toBe(
      textOrder("account_global_legal_name", "asc")
    )
    expect(resolveOrder("accounts", { column: 7, direction: "asc" })).toBe(
      textOrder("account_global_legal_name", "asc")
    )
  })

  it("breaks prospect ties on the ETL row identity, since prospects have no key", () => {
    // ps_unique_key is nullable and non-unique (see the keyless-prospect
    // handling in lib/exports/server-builder.ts), so it cannot stand alone.
    const order = resolveOrder("prospects", { column: "prospect_title", direction: "asc" })
    expect(order).toBe(
      `${textOrder("prospect_title", "asc")}, ps_unique_key asc, prospect_email asc, prospect_full_name asc, ` +
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
    expect(q.text).toContain(`order by ${textOrder("center_state", "asc")}, cn_unique_key asc`)
  })
})
