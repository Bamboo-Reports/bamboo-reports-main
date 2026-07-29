import { describe, expect, it } from "vitest"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { buildCentersQuery } from "@/lib/dashboard/filtering-sql"

/**
 * `x not in (subquery)` is never true once the subquery yields a single NULL,
 * so an unguarded software-exclude filter silently returns zero centers whenever
 * the tech table holds a keyless row. The client engine skips those rows
 * (buildCenterSoftwareIndex in lib/dashboard/filtering.ts) and the SQL must too.
 *
 * This is asserted on the query text rather than by running it: pg-mem, which
 * backs the parity suites, does not implement Postgres's three-valued NOT IN
 * (it returns the rows Postgres filters out), so it cannot reproduce the bug.
 */
describe("software exclude is null-safe", () => {
  const query = (mode: "include" | "exclude") =>
    buildCentersQuery(
      createDefaultFilters({ techSoftwareInUseKeywords: [{ value: "oracle", mode }] }),
      {},
      { columns: "cn_unique_key", orderBy: null }
    ).text

  it("guards the NOT IN subquery against keyless tech rows", () => {
    expect(query("exclude")).toContain(
      "cn_unique_key not in (select cn_unique_key from tech where cn_unique_key is not null and ("
    )
  })

  it("keeps the keyword predicate grouped so the null guard does not swallow an OR", () => {
    // `... where k is not null and a or b` would parse as `(k is not null and a) or b`.
    const text = buildCentersQuery(
      createDefaultFilters({
        techSoftwareInUseKeywords: [
          { value: "oracle", mode: "exclude" },
          { value: "sap", mode: "exclude" },
        ],
      }),
      {},
      { columns: "cn_unique_key", orderBy: null }
    ).text
    expect(text).toMatch(/cn_unique_key is not null and \(software_in_use ilike \$\d+ or software_in_use ilike \$\d+\)\)/)
  })

  it("leaves the include branch as a plain IN", () => {
    expect(query("include")).toContain("cn_unique_key in (select cn_unique_key from tech where software_in_use ilike")
  })
})
