import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { TOUR_STORAGE_KEY, TOUR_VERSION } from "@/lib/tour/constants"

interface TourPersistenceState {
  isCompleted: boolean
  isLoading: boolean
}

export function useTourPersistence(userId: string | null) {
  const [state, setState] = useState<TourPersistenceState>({
    isCompleted: true,
    isLoading: true,
  })

  useEffect(() => {
    if (!userId) {
      setState({ isCompleted: true, isLoading: false })
      return
    }

    const stored = window.localStorage.getItem(TOUR_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.version >= TOUR_VERSION) {
          setState({ isCompleted: true, isLoading: false })
          return
        }
      } catch {
        // ignore malformed data
      }
    }

    const supabase = getSupabaseBrowserClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("tour_completed_at, tour_version")
          .eq("user_id", userId)
          .single()

        const completed = Boolean(
          data?.tour_completed_at && (data?.tour_version ?? 0) >= TOUR_VERSION
        )
        if (completed && data?.tour_version != null && data?.tour_completed_at != null) {
          window.localStorage.setItem(
            TOUR_STORAGE_KEY,
            JSON.stringify({ version: data.tour_version, completedAt: data.tour_completed_at })
          )
        }
        setState({ isCompleted: completed, isLoading: false })
      } catch {
        setState({ isCompleted: false, isLoading: false })
      }
    })()
  }, [userId])

  const markCompleted = useCallback(async () => {
    const now = new Date().toISOString()
    window.localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify({ version: TOUR_VERSION, completedAt: now })
    )
    setState({ isCompleted: true, isLoading: false })

    if (userId) {
      try {
        const supabase = getSupabaseBrowserClient()
        await supabase
          .from("profiles")
          .update({ tour_completed_at: now, tour_version: TOUR_VERSION })
          .eq("user_id", userId)
      } catch {
        // Supabase write failed. localStorage still persists the state.
      }
    }
  }, [userId])

  return { ...state, markCompleted }
}
