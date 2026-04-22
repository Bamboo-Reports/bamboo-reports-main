import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let serviceRoleClient: SupabaseClient | null = null

/**
 * Returns a Supabase client initialised with the service-role key.
 * Bypasses RLS — only use server-side for trusted operations (Storage
 * uploads, signed URL creation, privileged queries).
 */
export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (serviceRoleClient) return serviceRoleClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase server env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)."
    )
  }

  serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return serviceRoleClient
}

export const USER_EXPORTS_BUCKET = "user-exports"
