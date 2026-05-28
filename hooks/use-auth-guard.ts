import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { DEFAULT_USER_ROLE, normalizeUserRole, type UserRole } from "@/lib/auth/roles"
import { devError } from "@/lib/utils/dev-log"

export function useAuthGuard() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>(DEFAULT_USER_ROLE)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    const loadUserRole = async (currentUserId: string) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", currentUserId)
          .maybeSingle()

        if (!isMounted) return
        if (error) {
          setUserRole(DEFAULT_USER_ROLE)
          return
        }

        setUserRole(normalizeUserRole(data?.role))
      } catch (_error) {
        if (!isMounted) return
        setUserRole(DEFAULT_USER_ROLE)
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      const session = data.session
      if (!session) {
        router.replace("/signin")
        setUserId(null)
        setUserEmail(null)
        setUserRole(DEFAULT_USER_ROLE)
        setAuthReady(true)
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)
      await loadUserRole(session.user.id)
      setAuthReady(true)
    }).catch((error) => {
      devError("Failed to get auth session:", error)
      if (!isMounted) return
      setAuthReady(true)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      if (!session) {
        setUserId(null)
        setUserEmail(null)
        setUserRole(DEFAULT_USER_ROLE)
        router.replace("/signin")
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)
      void loadUserRole(session.user.id)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  return { authReady, userId, userEmail, userRole }
}
