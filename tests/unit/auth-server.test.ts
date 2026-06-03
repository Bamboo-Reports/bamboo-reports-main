import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { resolveAuthenticatedUserId, extractBearerToken } from "@/lib/auth/server"
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
    })

    afterEach(() => {
      process.env = originalEnv
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
  })
})
