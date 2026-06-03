import { getPrisma, getPrismaOrThrow, queryWithRetry } from "@/lib/db/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger("actions/system")

// ============================================
// DATABASE HEALTH & DIAGNOSTICS
// ============================================

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    if (!process.env.DATABASE_URL) {
      return {
        success: false,
        message: "DATABASE_URL environment variable is not configured",
      }
    }

    if (!getPrisma()) {
      return {
        success: false,
        message: "Database connection could not be initialized",
      }
    }

    await queryWithRetry(() => getPrismaOrThrow().$queryRaw`SELECT 1 as test`)
    return { success: true, message: "Database connection successful" }
  } catch (error) {
    logger.error("database_connection_test_failed", { error })
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

export async function getDatabaseStatus(): Promise<{
  hasUrl: boolean
  hasConnection: boolean
  urlLength: number
  environment: string
  error?: string
}> {
  try {
    const hasUrl = !!process.env.DATABASE_URL
    const hasConnection = !!getPrisma()

    return {
      hasUrl,
      hasConnection,
      urlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
      environment: process.env.NODE_ENV || "unknown",
    }
  } catch (error) {
    return {
      hasUrl: false,
      hasConnection: false,
      urlLength: 0,
      environment: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
