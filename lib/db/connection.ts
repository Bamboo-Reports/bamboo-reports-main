
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { createLogger } from "@/lib/logger"

// ============================================
// CONFIGURATION & SETUP
// ============================================

export type SqlClient = NeonQueryFunction<false, false> | null

const logger = createLogger("db/connection")

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
  logger.info("database_client_initialized")
} catch (error) {
  logger.error("database_client_initialization_failed", { error })
}

export function getSqlOrThrow(): NeonQueryFunction<false, false> {
  if (!sql) {
    throw new Error("Database connection not initialized")
  }
  return sql
}

export function getSql(): SqlClient {
  return sql
}

/**
 * Retry logic for database operations
 */
export async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  for (let i = 0; i < retries; i++) {
    const startedAt = Date.now()
    try {
      const result = await fn()
      if (i > 0) {
        logger.info("database_query_retry_succeeded", {
          attempt: i + 1,
          duration_ms: Date.now() - startedAt,
        })
      }
      return result
    } catch (error) {
      const isFinalAttempt = i === retries - 1
      logger[isFinalAttempt ? "error" : "warn"]("database_query_attempt_failed", {
        attempt: i + 1,
        max_attempts: retries,
        retry_delay_ms: isFinalAttempt ? 0 : delay * Math.pow(2, i),
        duration_ms: Date.now() - startedAt,
        error,
      })
      if (i === retries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
  throw new Error("Max retries reached")
}
