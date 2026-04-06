import { neon } from "@neondatabase/serverless"
import { gzipSync } from "node:zlib"

// ============================================
// CONFIG
// ============================================

const ITERATIONS = 3
const API_URL = process.env.API_URL || "http://localhost:3000"

const QUERIES = [
  { name: "accounts", sql: "SELECT * FROM accounts ORDER BY account_global_legal_name" },
  { name: "centers", sql: "SELECT * FROM centers ORDER BY center_name" },
  { name: "functions", sql: "SELECT * FROM functions ORDER BY cn_unique_key" },
  { name: "services", sql: "SELECT * FROM services ORDER BY center_name" },
  { name: "tech", sql: "SELECT * FROM tech ORDER BY account_global_legal_name, software_category, software_in_use" },
  { name: "prospects", sql: "SELECT * FROM prospects ORDER BY prospect_last_name, prospect_first_name" },
]

// ============================================
// HELPERS
// ============================================

async function fetchWithRetry(fn, retries, delay) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)))
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + "B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB"
  return (bytes / 1024 / 1024).toFixed(1) + "MB"
}

// ============================================
// BENCHMARK: Direct DB queries
// ============================================

async function runDirectDB(sqlClient) {
  const totalStart = performance.now()

  const results = await Promise.all(
    QUERIES.map(async (q) => {
      const start = performance.now()
      const rows = await fetchWithRetry(() => sqlClient.query(q.sql), 2, 500)
      return {
        name: q.name,
        durationMs: Math.round(performance.now() - start),
        rowCount: rows.length,
        payloadBytes: JSON.stringify(rows).length,
      }
    })
  )

  const total = Math.round(performance.now() - totalStart)
  return { queries: results, total }
}

// ============================================
// BENCHMARK: API route fetch
// ============================================

async function runAPIRoute() {
  const start = performance.now()
  const res = await fetch(`${API_URL}/api/dashboard`, {
    headers: { "Accept-Encoding": "gzip, deflate, br" },
  })

  if (!res.ok) throw new Error(`API returned ${res.status}`)

  const rawBody = await res.arrayBuffer()
  const transferBytes = rawBody.byteLength
  const jsonStr = new TextDecoder().decode(rawBody)
  const data = JSON.parse(jsonStr)
  const total = Math.round(performance.now() - start)

  const contentEncoding = res.headers.get("content-encoding") || "none"

  return { total, transferBytes, rawBytes: jsonStr.length, data, contentEncoding }
}

// ============================================
// MAIN
// ============================================

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Run with: node --env-file=.env scripts/benchmark-loading.mjs")
    process.exit(1)
  }

  const sqlClient = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } })

  console.log("=== DASHBOARD LOADING BENCHMARK ===\n")

  // --- Warmup DB ---
  const warmupStart = performance.now()
  await sqlClient`SELECT 1`
  const warmupMs = Math.round(performance.now() - warmupStart)
  console.log(`DB Warmup: ${warmupMs}ms ${warmupMs > 2000 ? "(cold start)" : "(warm)"}\n`)

  // =============================================
  // PART 1: Direct DB queries
  // =============================================
  console.log("=== PART 1: Direct DB Queries ===\n")

  const dbResults = []
  for (let i = 0; i < ITERATIONS; i++) {
    process.stdout.write(`  Iteration ${i + 1}/${ITERATIONS}...`)
    const result = await runDirectDB(sqlClient)
    dbResults.push(result)
    console.log(` ${result.total}ms`)
  }

  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  const dbAvgTotal = avg(dbResults.map((r) => r.total))

  console.log("\n  Per-query averages:")
  console.log("  Table        | Time     | Rows   | Raw Size")
  console.log("  -------------|----------|--------|----------")

  let totalRawPayload = 0
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const name = QUERIES[qi].name.padEnd(12)
    const avgTime = avg(dbResults.map((r) => r.queries[qi].durationMs))
    const rows = dbResults[0].queries[qi].rowCount
    const payload = avg(dbResults.map((r) => r.queries[qi].payloadBytes))
    totalRawPayload += payload
    console.log(`  ${name} | ${String(avgTime).padStart(5)}ms  | ${String(rows).padStart(6)} | ${formatBytes(payload)}`)
  }
  console.log(`\n  DB query total: ${dbAvgTotal}ms avg`)
  console.log(`  Raw JSON payload: ${formatBytes(totalRawPayload)}`)

  // Simulate gzip compression
  const allData = {}
  for (let qi = 0; qi < QUERIES.length; qi++) {
    const rows = await sqlClient.query(QUERIES[qi].sql)
    allData[QUERIES[qi].name] = rows
  }
  const fullJson = JSON.stringify(allData)
  const gzipped = gzipSync(Buffer.from(fullJson))
  console.log(`  Gzip'd payload: ${formatBytes(gzipped.length)} (${((1 - gzipped.length / fullJson.length) * 100).toFixed(0)}% compression)`)

  // =============================================
  // PART 2: API Route
  // =============================================
  console.log("\n=== PART 2: API Route (/api/dashboard) ===\n")

  let apiAvailable = true
  try {
    const check = await fetch(`${API_URL}/api/dashboard`, { method: "HEAD" }).catch(() => null)
    if (!check || !check.ok) throw new Error()
  } catch {
    apiAvailable = false
    console.log(`  Server not running at ${API_URL}`)
    console.log(`  Start with: npm run dev (or npm run build && npm start for gzip)\n`)
  }

  if (apiAvailable) {
    const apiResults = []
    for (let i = 0; i < ITERATIONS; i++) {
      process.stdout.write(`  Iteration ${i + 1}/${ITERATIONS}...`)
      const result = await runAPIRoute()
      apiResults.push(result)
      console.log(` ${result.total}ms (transfer: ${formatBytes(result.transferBytes)}, encoding: ${result.contentEncoding})`)
    }

    const apiAvgTotal = avg(apiResults.map((r) => r.total))
    const apiAvgTransfer = avg(apiResults.map((r) => r.transferBytes))

    console.log(`\n  API route total: ${apiAvgTotal}ms avg`)
    console.log(`  Transfer size: ${formatBytes(apiAvgTransfer)}`)
    console.log(`  Content-Encoding: ${apiResults[0].contentEncoding}`)

    // =============================================
    // COMPARISON
    // =============================================
    console.log("\n=== COMPARISON ===\n")
    console.log("  Metric              | Direct DB    | API Route    | Diff")
    console.log("  --------------------|--------------|--------------|--------")
    console.log(`  Query/fetch time    | ${String(dbAvgTotal).padStart(8)}ms   | ${String(apiAvgTotal).padStart(8)}ms   | ${apiAvgTotal - dbAvgTotal > 0 ? "+" : ""}${apiAvgTotal - dbAvgTotal}ms`)
    console.log(`  Raw payload         | ${formatBytes(totalRawPayload).padStart(10)}   | ${formatBytes(totalRawPayload).padStart(10)}   | same`)
    console.log(`  Transfer size       | ${formatBytes(totalRawPayload).padStart(10)}   | ${formatBytes(apiAvgTransfer).padStart(10)}   | -${((1 - apiAvgTransfer / totalRawPayload) * 100).toFixed(0)}%`)
    console.log(`  Gzip estimate       | ${formatBytes(gzipped.length).padStart(10)}   |      --      | (simulated)`)

    if (apiResults[0].contentEncoding === "none") {
      console.log("\n  NOTE: No compression detected. You're likely running 'next dev'.")
      console.log("  For gzip, run: npm run build && npm run start")
      console.log(`  Expected transfer with gzip: ~${formatBytes(gzipped.length)} (vs ${formatBytes(totalRawPayload)} raw)`)
    }
  } else {
    // Show estimates even without server
    console.log("  --- Estimated Comparison (based on gzip simulation) ---\n")
    console.log("  Scenario            | Transfer Size | Est. Time")
    console.log("  --------------------|---------------|----------")
    console.log(`  Server Action (raw) | ${formatBytes(totalRawPayload).padStart(11)}   | ~20-25s (current)`)
    console.log(`  API Route (gzip'd)  | ${formatBytes(gzipped.length).padStart(11)}   | ~${Math.round(dbAvgTotal / 1000 + 2)}-${Math.round(dbAvgTotal / 1000 + 4)}s (estimated)`)
    console.log(`  Compression ratio   | -${((1 - gzipped.length / fullJson.length) * 100).toFixed(0)}%`)
  }
}

main().catch(console.error)
