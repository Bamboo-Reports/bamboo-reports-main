// Client-side debug logging that is silenced in production builds.

export function devError(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(...args)
  }
}

export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(...args)
  }
}

export function perfLog(label: string, ms: number): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[perf] ${label}: ${ms.toFixed(1)}ms`)
  }
}
