import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getUnreadRecordSummaries,
  getUnreadSummaries,
} from "@/app/actions/notifications"

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  resolveAuthenticatedUserId: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  resolveAuthenticatedUserId: mocks.resolveAuthenticatedUserId,
}))

vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: () => ({
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
  }),
  queryWithRetry: <T>(fn: () => Promise<T>) => fn(),
}))

describe("notification SQL actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
  })

  it("limits notification summary labels inside SQL", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        table_name: "accounts",
        change_type: "updated",
        record_count: 12,
        record_labels: ["A", "B", "C", "D", "E"],
        latest_changed_at: "2026-06-01T10:00:00.000Z",
      },
    ])

    const result = await getUnreadSummaries({ accessToken: "token-1" })

    expect(result.success).toBe(true)
    expect(result.data[0]?.record_labels).toEqual(["A", "B", "C", "D", "E"])
    const [strings] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray]
    const query = strings.join("?")
    expect(query).toContain("unread_records AS")
    expect(query).toContain("LIMIT 5")
    expect(query).not.toContain("ARRAY_AGG(r.record_label ORDER BY r.latest_changed_at DESC)")
  })

  it("returns cursor pagination metadata for unread record summaries", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        record_key: "record-a",
        record_uuid: null,
        record_identity: "record-a",
        record_label: "Record A",
        unread_count: 2,
        latest_changed_at: "2026-06-01T10:00:00.000Z",
      },
      {
        record_key: "record-b",
        record_uuid: null,
        record_identity: "record-b",
        record_label: "Record B",
        unread_count: 1,
        latest_changed_at: "2026-06-01T09:00:00.000Z",
      },
      {
        record_key: "record-c",
        record_uuid: null,
        record_identity: "record-c",
        record_label: "Record C",
        unread_count: 1,
        latest_changed_at: "2026-06-01T08:00:00.000Z",
      },
    ])

    const result = await getUnreadRecordSummaries({
      accessToken: "token-1",
      tableName: "accounts",
      limit: 2,
      cursorChangedAt: "2026-06-01T11:00:00.000Z",
      cursorRecordKey: "record-0",
    })

    expect(result.success).toBe(true)
    expect(result.data.map((row) => row.record_key)).toEqual(["record-a", "record-b"])
    expect(result.nextCursor).toEqual({
      changedAt: "2026-06-01T09:00:00.000Z",
      recordKey: "record-b",
    })
    const [strings, ...values] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const query = strings.join("?")
    expect(query).toContain("ORDER BY latest_changed_at DESC, record_key ASC")
    expect(query).toContain("record_key >")
    expect(values).toContain(3)
    expect(values).toContain("2026-06-01T11:00:00.000Z")
    expect(values).toContain("record-0")
  })
})
