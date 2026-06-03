"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getSectionUnavailableMessage } from "@/lib/config/dashboard-access"
import type { Account, Center, Prospect } from "@/lib/types"
import type { SearchResult } from "@/lib/search"
import type { RecentItem } from "@/hooks/use-recent-items"

interface SearchHandlersContext {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  accountsEnabled: boolean
  centersEnabled: boolean
  prospectsEnabled: boolean
  searchQuery: string
  handleSearchClose: () => void
  handleSectionSelect: (section: "accounts" | "centers" | "prospects") => void
  addRecentItem: (item: Omit<RecentItem, "viewedAt">) => void
  addRecentSearch: (query: string) => void
  setSearchQuery: (query: string) => void
  setSearchSelectedAccount: (account: Account | null) => void
  setSearchAccountDialogOpen: (open: boolean) => void
  setSearchSelectedCenter: (center: Center | null) => void
  setSearchCenterDialogOpen: (open: boolean) => void
  setSearchSelectedProspect: (prospect: Prospect | null) => void
  setSearchProspectDialogOpen: (open: boolean) => void
  loadData: (forceRefresh?: boolean) => Promise<void>
  setTheme: (theme: string) => void
  resolvedTheme: string | undefined
}

export function useSearchHandlers(ctx: SearchHandlersContext) {
  const {
    accounts,
    centers,
    prospects,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
    searchQuery,
    handleSearchClose,
    handleSectionSelect,
    addRecentItem,
    addRecentSearch,
    setSearchQuery,
    setSearchSelectedAccount,
    setSearchAccountDialogOpen,
    setSearchSelectedCenter,
    setSearchCenterDialogOpen,
    setSearchSelectedProspect,
    setSearchProspectDialogOpen,
    loadData,
    setTheme,
    resolvedTheme,
  } = ctx

  const handleSearchResultSelect = useCallback(
    (result: SearchResult) => {
      handleSearchClose()
      addRecentItem({
        type: result.type,
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
      })
      if (searchQuery.trim()) {
        addRecentSearch(searchQuery.trim())
      }
      captureEvent(ANALYTICS_EVENTS.SEARCH_RESULT_SELECTED, {
        result_type: result.type,
        query: searchQuery,
      })

      if (result.type === "account") {
        setSearchSelectedAccount(result.data as Account)
        setSearchAccountDialogOpen(true)
      } else if (result.type === "center") {
        setSearchSelectedCenter(result.data as Center)
        setSearchCenterDialogOpen(true)
      } else if (result.type === "prospect") {
        setSearchSelectedProspect(result.data as Prospect)
        setSearchProspectDialogOpen(true)
      }
    },
    [
      handleSearchClose,
      addRecentItem,
      addRecentSearch,
      searchQuery,
      setSearchSelectedAccount,
      setSearchAccountDialogOpen,
      setSearchSelectedCenter,
      setSearchCenterDialogOpen,
      setSearchSelectedProspect,
      setSearchProspectDialogOpen,
    ]
  )

  const handleSearchRecentItemSelect = useCallback(
    (item: RecentItem) => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_RECENT_ITEM_SELECTED, { result_type: item.type })

      if (item.type === "account") {
        if (!accountsEnabled) {
          toast.info(getSectionUnavailableMessage("accounts"))
          return
        }
        const account = accounts.find((a) => a.account_global_legal_name === item.id)
        if (account) {
          setSearchSelectedAccount(account)
          setSearchAccountDialogOpen(true)
        }
      } else if (item.type === "center") {
        if (!centersEnabled) {
          toast.info(getSectionUnavailableMessage("centers"))
          return
        }
        const center = centers.find((c) => c.cn_unique_key === item.id)
        if (center) {
          setSearchSelectedCenter(center)
          setSearchCenterDialogOpen(true)
        }
      } else if (item.type === "prospect") {
        if (!prospectsEnabled) {
          toast.info(getSectionUnavailableMessage("prospects"))
          return
        }
        const prospect = prospects.find(
          (p) =>
            `${p.account_global_legal_name}::${p.prospect_full_name ?? `${p.prospect_first_name ?? ""} ${p.prospect_last_name ?? ""}`.trim()}` ===
            item.id
        )
        if (prospect) {
          setSearchSelectedProspect(prospect)
          setSearchProspectDialogOpen(true)
        }
      }
    },
    [
      handleSearchClose,
      accounts,
      centers,
      prospects,
      accountsEnabled,
      centersEnabled,
      prospectsEnabled,
      setSearchSelectedAccount,
      setSearchAccountDialogOpen,
      setSearchSelectedCenter,
      setSearchCenterDialogOpen,
      setSearchSelectedProspect,
      setSearchProspectDialogOpen,
    ]
  )

  const handleSearchRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchQuery(query)
    },
    [setSearchQuery]
  )

  const handleSearchActionSelect = useCallback(
    (action: string) => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_ACTION_SELECTED, { action })

      switch (action) {
        case "go-accounts":
          handleSectionSelect("accounts")
          break
        case "go-centers":
          handleSectionSelect("centers")
          break
        case "go-prospects":
          handleSectionSelect("prospects")
          break
        case "refresh":
          loadData()
          break
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break
      }
    },
    [handleSearchClose, handleSectionSelect, loadData, setTheme, resolvedTheme]
  )

  return {
    handleSearchResultSelect,
    handleSearchRecentItemSelect,
    handleSearchRecentSearchSelect,
    handleSearchActionSelect,
  }
}
