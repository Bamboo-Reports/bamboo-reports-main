import { describe, expect, it } from "vitest"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { buildCentersMapQuery, buildCityMapQuery, buildStateMapQuery, splitCentersMapRows } from "@/lib/dashboard/centers-map"

describe("centers map query builders", () => {
  it("city query groups by city and mirrors the client skip rules", () => {
    const q = buildCityMapQuery(createDefaultFilters({ accountVisibilityMode: "all" }))
    expect(q.text).toContain("group by center_city")
    expect(q.text).toContain("lat is not null and lng is not null")
    expect(q.text).toContain("center_city is not null and center_city <> ''")
    // First-center-in-name-order semantics for country and coordinates.
    expect(q.text).toContain("array_agg(coalesce(center_country, '') order by center_name asc)")
    expect(q.text).toContain("array_agg(lat order by center_name asc)")
    expect(q.text).toContain("count(distinct account_global_legal_name)")
  })

  it("state query normalizes keys like the client (upper/lower + trim)", () => {
    const q = buildStateMapQuery(createDefaultFilters({ accountVisibilityMode: "all" }))
    expect(q.text).toContain("upper(trim(center_country_iso2)) as country_iso2")
    expect(q.text).toContain("lower(trim(center_state)) as state_key")
    expect(q.text).toContain("group by upper(trim(center_country_iso2)), lower(trim(center_state))")
    // The client only counts non-empty account names for states.
    expect(q.text).toContain("filter (where account_global_legal_name is not null and account_global_legal_name <> '')")
  })

  it("applies the shared filter cascade with parameters", () => {
    const filters = createDefaultFilters({
      accountVisibilityMode: "all",
      centerCityValues: [{ value: "Bengaluru", mode: "include" }],
      accountHqCountryValues: [{ value: "United States", mode: "include" }],
    })
    for (const q of [buildCityMapQuery(filters), buildStateMapQuery(filters)]) {
      expect(q.text).toContain("with ")
      expect(q.values.flat()).toEqual(expect.arrayContaining([["Bengaluru"], ["United States"]].flat()))
    }
  })

  it("combined query unions both groupings over one cascade and splits rows by kind", () => {
    const filters = createDefaultFilters({ accountVisibilityMode: "all", centerCityValues: [{ value: "Bengaluru", mode: "include" }] })
    const q = buildCentersMapQuery(filters)
    expect(q.text.match(/^with /g)).toHaveLength(1)
    expect(q.text.match(/surviving_centers as materialized/g)).toHaveLength(1)
    expect(q.text).toContain("'city' as kind, center_city as key1, null::text as key2")
    expect(q.text).toContain("'state' as kind, upper(trim(center_country_iso2)) as key1")
    expect(q.text).toContain(" union all ")
    // The cascade parameters are bound once, not per branch.
    expect(q.values.filter((v) => Array.isArray(v) && v.includes("Bengaluru"))).toHaveLength(1)

    const split = splitCentersMapRows([
      { kind: "city", key1: "Pune", key2: null, name: "India", lat: 18.5, lng: 73.8, count: 3, accounts_count: 2, headcount: 300 },
      { kind: "state", key1: "IN", key2: "maharashtra", name: "India", lat: null, lng: null, count: 5, accounts_count: 4, headcount: 900 },
    ])
    expect(split.cities).toEqual([{ city: "Pune", country: "India", lat: 18.5, lng: 73.8, count: 3, accounts_count: 2, headcount: 300 }])
    expect(split.states).toEqual([{ country_iso2: "IN", state_key: "maharashtra", country_name: "India", count: 5, accounts_count: 4, headcount: 900 }])
  })
})
