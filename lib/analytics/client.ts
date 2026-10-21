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
let hasWarnedMissingKey = false

const shouldEnableAnalytics = () =>
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"

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

// Production stays a silent no-op without a key; development says so loudly
const warnIfKeyMissing = () => {
  if (
    hasWarnedMissingKey ||
    process.env.NODE_ENV === "production" ||
    !shouldEnableAnalytics() ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY
  ) {
    return
  }
  hasWarnedMissingKey = true
  console.error(
    "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured"
  )
}

export const initAnalytics = () => {
  if (!isAnalyticsEnabled() || isInitialized) {
    warnIfKeyMissing()
    return
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    // "/ingest" is proxied to PostHog by next.config.mjs so ad blockers do not drop events
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    person_profiles: "identified_only",
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
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

  // Super properties ride on every event so dashboards can split by deploy
  const appVersion = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  posthog.register({
    app_env: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    ...(appVersion ? { app_version: appVersion } : {}),
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
  role,
  firstName,
  lastName,
}: {
  id: string
  email?: string | null
  authProvider?: string
  role?: string | null
  firstName?: string | null
  lastName?: string | null
}) => {
  if (!id || !isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  const emailDomain = email?.split("@")[1] ?? null
  const name = [firstName, lastName].filter(Boolean).join(" ").trim()
  const now = new Date().toISOString()

  posthog.identify(
    id,
    {
      ...(email ? { email } : {}),
      ...(emailDomain ? { email_domain: emailDomain } : {}),
      ...(authProvider ? { auth_provider: authProvider } : {}),
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      last_seen_at: now,
    },
    { first_seen_at: now }
  )
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

export const captureError = (error: unknown, properties: Record<string, unknown> = {}) => {
  if (!isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  posthog.captureException(error, {
    ...sanitizeProperties(analyticsContext as Record<string, unknown>),
    ...sanitizeProperties(properties),
    session_id: ensureAnalyticsSession(),
  })
}
