
import { useState, useCallback, useEffect } from "react"
import { devError } from "@/lib/utils/dev-log"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot, normalizeTrackedText } from "@/lib/analytics/tracking"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { calculateActiveFilters, withFilterDefaults } from "@/lib/dashboard/filter-summary"
import type { SavedFilter } from "@/components/filters/saved-filter-card"
import type { Filters } from "@/lib/types"

export interface FilterShare {
  id: string
  filter_id: string
  shared_with_user_id: string
  shared_with_email: string
  created_at: string
}

export function useSavedFilters() {
  const supabase = getSupabaseBrowserClient()
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

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

  const loadSavedFilters = useCallback(async () => {
    if (!userId) {
      setSavedFilters([])
      return
    }

    setLoading(true)
    try {
      // Fetch own filters
      const { data: ownData, error: ownError } = await supabase
        .from("saved_filters")
        .select("id, name, filters, created_at, updated_at, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (ownError) throw ownError

      // Fetch filters shared with me
      const { data: sharedData, error: sharedError } = await supabase
        .from("filter_shares")
        .select("filter_id, shared_with_email, saved_filters(id, name, filters, created_at, updated_at, user_id)")
        .eq("shared_with_user_id", userId)

      if (sharedError) throw sharedError

      const normalizeFilter = (filter: Record<string, unknown>, ownerEmail?: string): SavedFilter | null => {
        try {
          if (typeof filter.id !== "string" || typeof filter.name !== "string") return null
          const parsedFilters = typeof filter.filters === "string" ? JSON.parse(filter.filters) : filter.filters
          if (!parsedFilters) return null
          return {
            id: filter.id,
            name: filter.name,
            filters: withFilterDefaults(parsedFilters),
            created_at: typeof filter.created_at === "string" ? filter.created_at : "",
            updated_at: typeof filter.updated_at === "string" ? filter.updated_at : "",
            user_id: typeof filter.user_id === "string" ? filter.user_id : "",
            owner_email: ownerEmail,
          }
        } catch (error) {
          devError("Failed to parse saved filter:", error)
          return null
        }
      }

      const ownFilters = Array.isArray(ownData)
        ? ownData.map((f) => normalizeFilter(f)).filter((item): item is SavedFilter => Boolean(item))
        : []

      const sharedFilters: SavedFilter[] = []
      if (Array.isArray(sharedData)) {
        const sharedFilterData = sharedData
          .map((share) => share.saved_filters as unknown as Record<string, unknown> | null)
          .filter((filterData): filterData is Record<string, unknown> => Boolean(filterData))

        // Resolve owner emails via a security-definer RPC scoped to filters
        // actually shared with the caller. Direct profile reads are owner-only,
        // so a cross-user .from("profiles") read here would return nothing.
        const ownerEmailById = new Map<string, string>()
        if (sharedFilterData.length > 0) {
          const { data: ownerProfiles } = await supabase.rpc(
            "lookup_shared_filter_owner_emails"
          )

          const rows =
            (ownerProfiles as Array<{ user_id?: unknown; email?: unknown }> | null) ?? []
          for (const profile of rows) {
            if (typeof profile.user_id === "string" && typeof profile.email === "string") {
              ownerEmailById.set(profile.user_id, profile.email)
            }
          }
        }

        for (const filterData of sharedFilterData) {
          const ownerEmail = ownerEmailById.get(filterData.user_id as string) ?? "a teammate"
          const normalized = normalizeFilter(filterData, ownerEmail)
          if (normalized) sharedFilters.push(normalized)
        }
      }

      setSavedFilters([...ownFilters, ...sharedFilters])
    } catch (error) {
      devError("Failed to load saved filters:", error)
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  // Initial load when auth is ready
  useEffect(() => {
    if (!authReady) return
    loadSavedFilters()
  }, [authReady, loadSavedFilters, userId])

  const saveFilter = useCallback(async (name: string, filters: Filters) => {
    if (!name.trim() || !userId) return false
    const normalizedName = name.trim()

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("saved_filters")
        .insert({ name: normalizedName, filters: filters, user_id: userId })
        .select("id, name")
        .single()

      if (error) throw error
      await loadSavedFilters()
      captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_SAVED, {
        saved_filter_id: data?.id ?? null,
        saved_filter_name: normalizeTrackedText(normalizedName),
        filter_name_length: normalizedName.length,
        active_filters_count: calculateActiveFilters(filters),
        saved_filters_snapshot: buildTrackedFiltersSnapshot(filters),
      })
      return true
    } catch (error) {
      devError("Error saving filter:", error)
      return false
    } finally {
      setLoading(false)
    }
  }, [userId, loadSavedFilters, supabase])

  const deleteFilter = useCallback(async (id: string) => {
    const filterToDelete = savedFilters.find((filter) => filter.id === id) ?? null

    setLoading(true)
    try {
      const { error } = await supabase
        .from("saved_filters")
        .delete()
        .eq("id", id)

      if (error) throw error

      await loadSavedFilters()
      captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_DELETED, {
        saved_filter_id: id,
        saved_filter_name: filterToDelete ? normalizeTrackedText(filterToDelete.name) : null,
        active_filters_count: filterToDelete ? calculateActiveFilters(filterToDelete.filters) : null,
        deleted_filters_snapshot: filterToDelete ? buildTrackedFiltersSnapshot(filterToDelete.filters) : null,
      })
      return true
    } catch (error) {
      devError("Error deleting filter:", error)
      return false
    } finally {
      setLoading(false)
    }
  }, [loadSavedFilters, savedFilters, supabase])

  const updateFilter = useCallback(async (id: string, name: string, filters: Filters) => {
    const previousFilter = savedFilters.find((filter) => filter.id === id) ?? null
    const normalizedName = name.trim()

    setLoading(true)
    try {
      const { error } = await supabase
        .from("saved_filters")
        .update({
          name: normalizedName,
          filters: filters,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) throw error

      await loadSavedFilters()
      captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_RENAMED, {
        saved_filter_id: id,
        previous_filter_name: previousFilter ? normalizeTrackedText(previousFilter.name) : null,
        next_filter_name: normalizeTrackedText(normalizedName),
        filter_name_length: normalizedName.length,
        active_filters_count: calculateActiveFilters(filters),
        updated_filters_snapshot: buildTrackedFiltersSnapshot(filters),
      })
      return true
    } catch (error) {
      devError("Error updating filter:", error)
      return false
    } finally {
      setLoading(false)
    }
  }, [loadSavedFilters, savedFilters, supabase])

  const shareFilter = useCallback(async (filterId: string, email: string): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: "Not authenticated" }
    const normalizedEmail = email.trim().toLowerCase()

    setLoading(true)
    try {
      // Look up recipient by email in profiles
      const { data: profileData, error: profileError } = await supabase
        .rpc("lookup_profile_by_email", { input_email: normalizedEmail })
        .maybeSingle()
      const profile = profileData as { user_id?: unknown; email?: unknown } | null

      if (
        profileError ||
        !profile ||
        typeof profile.user_id !== "string" ||
        typeof profile.email !== "string"
      ) {
        return { success: false, error: "No user found with that email address" }
      }

      if (profile.user_id === userId) {
        return { success: false, error: "You cannot share a filter with yourself" }
      }

      // Insert the share record
      const { error: shareError } = await supabase
        .from("filter_shares")
        .insert({
          filter_id: filterId,
          owner_user_id: userId,
          shared_with_user_id: profile.user_id,
          shared_with_email: profile.email,
        })

      if (shareError) {
        if (shareError.code === "23505") {
          return { success: false, error: "This filter is already shared with that user" }
        }
        throw shareError
      }

      const filter = savedFilters.find((f) => f.id === filterId)
      captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_SHARED, {
        saved_filter_id: filterId,
        saved_filter_name: filter ? normalizeTrackedText(filter.name) : null,
        shared_with_email: normalizeTrackedText(email),
      })

      return { success: true }
    } catch (error) {
      devError("Error sharing filter:", error)
      return { success: false, error: "Failed to share filter" }
    } finally {
      setLoading(false)
    }
  }, [userId, supabase, savedFilters])

  const unshareFilter = useCallback(async (filterId: string, sharedWithUserId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from("filter_shares")
        .delete()
        .eq("filter_id", filterId)
        .eq("shared_with_user_id", sharedWithUserId)

      if (error) throw error

      captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_UNSHARED, {
        saved_filter_id: filterId,
        unshared_with_user_id: sharedWithUserId,
      })

      return true
    } catch (error) {
      devError("Error unsharing filter:", error)
      return false
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const getFilterShares = useCallback(async (filterId: string): Promise<FilterShare[]> => {
    try {
      const { data, error } = await supabase
        .from("filter_shares")
        .select("id, filter_id, shared_with_user_id, shared_with_email, created_at")
        .eq("filter_id", filterId)
        .order("created_at", { ascending: false })

      if (error) throw error
      return data ?? []
    } catch (error) {
      devError("Error fetching filter shares:", error)
      return []
    }
  }, [supabase])

  return {
    savedFilters,
    loading,
    userId,
    saveFilter,
    deleteFilter,
    updateFilter,
    shareFilter,
    unshareFilter,
    getFilterShares,
    refreshFilters: loadSavedFilters
  }
}
