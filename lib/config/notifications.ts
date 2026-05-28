const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"])
const DISABLED_VALUES = new Set(["0", "false", "no", "off", "disabled"])

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

function areNotificationsEnabled(): boolean {
  const normalized = normalizeEnvValue(process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED)

  if (!normalized) return true
  if (ENABLED_VALUES.has(normalized)) return true
  if (DISABLED_VALUES.has(normalized)) return false

  return true
}

/** Evaluated once at module load. env vars don't change at runtime. */
export const NOTIFICATIONS_ENABLED = areNotificationsEnabled()
