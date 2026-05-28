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
