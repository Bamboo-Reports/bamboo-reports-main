/**
 * Warehouse (Neon) data fetch benchmark for the dashboard read path.
 *
 * Calls the same lib functions the API routes call (computeSummary,
 * computeFacets, computeCharts, queryEntity, the centers map query) straight
 * against the Neon warehouse. No auth, no rate limit, no cache (the bench
 * config sets DASHBOARD_CACHE_TTL_MS=0), so the numbers are the pure query
 * cost plus the network round trip. Runs are sequential (one query in flight
 * at a time) so timings are not skewed by contention.
 *
 * Run: npm run bench
 *
 * Env (read from .env, or set inline):
 *   DATABASE_URL       required
 *   BENCH_ITERATIONS   timed runs per endpoint per scenario (default 5)
 *   BENCH_OUT          optional path to write the raw results as JSON (in ms)
 */
import { writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { it } from "vitest"
import { config as loadEnv } from "dotenv"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { computeCharts, computeFacets, computeSummary } from "@/lib/dashboard/dashboard-core"
import { queryEntity } from "@/lib/dashboard/entity-query"
import { buildCentersMapQuery } from "@/lib/dashboard/centers-map"
import { queryWarehouse } from "@/lib/db/warehouse"

loadEnv({ quiet: true })

const ITERATIONS = Math.max(1, Number.parseInt(process.env.BENCH_ITERATIONS ?? "", 10) || 5)

// ---------------------------------------------------------------------------
// Scenarios: raw wire filters, as the client sends them in `{ filters }`,
// run through parseFilters exactly like the routes do.
// ---------------------------------------------------------------------------

type Scenario = { name: string; filters: Record<string, unknown> }

/**
 * Default state, the broad "all accounts" state (historically the slowest),
 * plus two narrow states built from the most common values in the live data so
 * they always match real rows.
 */
async function buildScenarios(): Promise<Scenario[]> {
  const scenarios: Scenario[] = [
    { name: "default", filters: {} },
    { name: "visibility=all", filters: { accountVisibilityMode: "all" } },
  ]

  const top = async (table: string, column: string): Promise<string | null> => {
    const rows = await queryWarehouse<{ v: string }>({
      text: `select ${column} as v from ${table} where coalesce(${column}, '') <> '' group by 1 order by count(*) desc limit 1`,
      values: [],
    })
    return rows[0]?.v ?? null
  }
  const country = await top("accounts", "account_hq_country")
  const department = await top("prospects", "prospect_department")
  if (country) {
    scenarios.push({ name: `country=${country}`, filters: { accountHqCountryValues: [{ value: country, mode: "include" }] } })
  }
  if (department) {
    scenarios.push({
      name: `prospect dept=${department}`,
      filters: { prospectDepartmentValues: [{ value: department, mode: "include" }] },
    })
  }
  return scenarios
}

// ---------------------------------------------------------------------------
// Targets: the warehouse work behind each dashboard read endpoint.
// ---------------------------------------------------------------------------

type Target = {
  name: string
  fetch: (filters: Record<string, unknown>) => Promise<unknown>
}

const access = resolveAccess()

const TARGETS: Target[] = [
  {
    name: "summary",
    fetch: (filters) => computeSummary(parseFilters(filters), access),
  },
  {
    name: "facets",
    fetch: (filters) => computeFacets(parseFilters(filters), access),
  },
  {
    name: "charts",
    fetch: (filters) => computeCharts(parseFilters(filters), access),
  },
  {
    name: "centers map",
    fetch: (filters) => queryWarehouse(buildCentersMapQuery(parseFilters(filters), access)),
  },
  ...(["accounts", "centers", "prospects"] as const).map(
    (entity): Target => ({
      name: `${entity} page 1`,
      fetch: (filters) => queryEntity(entity, parseFilters(filters), access, { page: 1 }),
    })
  ),
]

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

type Sample = { ms: number; bytes: number; gzipBytes: number }
type Result = { scenario: string; target: string; samples: Sample[]; error?: string }

const results: Result[] = []

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/** Timing stats in seconds. */
function stats(samples: Sample[]) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b)
  const avg = ms.reduce((a, b) => a + b, 0) / (ms.length || 1)
  return {
    avg: avg / 1000,
    p50: percentile(ms, 50) / 1000,
    p95: percentile(ms, 95) / 1000,
    min: (ms[0] ?? 0) / 1000,
    max: (ms[ms.length - 1] ?? 0) / 1000,
  }
}

function secs(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function payloadSample(ms: number, json: string): Sample {
  return { ms, bytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).byteLength }
}

function log(line = "") {
  process.stdout.write(line + "\n")
}

/** Box-drawn table with padded columns. Numeric columns are right-aligned. */
function renderTable(headers: string[], rows: string[][], rightAlign: Set<number>): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  const cell = (text: string, i: number) => (rightAlign.has(i) ? text.padStart(widths[i]) : text.padEnd(widths[i]))
  const line = (l: string, m: string, r: string) => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r
  const row = (cells: string[]) => "│" + cells.map((c, i) => ` ${cell(c, i)} `).join("│") + "│"
  const out = [line("┌", "┬", "┐"), row(headers), line("├", "┼", "┤")]
  rows.forEach((r, idx) => {
    // Rule between scenarios so each group reads as a block.
    if (idx > 0 && r[0] !== "" && rows[idx - 1][0] !== r[0]) out.push(line("├", "┼", "┤"))
    out.push(row(r))
  })
  out.push(line("└", "┴", "┘"))
  return out.join("\n")
}

function printTable() {
  log(`\nResults in seconds (${ITERATIONS} run${ITERATIONS === 1 ? "" : "s"} each)\n`)
  const headers = ["scenario", "endpoint", "avg", "p50", "p95", "min", "max", "payload", "gzip"]
  const rows = results.map((r) => {
    if (r.error) return [r.scenario, r.target, "error", "", "", "", "", "", r.error.slice(0, 60)]
    const s = stats(r.samples)
    const last = r.samples[r.samples.length - 1]
    const size = (n: number | undefined) => (n ? formatBytes(n) : "-")
    return [r.scenario, r.target, secs(s.avg), secs(s.p50), secs(s.p95), secs(s.min), secs(s.max), size(last?.bytes), size(last?.gzipBytes)]
  })
  log(renderTable(headers, rows, new Set([2, 3, 4, 5, 6, 7, 8])))
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

async function run(scenarios: Scenario[]) {
  // First query pays any Neon compute wake-up; report it separately.
  let t = performance.now()
  await queryWarehouse({ text: "select 1", values: [] })
  const wake = (performance.now() - t) / 1000
  log(`warehouse first query: ${secs(wake)}${wake > 2 ? " (compute was likely suspended)" : ""}`)

  const floor: Sample[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    t = performance.now()
    await queryWarehouse({ text: "select 1", values: [] })
    floor.push({ ms: performance.now() - t, bytes: 0, gzipBytes: 0 })
  }
  results.push({ scenario: "-", target: "select 1 (network floor)", samples: floor })

  for (const scenario of scenarios) {
    for (const target of TARGETS) {
      const result: Result = { scenario: scenario.name, target: target.name, samples: [] }
      try {
        for (let i = 0; i < ITERATIONS; i++) {
          const start = performance.now()
          const value = await target.fetch(scenario.filters)
          result.samples.push(payloadSample(performance.now() - start, JSON.stringify(value)))
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
      }
      results.push(result)
      const s = stats(result.samples)
      log(`  ${scenario.name} / ${target.name}: ${result.error ? `error: ${result.error}` : `avg ${secs(s.avg)}, p95 ${secs(s.p95)}`}`)
    }
  }
}

// ---------------------------------------------------------------------------

it("warehouse data fetch benchmark", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

  const scenarios = await buildScenarios()
  log(`\niterations: ${ITERATIONS}, scenarios: ${scenarios.map((s) => s.name).join(", ")}`)

  await run(scenarios)
  printTable()

  if (process.env.BENCH_OUT) {
    writeFileSync(
      process.env.BENCH_OUT,
      JSON.stringify({ ranAt: new Date().toISOString(), iterations: ITERATIONS, results }, null, 2)
    )
    log(`\nraw results written to ${process.env.BENCH_OUT}`)
  }
})
