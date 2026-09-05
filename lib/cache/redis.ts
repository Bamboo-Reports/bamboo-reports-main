/**
 * Minimal Upstash Redis REST client shared by the response cache
 * (lib/cache/memory.ts) and the rate limiter (lib/rate-limit/server.ts).
 * Plain fetch, no dependencies. Every helper fails soft: any transport or
 * command error returns null so callers can fall through (fail open).
 */

const REDIS_TIMEOUT_MS = 1500

let warnedRedisFailure = false

export type RedisCommand = (string | number)[]

/** Env-gated Upstash config, read per call so serverless env changes apply. */
export function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url, token } : null
}

function noteFailure(error: unknown): void {
  if (warnedRedisFailure) return
  warnedRedisFailure = true
  console.warn("[cache] Redis unavailable, serving without shared cache:", error)
}

async function post(url: string, token: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Redis responded ${response.status}`)
  return response.json()
}

/** Runs one Redis command; returns its `result` or null on any failure. */
export async function redisCommand(command: RedisCommand): Promise<unknown> {
  const config = redisConfig()
  if (!config) return null
  try {
    const body = (await post(config.url, config.token, command)) as { result?: unknown; error?: string }
    if (body.error) throw new Error(body.error)
    return body.result ?? null
  } catch (error) {
    noteFailure(error)
    return null
  }
}

/**
 * Runs several commands in one round trip (Upstash `/pipeline`). Returns one
 * result per command, or null for the whole batch on any failure.
 */
export async function redisPipeline(commands: RedisCommand[]): Promise<unknown[] | null> {
  const config = redisConfig()
  if (!config) return null
  try {
    const body = (await post(`${config.url.replace(/\/$/, "")}/pipeline`, config.token, commands)) as {
      result?: unknown
      error?: string
    }[]
    if (!Array.isArray(body) || body.length !== commands.length) throw new Error("Malformed pipeline response")
    const failed = body.find((item) => item.error)
    if (failed) throw new Error(failed.error)
    return body.map((item) => item.result ?? null)
  } catch (error) {
    noteFailure(error)
    return null
  }
}
