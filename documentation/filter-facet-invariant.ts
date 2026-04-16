import fs from "fs"
import path from "path"

type FilterValue = { value: string; mode: "include" | "exclude" }

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), ".env"))

const { getAllData } = require("../app/actions/data.ts")
const { getAvailableOptions, getFilteredData } = require("../lib/dashboard/filtering.ts")
const { createDefaultFilters } = require("../lib/dashboard/defaults.ts")
const { calculateBaseRanges } = require("../lib/dashboard/ranges.ts")

const OPTION_KEYS = [
  "accountHqRegionValues",
  "accountHqCountryValues",
  "accountHqIndustryValues",
  "accountDataCoverageValues",
  "accountSourceValues",
  "accountTypeValues",
  "accountPrimaryCategoryValues",
  "accountPrimaryNatureValues",
  "accountNasscomStatusValues",
  "accountHqEmployeeRangeValues",
  "accountCenterEmployeesRangeValues",
  "centerTypeValues",
  "centerFocusValues",
  "centerCityValues",
  "centerStateValues",
  "centerCountryValues",
  "centerEmployeesRangeValues",
  "centerStatusValues",
  "functionNameValues",
  "prospectDepartmentValues",
  "prospectHeadTypeValues",
  "prospectLevelValues",
  "prospectCityValues",
] as const

const FACET_CONFIG: Record<string, { list: string; getValue: (r: any) => any }> = {
  accountHqRegionValues: { list: "filteredAccounts", getValue: (r) => r.account_hq_region },
  accountHqCountryValues: { list: "filteredAccounts", getValue: (r) => r.account_hq_country },
  accountHqIndustryValues: { list: "filteredAccounts", getValue: (r) => r.account_hq_industry },
  accountDataCoverageValues: { list: "filteredAccounts", getValue: (r) => r.account_data_coverage },
  accountSourceValues: { list: "filteredAccounts", getValue: (r) => r.account_source },
  accountTypeValues: { list: "filteredAccounts", getValue: (r) => r.account_type },
  accountPrimaryCategoryValues: { list: "filteredAccounts", getValue: (r) => r.account_primary_category },
  accountPrimaryNatureValues: { list: "filteredAccounts", getValue: (r) => r.account_primary_nature },
  accountNasscomStatusValues: { list: "filteredAccounts", getValue: (r) => r.account_nasscom_status },
  accountHqEmployeeRangeValues: { list: "filteredAccounts", getValue: (r) => r.account_hq_employee_range },
  accountCenterEmployeesRangeValues: {
    list: "filteredAccounts",
    getValue: (r) => r.account_center_employees_range || "",
  },
  centerTypeValues: { list: "filteredCenters", getValue: (r) => r.center_type },
  centerFocusValues: { list: "filteredCenters", getValue: (r) => r.center_focus },
  centerCityValues: { list: "filteredCenters", getValue: (r) => r.center_city },
  centerStateValues: { list: "filteredCenters", getValue: (r) => r.center_state },
  centerCountryValues: { list: "filteredCenters", getValue: (r) => r.center_country },
  centerEmployeesRangeValues: { list: "filteredCenters", getValue: (r) => r.center_employees_range },
  centerStatusValues: { list: "filteredCenters", getValue: (r) => r.center_status },
  functionNameValues: { list: "filteredFunctions", getValue: (r) => r.function_name },
  prospectDepartmentValues: { list: "filteredProspects", getValue: (r) => r.prospect_department },
  prospectHeadTypeValues: { list: "filteredProspects", getValue: (r) => r.head_type },
  prospectLevelValues: { list: "filteredProspects", getValue: (r) => r.prospect_level },
  prospectCityValues: { list: "filteredProspects", getValue: (r) => r.prospect_city },
}

const toKey = (v: unknown) => String(v ?? "")

function countsFromRows(rows: any[], valueSelector: (row: any) => any) {
  const m = new Map<string, number>()
  for (const row of rows) {
    const k = toKey(valueSelector(row))
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}

function countsFromOptions(options: Array<{ value: string; count: number }> = []) {
  const m = new Map<string, number>()
  for (const opt of options) {
    m.set(toKey(opt.value), Number(opt.count || 0))
  }
  return m
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) return false
  for (const [k, v] of a.entries()) {
    if (b.get(k) !== v) return false
  }
  return true
}

const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj))
const fv = (value: string): FilterValue[] => [{ value, mode: "include" }]
const randInt = (max: number) => Math.floor(Math.random() * max)
const pick = <T,>(arr: T[]) => (arr.length ? arr[randInt(arr.length)] : null)

function randomRange(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [min, max]
  const span = max - min
  const a = min + Math.random() * span * 0.7
  const b = a + Math.random() * (max - a)
  return [Math.floor(a), Math.ceil(b)]
}

async function main() {
  const all = await getAllData()
  if (all.error) {
    console.error("DATA_LOAD_ERROR", all.error)
    process.exit(1)
  }

  const { accounts, centers, functions, services, prospects, tech } = all
  const ranges = calculateBaseRanges(accounts, centers)

  const baseFilters = createDefaultFilters({
    accountHqRevenueRange: [ranges.revenueRange.min, ranges.revenueRange.max],
    accountYearsInIndiaRange: [ranges.yearsInIndiaRange.min, ranges.yearsInIndiaRange.max],
    centerIncYearRange: [ranges.centerIncYearRange.min, ranges.centerIncYearRange.max],
  })

  const baselineOptions = getAvailableOptions(accounts, centers, functions, prospects, tech, baseFilters)

  const optionValues: Record<string, string[]> = {}
  for (const key of OPTION_KEYS) {
    optionValues[key] = (baselineOptions[key] || [])
      .map((o: { value: string }) => o.value)
      .filter((v: string) => v && v.trim().length > 0)
  }

  const allSoftware = [...new Set(tech.map((t: any) => (t.software_in_use || "").trim()).filter(Boolean))]
  const allAccountNames = [
    ...new Set(accounts.map((a: any) => (a.account_global_legal_name || "").trim()).filter(Boolean)),
  ]
  const allTitles = [...new Set(prospects.map((p: any) => (p.prospect_title || "").trim()).filter(Boolean))]

  const scenarios: Array<{ name: string; filters: any }> = [{ name: "baseline", filters: baseFilters }]

  for (let i = 1; i <= 30; i++) {
    const f = clone(baseFilters)

    const keysToSet = OPTION_KEYS.filter(() => Math.random() < 0.22)
    for (const key of keysToSet) {
      const v = pick(optionValues[key])
      if (v) f[key] = fv(v)
    }

    if (Math.random() < 0.28) {
      const name = pick(allAccountNames)
      if (name) f.accountGlobalLegalNameKeywords = fv(name.slice(0, Math.min(6, name.length)))
    }

    if (Math.random() < 0.28) {
      const title = pick(allTitles)
      if (title) f.prospectTitleKeywords = fv(title.slice(0, Math.min(6, title.length)))
    }

    if (Math.random() < 0.28) {
      const sw = pick(allSoftware)
      if (sw) f.techSoftwareInUseKeywords = fv(sw.slice(0, Math.min(6, sw.length)))
    }

    if (Math.random() < 0.4) {
      const [r0, r1] = randomRange(ranges.revenueRange.min, ranges.revenueRange.max)
      f.accountHqRevenueRange = [r0, r1]
      f.accountHqRevenueIncludeNull = Math.random() < 0.5
    }

    if (Math.random() < 0.4) {
      const [y0, y1] = randomRange(ranges.yearsInIndiaRange.min, ranges.yearsInIndiaRange.max)
      f.accountYearsInIndiaRange = [y0, y1]
      f.yearsInIndiaIncludeNull = Math.random() < 0.5
    }

    if (Math.random() < 0.4) {
      const [c0, c1] = randomRange(ranges.centerIncYearRange.min, ranges.centerIncYearRange.max)
      f.centerIncYearRange = [c0, c1]
      f.centerIncYearIncludeNull = Math.random() < 0.5
    }

    scenarios.push({ name: `random_${i}`, filters: f })
  }

  const failures: any[] = []

  for (const scenario of scenarios) {
    const actual = getAvailableOptions(accounts, centers, functions, prospects, tech, scenario.filters)

    for (const key of OPTION_KEYS) {
      const facetFilters = clone(scenario.filters)
      facetFilters[key] = []

      const expectedData = getFilteredData(accounts, centers, functions, services, prospects, tech, facetFilters)
      const cfg = FACET_CONFIG[key]
      const expectedCounts = countsFromRows(expectedData[cfg.list], cfg.getValue)
      const actualCounts = countsFromOptions(actual[key])

      if (!mapsEqual(expectedCounts, actualCounts)) {
        failures.push({
          scenario: scenario.name,
          key,
          expectedSize: expectedCounts.size,
          actualSize: actualCounts.size,
          expectedRows: expectedData[cfg.list].length,
        })
      }
    }
  }

  if (failures.length) {
    console.error(`FAILED: ${failures.length} invariant violations`)
    console.error("Sample:", failures.slice(0, 12))
    process.exit(2)
  }

  console.log(`PASS: ${OPTION_KEYS.length} facets validated across ${scenarios.length} scenarios`)
}

main().catch((e) => {
  console.error("SMOKE_ERROR", e)
  process.exit(99)
})
