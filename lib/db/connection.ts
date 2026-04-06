
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

// ============================================
// CONFIGURATION & SETUP
// ============================================

export type SqlClient = NeonQueryFunction | null

let sql: SqlClient = null

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not configured")
  }
  sql = neon(process.env.DATABASE_URL, {
    fetchOptions: {
      cache: "no-store",
    },
  })
} catch (error) {
  console.error("Failed to initialize database connection:", error)
}

export function getSqlOrThrow(): NeonQueryFunction {
  if (!sql) {
    throw new Error("Database connection not initialized")
  }
  return sql
}

export function getSql(): SqlClient {
    return sql;
}

/**
 * Retry logic for database operations
 */
export async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error)
      if (i === retries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
  throw new Error("Max retries reached")
}
