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
  })
})
