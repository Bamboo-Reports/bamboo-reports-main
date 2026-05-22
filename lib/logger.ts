type LogLevel = "debug" | "info" | "warn" | "error"

type LogMeta = Record<string, unknown>

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY_PATTERN = /authorization|password|secret|token|jwt|session|cookie|apikey|api_key/i

function getConfiguredLevel(): LogLevel {
  const configured = (process.env.NEXT_PUBLIC_LOG_LEVEL || process.env.LOG_LEVEL || "").toLowerCase()
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured
  }
  return process.env.NODE_ENV === "development" ? "debug" : "info"
}

function shouldLog(level: LogLevel) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getConfiguredLevel()]
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]"
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "development" ? value.stack : undefined,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item))
  }

  if (value && typeof value === "object") {
    return sanitizeMeta(value as LogMeta)
  }

  return value
}

function sanitizeMeta(meta: LogMeta): LogMeta {
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(key, value)])
  )
}

export function createLogger(scope: string) {
  const write = (level: LogLevel, message: string, meta?: LogMeta) => {
    if (!shouldLog(level)) {
      return
    }

    const payload = {
      ts: new Date().toISOString(),
      scope,
      level,
      ...(meta ? sanitizeMeta(meta) : {}),
    }

    const method = level === "debug" ? "log" : level
    console[method](`[${scope}] ${message}`, payload)
  }

  return {
    debug: (message: string, meta?: LogMeta) => write("debug", message, meta),
    info: (message: string, meta?: LogMeta) => write("info", message, meta),
    warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
    error: (message: string, meta?: LogMeta) => write("error", message, meta),
  }
}

