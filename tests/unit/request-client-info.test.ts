import { describe, expect, it } from "vitest"
import { getClientInfo } from "@/lib/request/client-info"

function makeRequest(headers: Record<string, string>): Request {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as Request
}

describe("getClientInfo", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" })
    const info = getClientInfo(req)
    expect(info.ip).toBe("203.0.113.1")
  })

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const req = makeRequest({ "x-real-ip": "203.0.113.2" })
    const info = getClientInfo(req)
    expect(info.ip).toBe("203.0.113.2")
  })

  it("falls back to cf-connecting-ip when others are missing", () => {
    const req = makeRequest({ "cf-connecting-ip": "203.0.113.3" })
    const info = getClientInfo(req)
    expect(info.ip).toBe("203.0.113.3")
  })

  it("returns null IP when no headers are present", () => {
    const req = makeRequest({})
    const info = getClientInfo(req)
    expect(info.ip).toBeNull()
  })

  it("extracts user-agent header", () => {
    const req = makeRequest({ "user-agent": "Mozilla/5.0" })
    const info = getClientInfo(req)
    expect(info.userAgent).toBe("Mozilla/5.0")
  })

  it("returns null user-agent when header is missing", () => {
    const req = makeRequest({})
    const info = getClientInfo(req)
    expect(info.userAgent).toBeNull()
  })

  it("combines both IP and user-agent", () => {
    const req = makeRequest({
      "x-forwarded-for": "203.0.113.1",
      "user-agent": "curl/7.68",
    })
    const info = getClientInfo(req)
    expect(info.ip).toBe("203.0.113.1")
    expect(info.userAgent).toBe("curl/7.68")
  })
})
