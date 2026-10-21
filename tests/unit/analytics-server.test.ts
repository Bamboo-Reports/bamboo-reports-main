import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SERVER_ANALYTICS_EVENTS } from "@/lib/analytics/events"

const { captureImmediate, PostHogMock, afterMock } = vi.hoisted(() => {
  const captureImmediate = vi.fn(async (_message: unknown) => undefined)
  const PostHogMock = vi.fn(function PostHog(this: { captureImmediate: typeof captureImmediate }) {
    this.captureImmediate = captureImmediate
  })
  // Run after() callbacks inline so the test can await the capture
  const afterMock = vi.fn((task: () => Promise<void>) => {
    void task()
  })
  return { captureImmediate, PostHogMock, afterMock }
})

vi.mock("posthog-node", () => ({ PostHog: PostHogMock }))
vi.mock("next/server", () => ({ after: afterMock }))

// The module caches its client, so load a fresh copy per test
const loadServerAnalytics = async () => {
  vi.resetModules()
  return import("@/lib/analytics/server")
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("server analytics", () => {
  beforeEach(() => {
    captureImmediate.mockReset()
    captureImmediate.mockResolvedValue(undefined)
    PostHogMock.mockClear()
    afterMock.mockClear()
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ANALYTICS", "true")
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test")
    vi.stubEnv("VERCEL_ENV", "preview")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is a no-op without a PostHog key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
    const { captureServerEvent } = await loadServerAnalytics()

    captureServerEvent({ distinctId: "user-1", event: SERVER_ANALYTICS_EVENTS.EXPORT_DOWNLOADED })
    await flush()

    expect(afterMock).not.toHaveBeenCalled()
    expect(PostHogMock).not.toHaveBeenCalled()
    expect(captureImmediate).not.toHaveBeenCalled()
  })

  it("is a no-op when analytics is disabled outside production", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ANALYTICS", "")
    const { captureServerEvent } = await loadServerAnalytics()

    captureServerEvent({ distinctId: "user-1", event: SERVER_ANALYTICS_EVENTS.EXPORT_DOWNLOADED })
    await flush()

    expect(captureImmediate).not.toHaveBeenCalled()
  })

  it("captures with the distinct id, event and enriched properties", async () => {
    const { captureServerEvent } = await loadServerAnalytics()

    captureServerEvent({
      distinctId: "user-1",
      event: SERVER_ANALYTICS_EVENTS.EXPORT_GENERATED,
      properties: { export_id: "exp-1", total_rows: 42 },
    })
    await flush()

    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(PostHogMock).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 })
    )
    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "export_generated",
      properties: {
        export_id: "exp-1",
        total_rows: 42,
        app_env: "preview",
        source: "server",
      },
    })
  })

  it("swallows capture errors", async () => {
    captureImmediate.mockRejectedValueOnce(new Error("network down"))
    const { captureServerEvent } = await loadServerAnalytics()

    expect(() =>
      captureServerEvent({ distinctId: "user-1", event: SERVER_ANALYTICS_EVENTS.FINANCIALS_SERVED })
    ).not.toThrow()
    await flush()

    expect(captureImmediate).toHaveBeenCalledTimes(1)
  })

  it("falls back to sending directly when after() is unavailable", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("after() called outside a request scope")
    })
    const { captureServerEvent } = await loadServerAnalytics()

    captureServerEvent({ distinctId: "user-1", event: SERVER_ANALYTICS_EVENTS.ENGAGEMENTS_SERVED })
    await flush()

    expect(captureImmediate).toHaveBeenCalledTimes(1)
  })
})
