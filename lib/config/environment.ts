function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

export type DevEnvironment = "dev" | "preview"

/**
 * Non-production environment for the header badge, detected rather than
 * configured: "dev" under `next dev`, "preview" on Vercel preview
 * deployments, null in production.
 */
export function getDevEnvironment(): DevEnvironment | null {
  if (process.env.NODE_ENV === "development") return "dev"
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") return "preview"
  return null
}

export function getBrandfetchClientId(): string | null {
  return normalizeEnvValue(process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID)
}
