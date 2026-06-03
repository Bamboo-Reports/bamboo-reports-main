import "server-only"

import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { createLogger } from "@/lib/logger"
import ws from "ws"

const logger = createLogger("db/prisma")

neonConfig.webSocketConstructor = ws

declare global {
  var __bambooPrisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    logger.error("database_url_missing")
    return null
  }

  try {
    const adapter = new PrismaNeon({ connectionString })
    const client = new PrismaClient({ adapter })
    logger.info("database_client_initialized")
    return client
  } catch (error) {
    logger.error("database_client_initialization_failed", { error })
    return null
  }
}

export function getPrisma(): PrismaClient | null {
  if (globalThis.__bambooPrisma) {
    return globalThis.__bambooPrisma
  }

  const client = createPrismaClient()
  if (client) {
    globalThis.__bambooPrisma = client
  }
  return client
}

export function getPrismaOrThrow(): PrismaClient {
  const client = getPrisma()
  if (!client) {
    throw new Error("Database connection not initialized")
  }
  return client
}

export async function queryWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
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
      if (isFinalAttempt) throw error
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
  throw new Error("Max retries reached")
}
