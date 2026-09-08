"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { devError } from "@/lib/utils/dev-log"
import { normalizeAccountList, type AccountList } from "@/lib/accounts/account-lists"

export interface AccountListShare {
  id: string
  list_id: string
  shared_with_user_id: string
  shared_with_email: string
  created_at: string
}

export type AccountListInput = {
  name: string
  accounts: string[]
  unmatched?: string[]
  sourceFile?: string | null
}

type AccountListsContextValue = {
  lists: AccountList[]
  loading: boolean
  userId: string | null
  refresh: () => Promise<void>
  createList: (input: AccountListInput) => Promise<AccountList | null>
  updateList: (id: string, input: Partial<AccountListInput>) => Promise<AccountList | null>
  deleteList: (id: string) => Promise<boolean>
  shareList: (listId: string, email: string) => Promise<{ success: boolean; error?: string }>
  unshareList: (listId: string, sharedWithUserId: string) => Promise<boolean>
  getListShares: (listId: string) => Promise<AccountListShare[]>
}

const AccountListsContext = createContext<AccountListsContextValue | null>(null)

/** Supabase errors are plain objects that log as "{}"; surface their fields. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    return [e.code, e.message, e.details, e.hint].filter((v) => typeof v === "string" && v).join(" | ") || JSON.stringify(error)
  }
  return String(error)
}

const COLUMNS = "id, user_id, name, accounts, account_count, unmatched, source_file, created_at, updated_at"

/**
 * Owner-scoped account lists (Supabase `account_lists`, RLS-guarded). One
 * provider near the app root so the sidebar picker, the upload dialog and the
 * manage dialog all see the same lists after any change.
 */
export function AccountListsProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const [lists, setLists] = useState<AccountList[]>([])
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setUserId(data.session?.user.id ?? null)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user.id ?? null)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  const refresh = useCallback(async () => {
    if (!userId) {
      setLists([])
      return
    }
    setLoading(true)
    try {
      const [{ data: ownData, error: ownError }, { data: sharedData, error: sharedError }] = await Promise.all([
        supabase.from("account_lists").select(COLUMNS).eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("account_list_shares").select(`list_id, account_lists(${COLUMNS})`).eq("shared_with_user_id", userId),
      ])
      if (ownError) throw ownError
      // Sharing is optional (its migration may not be applied yet): keep own lists usable.
      if (sharedError) devError("Failed to load shared account lists:", describeError(sharedError))

      const own = (Array.isArray(ownData) ? ownData : [])
        .map((row) => normalizeAccountList(row as Record<string, unknown>))
        .filter((row): row is AccountList => Boolean(row))

      const sharedRows = (Array.isArray(sharedData) ? sharedData : [])
        .map((share) => (share as { account_lists?: unknown }).account_lists as Record<string, unknown> | null)
        .filter((row): row is Record<string, unknown> => Boolean(row))

      // Owner emails come from a security-definer RPC scoped to lists shared
      // with the caller; direct profile reads are owner-only.
      const ownerEmailById = new Map<string, string>()
      if (sharedRows.length > 0) {
        const { data: owners } = await supabase.rpc("lookup_shared_account_list_owner_emails")
        for (const profile of (owners as Array<{ user_id?: unknown; email?: unknown }> | null) ?? []) {
          if (typeof profile.user_id === "string" && typeof profile.email === "string") ownerEmailById.set(profile.user_id, profile.email)
        }
      }
      const shared: AccountList[] = []
      for (const row of sharedRows) {
        const list = normalizeAccountList(row)
        if (!list || list.user_id === userId) continue
        shared.push({ ...list, owner_email: ownerEmailById.get(list.user_id) ?? "a teammate" })
      }

      setLists([...own, ...shared])
    } catch (error) {
      devError("Failed to load account lists:", describeError(error))
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!authReady) return
    void refresh()
  }, [authReady, refresh])

  const createList = useCallback(
    async (input: AccountListInput): Promise<AccountList | null> => {
      const name = input.name.trim()
      if (!name || !userId) return null
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("account_lists")
          .insert({
            user_id: userId,
            name,
            accounts: input.accounts,
            account_count: input.accounts.length,
            unmatched: input.unmatched ?? [],
            source_file: input.sourceFile ?? null,
          })
          .select(COLUMNS)
          .single()
        if (error) throw error
        const created = normalizeAccountList(data as Record<string, unknown>)
        if (created) setLists((prev) => [created, ...prev])
        return created
      } catch (error) {
        devError("Failed to create account list:", describeError(error))
        return null
      } finally {
        setLoading(false)
      }
    },
    [supabase, userId]
  )

  const updateList = useCallback(
    async (id: string, input: Partial<AccountListInput>): Promise<AccountList | null> => {
      setLoading(true)
      try {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (typeof input.name === "string") {
          const name = input.name.trim()
          if (!name) return null
          patch.name = name
        }
        if (input.accounts) {
          patch.accounts = input.accounts
          patch.account_count = input.accounts.length
        }
        if (input.unmatched) patch.unmatched = input.unmatched
        if (input.sourceFile !== undefined) patch.source_file = input.sourceFile
        const { data, error } = await supabase.from("account_lists").update(patch).eq("id", id).select(COLUMNS).single()
        if (error) throw error
        const updated = normalizeAccountList(data as Record<string, unknown>)
        if (updated) setLists((prev) => [updated, ...prev.filter((l) => l.id !== id)])
        return updated
      } catch (error) {
        devError("Failed to update account list:", describeError(error))
        return null
      } finally {
        setLoading(false)
      }
    },
    [supabase]
  )

  const deleteList = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true)
      try {
        const { error } = await supabase.from("account_lists").delete().eq("id", id)
        if (error) throw error
        setLists((prev) => prev.filter((l) => l.id !== id))
        return true
      } catch (error) {
        devError("Failed to delete account list:", describeError(error))
        return false
      } finally {
        setLoading(false)
      }
    },
    [supabase]
  )

  const shareList = useCallback(
    async (listId: string, email: string): Promise<{ success: boolean; error?: string }> => {
      if (!userId) return { success: false, error: "Not authenticated" }
      const normalizedEmail = email.trim().toLowerCase()
      try {
        const { data: profileData, error: profileError } = await supabase
          .rpc("lookup_profile_by_email", { input_email: normalizedEmail })
          .maybeSingle()
        const profile = profileData as { user_id?: unknown; email?: unknown } | null
        if (profileError || !profile || typeof profile.user_id !== "string" || typeof profile.email !== "string") {
          return { success: false, error: "No user found with that email address" }
        }
        if (profile.user_id === userId) return { success: false, error: "You cannot share a list with yourself" }
        const { error } = await supabase.from("account_list_shares").insert({
          list_id: listId,
          owner_user_id: userId,
          shared_with_user_id: profile.user_id,
          shared_with_email: profile.email,
        })
        if (error) {
          if (error.code === "23505") return { success: false, error: "This list is already shared with that user" }
          throw error
        }
        return { success: true }
      } catch (error) {
        devError("Failed to share account list:", describeError(error))
        return { success: false, error: "Failed to share list" }
      }
    },
    [supabase, userId]
  )

  const unshareList = useCallback(
    async (listId: string, sharedWithUserId: string): Promise<boolean> => {
      try {
        const { error } = await supabase.from("account_list_shares").delete().eq("list_id", listId).eq("shared_with_user_id", sharedWithUserId)
        if (error) throw error
        return true
      } catch (error) {
        devError("Failed to unshare account list:", describeError(error))
        return false
      }
    },
    [supabase]
  )

  const getListShares = useCallback(
    async (listId: string): Promise<AccountListShare[]> => {
      try {
        const { data, error } = await supabase
          .from("account_list_shares")
          .select("id, list_id, shared_with_user_id, shared_with_email, created_at")
          .eq("list_id", listId)
          .order("created_at", { ascending: false })
        if (error) throw error
        return (data as AccountListShare[] | null) ?? []
      } catch (error) {
        devError("Failed to load account list shares:", describeError(error))
        return []
      }
    },
    [supabase]
  )

  const value = useMemo<AccountListsContextValue>(
    () => ({ lists, loading, userId, refresh, createList, updateList, deleteList, shareList, unshareList, getListShares }),
    [lists, loading, userId, refresh, createList, updateList, deleteList, shareList, unshareList, getListShares]
  )

  return <AccountListsContext.Provider value={value}>{children}</AccountListsContext.Provider>
}

const EMPTY: AccountListsContextValue = {
  lists: [],
  loading: false,
  userId: null,
  refresh: async () => {},
  createList: async () => null,
  updateList: async () => null,
  deleteList: async () => false,
  shareList: async () => ({ success: false, error: "Not available" }),
  unshareList: async () => false,
  getListShares: async () => [],
}

/** Account lists from the nearest provider; a no-op stub outside one (tests, auth pages). */
export function useAccountLists(): AccountListsContextValue {
  return useContext(AccountListsContext) ?? EMPTY
}
