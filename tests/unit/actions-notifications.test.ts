import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  getUnreadCount,
  getUnreadSummaries,
  getUnreadRecordSummaries,
  markAllAsRead,
} from "@/app/actions/notifications"
import * as authServer from "@/lib/auth/server"
import * as dbPrisma from "@/lib/db/prisma"

vi.mock("@/lib/auth/server", () => ({
  resolveAuthenticatedUserId: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: vi.fn(),
  queryWithRetry: vi.fn(),
}))

describe("notifications actions error handling and edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getUnreadCount", () => {
    it("returns error response on throw", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce(new Error("Auth failed"))
      const result = await getUnreadCount("token")
      expect(result).toEqual({
        success: false,
        unreadCount: 0,
        error: "Auth failed",
      })
    })

    it("handles non-Error throws", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce("String error")
      const result = await getUnreadCount("token")
      expect(result.error).toBe("Failed to get unread notifications count.")
    })
  })

  describe("getUnreadSummaries", () => {
    it("returns error response on throw", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce(new Error("DB offline"))
      const result = await getUnreadSummaries({ accessToken: "token" })
      expect(result).toEqual({
        success: false,
        data: [],
        error: "DB offline",
      })
    })

    it("handles non-Error throws", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce("String error")
      const result = await getUnreadSummaries({ accessToken: "token" })
      expect(result.error).toBe("Failed to fetch notification summaries.")
    })
  })

  describe("getUnreadRecordSummaries", () => {
    it("returns empty data for invalid table name", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      const result = await getUnreadRecordSummaries({
        accessToken: "token",
        tableName: "invalid_table",
      })
      expect(result).toEqual({ success: true, data: [] })
    })

    it("returns error response on throw", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce(new Error("Some error"))
      const result = await getUnreadRecordSummaries({
        accessToken: "token",
        tableName: "accounts",
      })
      expect(result).toEqual({
        success: false,
        data: [],
        nextCursor: null,
        error: "Some error",
      })
    })

    it("handles non-Error throws", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce("String error")
      const result = await getUnreadRecordSummaries({
        accessToken: "token",
        tableName: "accounts",
      })
      expect(result.error).toBe("Failed to fetch unread record updates.")
    })
  })

  describe("markAllAsRead", () => {
    it("returns error response on throw", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce(new Error("Update failed"))
      const result = await markAllAsRead("token")
      expect(result).toEqual({
        success: false,
        error: "Update failed",
      })
    })

    it("handles non-Error throws", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockRejectedValueOnce("String error")
      const result = await markAllAsRead("token")
      expect(result.error).toBe("Failed to mark all notifications as read.")
    })

    it("marks all as read successfully", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce(undefined)

      const result = await markAllAsRead("token")
      expect(result).toEqual({ success: true })
    })
  })

  describe("happy paths for query functions", () => {
    it("gets unread count successfully", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([{ unread_count: 5 }])

      const result = await getUnreadCount("token")
      expect(result).toEqual({ success: true, unreadCount: 5 })
    })

    it("handles empty unread count result", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([])

      const result = await getUnreadCount("token")
      expect(result).toEqual({ success: true, unreadCount: 0 })
    })

    it("gets unread summaries successfully", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([
        {
          table_name: "accounts",
          change_type: "added",
          record_count: 2,
          record_labels: ["Acme Corp"],
          latest_changed_at: "2024-01-01T00:00:00Z",
        },
      ])

      const result = await getUnreadSummaries({ accessToken: "token" })
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual(expect.objectContaining({
        table_name: "accounts",
        change_type: "added",
        record_labels: ["Acme Corp"],
      }))
    })

    it("gets unread record summaries successfully", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([
        {
          record_key: "rec-1",
          record_uuid: "uuid-1",
          record_identity: "ident-1",
          record_label: "label-1",
          unread_count: 1,
          latest_changed_at: "2024-01-01T00:00:00Z",
        },
      ])

      const result = await getUnreadRecordSummaries({ accessToken: "token", tableName: "accounts", limit: 10, cursorChangedAt: "2024-01-01T00:00:00Z", cursorRecordKey: "prev-key" })
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].record_key).toBe("rec-1")
      expect(result.nextCursor).toBeNull()
    })

    it("returns nextCursor when rows exceed limit", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      
      const mockRows = [
        { record_key: "rec-1", latest_changed_at: "2024-01-01T00:00:00Z", unread_count: 1 },
        { record_key: "rec-2", latest_changed_at: "2024-01-02T00:00:00Z", unread_count: 1 },
        { record_key: "rec-3", latest_changed_at: "2024-01-03T00:00:00Z", unread_count: 1 },
      ]
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce(mockRows)

      const result = await getUnreadRecordSummaries({ accessToken: "token", tableName: "accounts", limit: 2 })
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.nextCursor).toEqual({
        changedAt: "2024-01-02T00:00:00Z",
        recordKey: "rec-2"
      })
    })

    it("normalizes limits and handles empty cursors", async () => {
      vi.mocked(authServer.resolveAuthenticatedUserId).mockResolvedValueOnce("user-1")
      vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
      vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([])

      const result = await getUnreadRecordSummaries({ 
        accessToken: "token", 
        tableName: "accounts", 
        limit: Infinity,
        offset: -5,
        cursorChangedAt: "   ",
        cursorRecordKey: ""
      })
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })
  })
})
