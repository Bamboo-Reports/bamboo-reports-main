import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Successful token validations are cached briefly so warm dashboard requests
// skip the ~150ms Supabase auth round trip. Tradeoff: a revoked token keeps
// working for up to TOKEN_CACHE_TTL_MS on instances that saw it recently,
// acceptable for read-only dashboard data. Failures are never cached.
const TOKEN_CACHE_TTL_MS = 60_000
const TOKEN_CACHE_MAX_ENTRIES = 500

const tokenCache = new Map<string, { userId: string; expires: number }>()
// A page load fires several data requests at once with the same token; they
// all miss the cache together, so share one validation instead of one each.
const inflight = new Map<string, Promise<string>>()

let cachedClient: SupabaseClient | null = null

function getSupabaseAuthClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.")
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return cachedClient
}

/**
 * Validates a Supabase access token and returns the authenticated user's ID.
 * Throws if the token is missing, invalid, or Supabase env vars are not configured.
 */
export async function resolveAuthenticatedUserId(accessToken: string): Promise<string> {
  const token = accessToken?.trim()
  if (!token) {
    throw new Error("Missing access token.")
  }

  const cached = tokenCache.get(token)
  if (cached && cached.expires > Date.now()) {
    return cached.userId
  }
  if (cached) tokenCache.delete(token)

  const pending = inflight.get(token)
  if (pending) return pending

  const validation = (async () => {
    const supabase = getSupabaseAuthClient()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user?.id) {
      throw new Error("Authentication failed.")
    }
    if (tokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
      const oldest = tokenCache.keys().next().value
      if (oldest !== undefined) tokenCache.delete(oldest)
    }
    tokenCache.set(token, { userId: data.user.id, expires: Date.now() + TOKEN_CACHE_TTL_MS })
    return data.user.id
  })().finally(() => {
    inflight.delete(token)
  })
  inflight.set(token, validation)
  return validation
}

/** Test-only: clears the token validation cache and client singleton. */
export function __clearAuthCachesForTests(): void {
  tokenCache.clear()
  inflight.clear()
  cachedClient = null
}

/**
 * Extracts the Bearer token from an Authorization header value.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(" ")
  if (parts.length !== 2 || parts[0] !== "Bearer") return null
  return parts[1] || null
}
