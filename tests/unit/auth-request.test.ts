import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((h: string | null) => (h?.startsWith("Bearer ") ? h.slice(7) : null)),
  resolveAuthenticatedUserId: vi.fn(async (token: string) => {
    if (token === "good") return "user-1"
    throw new Error("bad token")
  }),
}))
vi.mock("@/lib/auth/server", () => authMocks)

import { authenticateRequest } from "@/lib/auth/request"

const request = (authorization?: string) =>
  new Request("http://localhost/api/x", { headers: authorization ? { authorization } : {} })

describe("authenticateRequest", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the user for a valid token", async () => {
    expect(await authenticateRequest(request("Bearer good"))).toEqual({ userId: "user-1" })
    expect(authMocks.resolveAuthenticatedUserId).toHaveBeenCalledWith("good")
  })

  it("rejects a missing token without checking it", async () => {
    const res = await authenticateRequest(request())
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(401)
    expect((res as Response).headers.get("Content-Type")).toBe("application/json")
    expect(await (res as Response).json()).toEqual({ error: "Missing authorization token" })
    expect(authMocks.resolveAuthenticatedUserId).not.toHaveBeenCalled()
  })

  it("rejects an invalid or expired token", async () => {
    const res = (await authenticateRequest(request("Bearer bad"))) as Response
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Invalid or expired token" })
  })
})
