"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { devError } from "@/lib/utils/dev-log"
import { normalizeAccountList, type AccountList } from "@/lib/accounts/account-lists"

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
}

const AccountListsContext = createContext<AccountListsContextValue | null>(null)

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
      const { data, error } = await supabase
        .from("account_lists")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
      if (error) throw error
      setLists(
        (Array.isArray(data) ? data : [])
          .map((row) => normalizeAccountList(row as Record<string, unknown>))
          .filter((row): row is AccountList => Boolean(row))
      )
    } catch (error) {
      devError("Failed to load account lists:", error)
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
        devError("Failed to create account list:", error)
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
        devError("Failed to update account list:", error)
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
        devError("Failed to delete account list:", error)
        return false
      } finally {
        setLoading(false)
      }
    },
    [supabase]
  )

  const value = useMemo<AccountListsContextValue>(
    () => ({ lists, loading, userId, refresh, createList, updateList, deleteList }),
    [lists, loading, userId, refresh, createList, updateList, deleteList]
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
}

/** Account lists from the nearest provider; a no-op stub outside one (tests, auth pages). */
export function useAccountLists(): AccountListsContextValue {
  return useContext(AccountListsContext) ?? EMPTY
}
