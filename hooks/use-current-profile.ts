"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { captureEvent, identifyUser, resetAnalytics } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { normalizeUserRole } from "@/lib/auth/roles"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { markManualSignOut } from "@/hooks/use-auth-guard"
import type { Profile } from "@/lib/types"

/** The signed-in user's profile, derived display fields, and sign out. */
export function useCurrentProfile() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    // getSession and the INITIAL_SESSION / SIGNED_IN / hourly TOKEN_REFRESHED
    // events all report the same user, so share one profile fetch per user.
    let profileLoad: { userId: string; promise: Promise<void> } | null = null

    const fetchProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, email, phone, role")
        .eq("user_id", userId)
        .single()

      if (error) profileLoad = null
      if (!isMounted) return
      if (error) {
        setProfile(null)
        return
      }
      setProfile(data)
      identifyUser({
        id: userId,
        email: data.email,
        role: normalizeUserRole(data.role),
        firstName: data.first_name,
        lastName: data.last_name,
      })
    }

    const loadProfile = (userId: string) => {
      if (profileLoad?.userId !== userId) {
        profileLoad = { userId, promise: fetchProfile(userId) }
      }
      return profileLoad.promise
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      const user = data.session?.user
      if (!user) {
        setIsLoading(false)
        setSessionEmail(null)
        setLastSignInAt(null)
        setProfile(null)
        return
      }
      setSessionEmail(user.email ?? null)
      setLastSignInAt(user.last_sign_in_at ?? null)
      loadProfile(user.id).finally(() => setIsLoading(false))
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      if (!session?.user) {
        profileLoad = null
        setSessionEmail(null)
        setLastSignInAt(null)
        setProfile(null)
        return
      }
      setSessionEmail(session.user.email ?? null)
      setLastSignInAt(session.user.last_sign_in_at ?? null)
      void loadProfile(session.user.id)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    captureEvent(ANALYTICS_EVENTS.AUTH_SIGNED_OUT, {
      auth_provider: "email",
    })
    markManualSignOut()
    await supabase.auth.signOut()
    resetAnalytics()
    router.replace("/signin")
  }, [router])

  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : "User"
  const displayEmail = profile?.email ?? sessionEmail ?? "No email"
  const role = normalizeUserRole(profile?.role)
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"
  const formattedLastSignIn = (() => {
    if (!lastSignInAt || Number.isNaN(Date.parse(lastSignInAt))) return "Unknown"
    const d = new Date(lastSignInAt)
    const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
    return `${date} · ${time}`
  })()

  return {
    profile,
    isLoading,
    displayName,
    displayEmail,
    role,
    roleLabel: role === "admin" ? "Admin" : "Viewer",
    initials,
    formattedLastSignIn,
    signOut,
  }
}

export type CurrentProfile = ReturnType<typeof useCurrentProfile>
