import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { resolveAuthenticatedUserId, extractBearerToken, __clearAuthCachesForTests } from "@/lib/auth/server"
import { createClient } from "@supabase/supabase-js"

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}))

describe("auth server", () => {
  describe("extractBearerToken", () => {
    it("returns null if authHeader is null", () => {
      expect(extractBearerToken(null)).toBeNull()
    })

    it("returns null if authHeader doesn't start with Bearer", () => {
      expect(extractBearerToken("Basic abc")).toBeNull()
      expect(extractBearerToken("Bearer")).toBeNull()
    })

    it("returns token correctly", () => {
      expect(extractBearerToken("Bearer valid-token")).toBe("valid-token")
    })
  })

  describe("resolveAuthenticatedUserId", () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
      vi.clearAllMocks()
      __clearAuthCachesForTests()
    })

    afterEach(() => {
      process.env = originalEnv
      vi.useRealTimers()
    })

    it("throws if token is missing", async () => {
      await expect(resolveAuthenticatedUserId("")).rejects.toThrow("Missing access token.")
      await expect(resolveAuthenticatedUserId("   ")).rejects.toThrow("Missing access token.")
    })

    it("throws if environment variables are missing", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ""
      await expect(resolveAuthenticatedUserId("token")).rejects.toThrow("Supabase environment variables are not configured.")
      
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ""
      await expect(resolveAuthenticatedUserId("token")).rejects.toThrow("Supabase environment variables are not configured.")
    })

    it("throws if authentication fails", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: { message: "Invalid" }, data: {} })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await expect(resolveAuthenticatedUserId("token")).rejects.toThrow("Authentication failed.")
    })
    
    it("throws if data.user.id is missing", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: null, data: { user: {} } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await expect(resolveAuthenticatedUserId("token")).rejects.toThrow("Authentication failed.")
    })

    it("returns user id on success", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: null, data: { user: { id: "user-123" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      const id = await resolveAuthenticatedUserId("token")
      expect(id).toBe("user-123")
      expect(mockGetUser).toHaveBeenCalledWith("token")
    })

    it("caches a successful validation and skips Supabase on repeat calls", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: null, data: { user: { id: "user-123" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await expect(resolveAuthenticatedUserId("token")).resolves.toBe("user-123")
      await expect(resolveAuthenticatedUserId("token")).resolves.toBe("user-123")
      expect(mockGetUser).toHaveBeenCalledTimes(1)
    })

    it("shares one Supabase call between concurrent validations of the same token", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: null, data: { user: { id: "user-123" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      // A page load fires several data requests at once with the same token.
      const results = await Promise.all(Array.from({ length: 5 }, () => resolveAuthenticatedUserId("token")))
      expect(results).toEqual(Array(5).fill("user-123"))
      expect(mockGetUser).toHaveBeenCalledTimes(1)
    })

    it("does not cache a failed validation, even a shared one", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi
        .fn()
        .mockResolvedValueOnce({ error: new Error("bad"), data: { user: null } })
        .mockResolvedValue({ error: null, data: { user: { id: "user-123" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      const attempts = await Promise.allSettled([resolveAuthenticatedUserId("token"), resolveAuthenticatedUserId("token")])
      expect(attempts.every((a) => a.status === "rejected")).toBe(true)
      await expect(resolveAuthenticatedUserId("token")).resolves.toBe("user-123")
      expect(mockGetUser).toHaveBeenCalledTimes(2)
    })

    it("re-validates after the token cache TTL expires", async () => {
      vi.useFakeTimers()
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: null, data: { user: { id: "user-123" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await resolveAuthenticatedUserId("token")
      vi.advanceTimersByTime(61_000)
      await resolveAuthenticatedUserId("token")
      expect(mockGetUser).toHaveBeenCalledTimes(2)
    })

    it("does not cache failed validations", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi.fn().mockResolvedValue({ error: { message: "Invalid" }, data: {} })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await expect(resolveAuthenticatedUserId("bad-token")).rejects.toThrow("Authentication failed.")
      await expect(resolveAuthenticatedUserId("bad-token")).rejects.toThrow("Authentication failed.")
      expect(mockGetUser).toHaveBeenCalledTimes(2)
    })

    it("caches per token, not globally", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "url"
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key"

      const mockGetUser = vi
        .fn()
        .mockResolvedValueOnce({ error: null, data: { user: { id: "user-1" } } })
        .mockResolvedValueOnce({ error: null, data: { user: { id: "user-2" } } })
      ;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })

      await expect(resolveAuthenticatedUserId("token-a")).resolves.toBe("user-1")
      await expect(resolveAuthenticatedUserId("token-b")).resolves.toBe("user-2")
      expect(mockGetUser).toHaveBeenCalledTimes(2)
    })
  })
})
