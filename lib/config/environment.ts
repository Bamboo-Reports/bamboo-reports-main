function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

export function getEnvironmentLabel(): string | null {
  const label = normalizeEnvValue(process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL)
  return label ? label.toUpperCase() : null
}

export function getBrandfetchClientId(): string | null {
  return normalizeEnvValue(process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID)
}
