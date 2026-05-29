import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let supabaseClient: SupabaseClient | null = null
let supabaseStorage: "local" | "session" | null = null

function resolveStoragePreference() {
  if (typeof window === "undefined") {
    return "local"
  }

  const sessionPreference = window.sessionStorage.getItem("supabase.auth.storage")
  if (sessionPreference === "session") {
    return "session"
  }

  const localPreference = window.localStorage.getItem("supabase.auth.storage")
  if (localPreference === "local") {
    return "local"
  }

  return "local"
}

export function setSupabaseAuthStoragePreference(storage: "local" | "session") {
  if (typeof window === "undefined") {
    return
  }

  if (storage === "session") {
    window.sessionStorage.setItem("supabase.auth.storage", "session")
    window.localStorage.removeItem("supabase.auth.storage")
  } else {
    window.localStorage.setItem("supabase.auth.storage", "local")
    window.sessionStorage.removeItem("supabase.auth.storage")
  }

  if (supabaseStorage && supabaseStorage !== storage) {
    supabaseClient = null
    supabaseStorage = null
  }
}

export function getSupabaseBrowserClient(storagePreference?: "local" | "session") {
  const resolvedStorage = storagePreference ?? resolveStoragePreference()

  if (supabaseClient && supabaseStorage === resolvedStorage) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.")
  }

  // During SSR there is no window; build a non-persisting client and don't
  // cache it so the browser later gets a proper window-backed instance.
  const isBrowser = typeof window !== "undefined"
  const storage = isBrowser
    ? resolvedStorage === "session"
      ? window.sessionStorage
      : window.localStorage
    : undefined

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage,
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  })

  if (isBrowser) {
    supabaseClient = client
    supabaseStorage = resolvedStorage
  }
  return client
}
