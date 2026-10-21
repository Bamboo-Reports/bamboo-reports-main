import "server-only"

import { after } from "next/server"
import { PostHog } from "posthog-node"
import type { ServerAnalyticsEventName } from "@/lib/analytics/events"
import { createLogger } from "@/lib/logger"

const logger = createLogger("analytics/server")

let client: PostHog | null = null

// Mirrors the browser client: on in production or when explicitly enabled
const isServerAnalyticsEnabled = () =>
  (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true") &&
  Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

// One lazily created client per warm instance. flushAt/flushInterval keep the
// SDK from holding events in a queue a frozen serverless instance never drains.
const getClient = () => {
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      // The browser goes through the /ingest proxy; the server talks to PostHog directly
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      // Server IPs are Vercel regions, not the user's location
      disableGeoip: true,
    })
  }
  return client
}

/**
 * Captures a server-side event for the given Supabase user id (the same id the
 * browser passes to identifyUser). Sent after the response via next/server
 * after(), and never throws: tracking must not break an API route.
 */
export const captureServerEvent = ({
  distinctId,
  event,
  properties = {},
}: {
  distinctId: string
  event: ServerAnalyticsEventName
  properties?: Record<string, unknown>
}) => {
  if (!distinctId || !isServerAnalyticsEnabled()) {
    return
  }

  const send = async () => {
    try {
      await getClient().captureImmediate({
        distinctId,
        event,
        properties: {
          ...properties,
          app_env: process.env.VERCEL_ENV || process.env.NODE_ENV,
          source: "server",
        },
      })
    } catch (error) {
      logger.debug("capture_failed", { event, error })
    }
  }

  try {
    after(send)
  } catch {
    // after() only works inside a request scope; send directly otherwise
    void send()
  }
}
