import { beforeEach, describe, expect, it, vi } from "vitest"

// The Neon HTTP driver is mocked: `query` returns a tagged statement and
// `transaction` resolves one result per statement, so the test sees exactly
// what queryWarehouse sends.
const neonMocks = vi.hoisted(() => {
  const query = vi.fn((text: string, values?: unknown[]) => ({ text, values }))
  const transaction = vi.fn(async (statements: Array<{ text: string }>) =>
    statements.map((s) => (s.text.startsWith("select") ? [{ n: 1 }] : []))
  )
  return { query, transaction, neon: vi.fn(() => Object.assign(query, { query, transaction })) }
})

vi.mock("@neondatabase/serverless", () => ({ neon: neonMocks.neon }))

import { queryWarehouse, WAREHOUSE_STATEMENT_TIMEOUT_MS } from "@/lib/db/warehouse"

describe("queryWarehouse", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host/db")
    neonMocks.query.mockClear()
    neonMocks.transaction.mockClear()
  })

  it("runs each query in a read-only transaction with a statement timeout", async () => {
    const rows = await queryWarehouse({ text: "select 1 as n where $1 = any($2::text[])", values: ["a", ["a"]] })

    expect(rows).toEqual([{ n: 1 }])
    expect(neonMocks.transaction).toHaveBeenCalledTimes(1)
    const [statements, opts] = neonMocks.transaction.mock.calls[0] as unknown as [Array<{ text: string; values?: unknown[] }>, unknown]
    expect(statements).toEqual([
      { text: `set local statement_timeout = ${WAREHOUSE_STATEMENT_TIMEOUT_MS}`, values: undefined },
      { text: "select 1 as n where $1 = any($2::text[])", values: ["a", ["a"]] },
    ])
    expect(opts).toEqual({ readOnly: true })
  })

  it("stops queries before the 60s serverless limit", () => {
    expect(WAREHOUSE_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(WAREHOUSE_STATEMENT_TIMEOUT_MS).toBeLessThan(60_000)
  })
})
