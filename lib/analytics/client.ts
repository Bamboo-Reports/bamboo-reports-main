"use client"

import posthog from "posthog-js"
import type { AnalyticsEventName } from "@/lib/analytics/events"

const SESSION_STORAGE_KEY = "br.analytics.session_id"
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "token",
  "secret",
  "credit",
  "card",
  "ssn",
  "phone",
  "address",
  "email",
]
const SAFE_KEYS = new Set(["email_domain"])

type AnalyticsContext = Partial<{
  screen: "accounts" | "centers" | "prospects"
  screen_view: "chart" | "data" | "map"
  active_filters_count: number
  filtered_accounts_count: number
  filtered_centers_count: number
  filtered_prospects_count: number
  is_filtered: boolean
}>

let analyticsContext: AnalyticsContext = {}
let isInitialized = false

const shouldEnableAnalytics = () =>
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"

const shouldEnablePostHogExtensions = () =>
  process.env.NEXT_PUBLIC_POSTHOG_ENABLE_RECORDING === "true"

const isAnalyticsEnabled = () =>
  typeof window !== "undefined" &&
  shouldEnableAnalytics() &&
  Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

const isSensitiveKey = (key: string) => {
  const normalized = key.toLowerCase()
  if (SAFE_KEYS.has(normalized)) {
    return false
  }
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern))
}

const sanitizeProperties = (properties: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => !isSensitiveKey(key) && value !== undefined)
  )

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const initAnalytics = () => {
  if (!isAnalyticsEnabled() || isInitialized) {
    return
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    capture_dead_clicks: shouldEnablePostHogExtensions(),
    disable_session_recording: !shouldEnablePostHogExtensions(),
    before_send: (event) => {
      if (!event || typeof event !== "object") {
        return event
      }

      const currentProperties =
        event && "properties" in event && typeof event.properties === "object" && event.properties !== null
          ? (event.properties as Record<string, unknown>)
          : {}

      const mergedProperties: Record<string, unknown> = {
        ...sanitizeProperties(analyticsContext as Record<string, unknown>),
        ...currentProperties,
      }

      if (!mergedProperties.session_id) {
        mergedProperties.session_id = ensureAnalyticsSession()
      }

      return {
        ...event,
        properties: mergedProperties,
      }
    },
    loaded: (client) => {
      if (process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true") {
        client.debug()
      }
    },
  })

  isInitialized = true
}

export const ensureAnalyticsSession = () => {
  if (typeof window === "undefined") {
    return ""
  }

  const current = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (current) {
    return current
  }

  const created = createSessionId()
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, created)
  return created
}

export const clearAnalyticsSession = () => {
  if (typeof window === "undefined") {
    return
  }
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export const setAnalyticsContext = (context: AnalyticsContext) => {
  analyticsContext = {
    ...analyticsContext,
    ...context,
  }
}

export const clearAnalyticsContext = () => {
  analyticsContext = {}
}

export const identifyUser = ({
  id,
  email,
  authProvider,
}: {
  id: string
  email?: string | null
  authProvider?: string
}) => {
  if (!id || !isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  const emailDomain = email?.split("@")[1] ?? null

  posthog.identify(id, {
    ...(email ? { email } : {}),
    ...(emailDomain ? { email_domain: emailDomain } : {}),
    ...(authProvider ? { auth_provider: authProvider } : {}),
    last_seen_at: new Date().toISOString(),
  })
}

export const resetAnalytics = () => {
  if (!isAnalyticsEnabled()) {
    return
  }

  posthog.reset()
  clearAnalyticsSession()
  clearAnalyticsContext()
}

export const captureEvent = (event: AnalyticsEventName, properties: Record<string, unknown> = {}) => {
  if (!isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  posthog.capture(event, {
    ...sanitizeProperties(analyticsContext as Record<string, unknown>),
    ...sanitizeProperties(properties),
    session_id: ensureAnalyticsSession(),
    timestamp: new Date().toISOString(),
  })
}

export const capturePageView = (url: string) => {
  if (!isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  posthog.capture("$pageview", {
    $current_url: url,
    session_id: ensureAnalyticsSession(),
  })
}
