"use client"

import {
  LogLevel,
  StatsigClient,
  type PrecomputedEvaluationsInterface,
  type StatsigPlugin,
  type StatsigUser,
} from "@statsig/js-client"
import { StatsigSessionReplayPlugin } from "@statsig/session-replay"
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics"
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
let client: StatsigClient | null = null

const shouldEnableAnalytics = () =>
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"

const shouldEnableSessionReplay = () =>
  process.env.NEXT_PUBLIC_STATSIG_ENABLE_RECORDING === "true"

const isAnalyticsEnabled = () =>
  typeof window !== "undefined" &&
  shouldEnableAnalytics() &&
  Boolean(process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY)

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

// Statsig event metadata only accepts string values
const toStatsigMetadata = (properties: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
  )

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const initAnalytics = () => {
  if (!isAnalyticsEnabled() || client) {
    return
  }

  const plugins: StatsigPlugin<PrecomputedEvaluationsInterface>[] = [new StatsigAutoCapturePlugin()]
  if (shouldEnableSessionReplay()) {
    plugins.push(new StatsigSessionReplayPlugin())
  }

  client = new StatsigClient(
    process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY as string,
    {},
    {
      environment: { tier: process.env.NODE_ENV === "production" ? "production" : "development" },
      logLevel: process.env.NEXT_PUBLIC_STATSIG_DEBUG === "true" ? LogLevel.Debug : LogLevel.Warn,
      plugins,
    }
  )
  client.initializeSync()
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

  const user: StatsigUser = {
    userID: id,
    ...(email ? { email } : {}),
    custom: {
      ...(emailDomain ? { email_domain: emailDomain } : {}),
      ...(authProvider ? { auth_provider: authProvider } : {}),
    },
  }
  client?.updateUserSync(user)
}

export const resetAnalytics = () => {
  if (!isAnalyticsEnabled()) {
    return
  }

  client?.updateUserSync({})
  clearAnalyticsSession()
  clearAnalyticsContext()
}

export const captureEvent = (event: AnalyticsEventName, properties: Record<string, unknown> = {}) => {
  if (!isAnalyticsEnabled()) {
    return
  }

  initAnalytics()

  client?.logEvent(
    event,
    undefined,
    toStatsigMetadata({
      ...sanitizeProperties(analyticsContext as Record<string, unknown>),
      ...sanitizeProperties(properties),
      session_id: ensureAnalyticsSession(),
      timestamp: new Date().toISOString(),
    })
  )
}
