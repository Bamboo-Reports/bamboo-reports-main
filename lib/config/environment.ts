function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

/**
 * Label for the header environment badge. NEXT_PUBLIC_ENVIRONMENT_LABEL wins
 * when set (e.g. PROD to hide the badge). Otherwise it is detected: DEV under
 * `next dev` and on Vercel preview deployments, nothing in production.
 */
export function getEnvironmentLabel(): string | null {
  const label = normalizeEnvValue(process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL)
  if (label) return label.toUpperCase()
  if (process.env.NODE_ENV === "development") return "DEV"
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") return "DEV"
  return null
}

export function getBrandfetchClientId(): string | null {
  return normalizeEnvValue(process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID)
}
