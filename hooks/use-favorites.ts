"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { devError } from "@/lib/utils/dev-log"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type FavoriteEntityType = "account" | "center" | "prospect"

export interface FavoriteItem {
  id: string
  entity_type: FavoriteEntityType
  entity_id: string
  title: string
  subtitle: string | null
  created_at: string
}

/** Payload supplied by callers when toggling/adding a favorite. */
export type FavoriteInput = {
  entity_type: FavoriteEntityType
  entity_id: string
  title: string
  subtitle?: string | null
}

const favoriteKey = (type: FavoriteEntityType, id: string) => `${type}:${id}`

export function useFavorites() {
  const supabase = getSupabaseBrowserClient()
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // Keys with a toggle in flight, so a rapid second click can't read stale
  // favorite state and double-add (or double-remove) the same item.
  const togglingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setUserId(data.session?.user.id ?? null)
      setAuthReady(true)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setUserId(session?.user.id ?? null)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  const loadFavorites = useCallback(async () => {
    if (!userId) {
      setFavorites([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("user_favorites")
        .select("id, entity_type, entity_id, title, subtitle, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setFavorites((data ?? []) as FavoriteItem[])
    } catch (error) {
      // Fails open (empty list) so the app still works before the migration is applied.
      devError("Failed to load favorites:", error)
      setFavorites([])
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!authReady) return
    loadFavorites()
  }, [authReady, loadFavorites, userId])

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((f) => favoriteKey(f.entity_type, f.entity_id))),
    [favorites]
  )

  const isFavorite = useCallback(
    (type: FavoriteEntityType, id: string) => favoriteKeys.has(favoriteKey(type, id)),
    [favoriteKeys]
  )

  const addFavorites = useCallback(
    async (items: FavoriteInput[]): Promise<boolean> => {
      if (!userId || items.length === 0) return false
      const rows = items.map((item) => ({
        user_id: userId,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        title: item.title,
        subtitle: item.subtitle ?? null,
      }))
      try {
        const { error } = await supabase
          .from("user_favorites")
          .upsert(rows, { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: true })
        if (error) throw error
        for (const item of items) {
          captureEvent(ANALYTICS_EVENTS.FAVORITE_ADDED, {
            entity_type: item.entity_type,
            bulk: items.length > 1,
          })
        }
        await loadFavorites()
        return true
      } catch (error) {
        devError("Failed to add favorites:", error)
        return false
      }
    },
    [supabase, userId, loadFavorites]
  )

  const removeFavorite = useCallback(
    async (type: FavoriteEntityType, id: string): Promise<boolean> => {
      if (!userId) return false
      try {
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("entity_type", type)
          .eq("entity_id", id)
        if (error) throw error
        captureEvent(ANALYTICS_EVENTS.FAVORITE_REMOVED, { entity_type: type })
        await loadFavorites()
        return true
      } catch (error) {
        devError("Failed to remove favorite:", error)
        return false
      }
    },
    [supabase, userId, loadFavorites]
  )

  const removeFavorites = useCallback(
    async (items: FavoriteInput[]): Promise<boolean> => {
      if (!userId || items.length === 0) return false
      const idsByType = new Map<FavoriteEntityType, string[]>()
      for (const item of items) {
        const ids = idsByType.get(item.entity_type) ?? []
        ids.push(item.entity_id)
        idsByType.set(item.entity_type, ids)
      }
      try {
        for (const [type, ids] of idsByType) {
          const { error } = await supabase
            .from("user_favorites")
            .delete()
            .eq("user_id", userId)
            .eq("entity_type", type)
            .in("entity_id", ids)
          if (error) throw error
          captureEvent(ANALYTICS_EVENTS.FAVORITE_REMOVED, { entity_type: type, bulk: items.length > 1 })
        }
        await loadFavorites()
        return true
      } catch (error) {
        devError("Failed to remove favorites:", error)
        return false
      }
    },
    [supabase, userId, loadFavorites]
  )

  const clearFavorites = useCallback(async (): Promise<boolean> => {
    if (!userId) return false
    try {
      const { error } = await supabase.from("user_favorites").delete().eq("user_id", userId)
      if (error) throw error
      setFavorites([])
      return true
    } catch (error) {
      devError("Failed to clear favorites:", error)
      return false
    }
  }, [supabase, userId])

  const toggleFavorite = useCallback(
    async (item: FavoriteInput): Promise<{ ok: boolean; added: boolean } | null> => {
      const key = favoriteKey(item.entity_type, item.entity_id)
      // Ignore a re-entrant toggle for the same item while one is in flight.
      if (togglingRef.current.has(key)) return null
      togglingRef.current.add(key)
      try {
        const wasFavorite = isFavorite(item.entity_type, item.entity_id)
        const ok = wasFavorite
          ? await removeFavorite(item.entity_type, item.entity_id)
          : await addFavorites([item])
        return { ok, added: !wasFavorite }
      } finally {
        togglingRef.current.delete(key)
      }
    },
    [isFavorite, removeFavorite, addFavorites]
  )

  return {
    favorites,
    favoriteKeys,
    loading,
    isFavorite,
    toggleFavorite,
    addFavorites,
    removeFavorite,
    removeFavorites,
    clearFavorites,
    refreshFavorites: loadFavorites,
  }
}
