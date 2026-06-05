import "server-only"

import { Redis } from "@upstash/redis"
import { createLogger } from "@/lib/logger"

const logger = createLogger("lib/redis")

declare global {
  var __bambooRedis: Redis | undefined
}

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    logger.error("redis_config_missing", {
      has_url: Boolean(url),
      has_token: Boolean(token),
    })
    return null
  }

  try {
    const client = new Redis({ url, token })
    logger.info("redis_client_initialized")
    return client
  } catch (error) {
    logger.error("redis_client_initialization_failed", { error })
    return null
  }
}

export function getRedis(): Redis | null {
  if (globalThis.__bambooRedis) {
    return globalThis.__bambooRedis
  }

  const client = createRedisClient()
  if (client) {
    globalThis.__bambooRedis = client
  }
  return client
}

export function getRedisOrThrow(): Redis {
  const client = getRedis()
  if (!client) {
    throw new Error("Redis client not initialized — check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN")
  }
  return client
}
