import { createClient } from "@supabase/supabase-js"

/**
 * Validates a Supabase access token and returns the authenticated user's ID.
 * Throws if the token is missing, invalid, or Supabase env vars are not configured.
 */
export async function resolveAuthenticatedUserId(accessToken: string): Promise<string> {
  const token = accessToken?.trim()
  if (!token) {
    throw new Error("Missing access token.")
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.")
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) {
    throw new Error("Authentication failed.")
  }

  return data.user.id
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
