"use client"

import { useCallback, useRef, useState, type ComponentProps } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import type { GlobalSearch } from "@/components/search/global-search"
import type { HistoryDialog } from "@/components/history/history-dialog"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { fetchProspectById } from "@/lib/dashboard/api-client"
import { NO_ACCOUNTS, NO_ALIASES, NO_CENTERS, NO_PROSPECTS } from "@/lib/dashboard/empty-datasets"
import { accountRelatedQuery, centerDetailQuery } from "@/lib/dashboard/queries"
import { getQueryClient } from "@/lib/query-client"
import type { SearchResult } from "@/lib/search"
import type { Account, Center, Prospect } from "@/lib/types"
import type { DashboardSection } from "@/hooks/use-dashboard-layout"
import { useGlobalSearch } from "@/hooks/use-global-search"
import { useRecentItems, type RecentItem } from "@/hooks/use-recent-items"
import { useRecordOpener } from "@/hooks/use-record-opener"

type OpenedFrom = "global_search" | "history" | "related_account_link"

export type RecordDialog<T> = {
  record: T | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export type SearchRecordDialogsState = {
  account: RecordDialog<Account>
  center: RecordDialog<Center> & { onAccountOpen: (accountName: string) => void }
  prospect: RecordDialog<Prospect> & { onAccountOpen: (accountName: string) => void }
}

export interface UseDashboardSearchParams {
  /** The view on screen, reported as the source of records opened here. */
  currentScreenView: string
  onSectionSelect: (section: DashboardSection) => void
  onReload: () => void
}

/**
 * Global search, the history dialog, and the record dialogs they open
 * (separate from the dialogs each table opens). Records opened here report
 * record_opened / record_closed like the tables do, so dwell time compares.
 */
export function useDashboardSearch({ currentScreenView, onSectionSelect, onReload }: UseDashboardSearchParams) {
  const { setTheme, resolvedTheme } = useTheme()
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isSearching,
    focus: searchFocus,
    setFocus: setSearchFocus,
    isOpen: isSearchOpen,
    setIsOpen: setIsSearchOpen,
    handleOpen: handleSearchOpen,
    handleClose: handleSearchClose,
  } = useGlobalSearch({
    accounts: NO_ACCOUNTS,
    centers: NO_CENTERS,
    prospects: NO_PROSPECTS,
    aliases: NO_ALIASES,
    serverMode: true,
  })

  const {
    recentItems,
    recentSearches,
    addRecentItem,
    addRecentSearch,
    clearRecentItems,
    removeRecentItem,
    restoreRecentItems,
  } = useRecentItems()

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const openHistory = useCallback(() => setHistoryDialogOpen(true), [])

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [centerDialogOpen, setCenterDialogOpen] = useState(false)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [prospectDialogOpen, setProspectDialogOpen] = useState(false)

  const openedRecordRef = useRef<{ entity: string; recordId: string; openedAt: number } | null>(null)

  const trackRecordClosed = useCallback((closeReason: "dialog_closed" | "switch_to_another_record") => {
    const opened = openedRecordRef.current
    if (!opened) {
      return
    }
    openedRecordRef.current = null
    captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
      entity: opened.entity,
      record_id: opened.recordId,
      dwell_seconds: Math.max(0, Math.round((Date.now() - opened.openedAt) / 1000)),
      close_reason: closeReason,
    })
  }, [])

  const trackRecordOpened = useCallback(
    (record: { entity: string; recordId: string; recordLabel: string; openedFrom: OpenedFrom }) => {
      trackRecordClosed("switch_to_another_record")
      openedRecordRef.current = {
        entity: record.entity,
        recordId: record.recordId,
        openedAt: Date.now(),
      }
      captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
        entity: record.entity,
        record_id: record.recordId,
        record_label: record.recordLabel,
        source_view: currentScreenView,
        opened_from: record.openedFrom,
      })
    },
    [trackRecordClosed, currentScreenView]
  )

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      handleSearchClose()
      if (searchQuery.trim()) {
        addRecentSearch(searchQuery.trim())
      }
      captureEvent(ANALYTICS_EVENTS.SEARCH_RESULT_SELECTED, {
        result_type: result.type,
        query: searchQuery,
      })

      // Server results without a hydrated row (e.g. keyless prospects) cannot
      // open a detail dialog.
      if (!result.data) {
        toast.info("This record is not available right now")
        return
      }

      trackRecordOpened({
        entity: result.type,
        recordId: result.id,
        recordLabel: result.title,
        openedFrom: "global_search",
      })

      if (result.type === "account") {
        setSelectedAccount(result.data as Account)
        setAccountDialogOpen(true)
      } else if (result.type === "center") {
        setSelectedCenter(result.data as Center)
        setCenterDialogOpen(true)
      } else if (result.type === "prospect") {
        setSelectedProspect(result.data as Prospect)
        setProspectDialogOpen(true)
      }
    },
    [handleSearchClose, addRecentSearch, searchQuery, trackRecordOpened]
  )

  const openRecord = useRecordOpener()

  const handleRecentItemSelect = useCallback(
    (item: RecentItem, source: "global_search" | "history_dialog") => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_RECENT_ITEM_SELECTED, {
        result_type: item.type,
        source,
      })

      const trackOpened = () =>
        trackRecordOpened({
          entity: item.type,
          recordId: item.id,
          recordLabel: item.title,
          openedFrom: source === "history_dialog" ? "history" : "global_search",
        })

      // Fetch the record and open its dialog
      if (item.type === "account") {
        openRecord({
          label: "account",
          load: () => getQueryClient().fetchQuery(accountRelatedQuery(item.id)).then((res) => res.account),
          onLoaded: (account) => {
            trackOpened()
            setSelectedAccount(account)
            setAccountDialogOpen(true)
          },
          notFoundMessage: "This account could not be found",
          errorMessage: "This account is not available right now",
        })
      } else if (item.type === "center") {
        openRecord({
          label: "centre",
          load: () => getQueryClient().fetchQuery(centerDetailQuery(item.id)).then((res) => res.center),
          onLoaded: (center) => {
            trackOpened()
            setSelectedCenter(center)
            setCenterDialogOpen(true)
          },
          notFoundMessage: "This centre could not be found",
          errorMessage: "This centre is not available right now",
        })
      } else if (item.type === "prospect") {
        openRecord({
          label: "prospect",
          load: () => fetchProspectById(item.id).then((res) => res.prospect),
          onLoaded: (prospect) => {
            trackOpened()
            setSelectedProspect(prospect)
            setProspectDialogOpen(true)
          },
          notFoundMessage: "This prospect could not be found",
          errorMessage: "This prospect is not available right now",
        })
      }
    },
    [handleSearchClose, trackRecordOpened, openRecord]
  )

  const handleSearchRecentItemSelect = useCallback(
    (item: RecentItem) => handleRecentItemSelect(item, "global_search"),
    [handleRecentItemSelect]
  )
  const handleHistoryItemSelect = useCallback(
    (item: RecentItem) => handleRecentItemSelect(item, "history_dialog"),
    [handleRecentItemSelect]
  )
  const handleRemoveHistoryItem = useCallback((item: RecentItem) => removeRecentItem(item.type, item.id), [removeRecentItem])

  const handleAccountDialogOpenChange = useCallback(
    (open: boolean) => {
      setAccountDialogOpen(open)
      if (!open) trackRecordClosed("dialog_closed")
    },
    [trackRecordClosed]
  )
  const handleCenterDialogOpenChange = useCallback(
    (open: boolean) => {
      setCenterDialogOpen(open)
      if (!open) trackRecordClosed("dialog_closed")
    },
    [trackRecordClosed]
  )
  const handleProspectDialogOpenChange = useCallback(
    (open: boolean) => {
      setProspectDialogOpen(open)
      if (!open) trackRecordClosed("dialog_closed")
    },
    [trackRecordClosed]
  )

  const openRelatedAccount = useCallback(
    (parentEntity: "center" | "prospect", accountName: string) => {
      // related_record_opened is captured by the dialog that owns the link
      openRecord({
        label: "account",
        load: () => getQueryClient().fetchQuery(accountRelatedQuery(accountName)).then((res) => res.account),
        onLoaded: (account) => {
          if (parentEntity === "center") {
            setCenterDialogOpen(false)
          } else {
            setProspectDialogOpen(false)
          }
          trackRecordOpened({
            entity: "account",
            recordId: account.account_global_legal_name,
            recordLabel: account.account_global_legal_name,
            openedFrom: "related_account_link",
          })
          setSelectedAccount(account)
          setAccountDialogOpen(true)
        },
        notFoundMessage: "This account could not be found",
        errorMessage: "This account is not available right now",
      })
    },
    [trackRecordOpened, openRecord]
  )

  const handleSelectRecentSearch = useCallback(
    (query: string) => {
      captureEvent(ANALYTICS_EVENTS.SEARCH_RECENT_QUERY_SELECTED, { query })
      setSearchQuery(query)
    },
    [setSearchQuery]
  )

  const handleSelectAction = useCallback(
    (action: string) => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_ACTION_SELECTED, { action })

      switch (action) {
        case "go-accounts":
          onSectionSelect("accounts")
          break
        case "go-centers":
          onSectionSelect("centers")
          break
        case "go-prospects":
          onSectionSelect("prospects")
          break
        case "refresh":
          onReload()
          break
        case "toggle-theme": {
          const nextTheme = resolvedTheme === "dark" ? "light" : "dark"
          captureEvent(ANALYTICS_EVENTS.THEME_CHANGED, {
            theme: nextTheme,
            previous_theme: resolvedTheme,
            source: "search_action",
          })
          setTheme(nextTheme)
          break
        }
      }
    },
    [handleSearchClose, onSectionSelect, onReload, setTheme, resolvedTheme]
  )

  const handleSearchOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        captureEvent(ANALYTICS_EVENTS.SEARCH_OPENED, { trigger: "shortcut_or_button" })
      } else {
        captureEvent(ANALYTICS_EVENTS.SEARCH_CLOSED, { had_query: searchQuery.length > 0 })
      }
      setIsSearchOpen(open)
      if (!open) {
        setSearchQuery("")
      }
    },
    [setIsSearchOpen, setSearchQuery, searchQuery]
  )

  const searchProps: ComponentProps<typeof GlobalSearch> = {
    open: isSearchOpen,
    onOpenChange: handleSearchOpenChange,
    query: searchQuery,
    onQueryChange: setSearchQuery,
    results: searchResults,
    isSearching,
    focus: searchFocus,
    onFocusChange: setSearchFocus,
    recentItems,
    recentSearches,
    onSelectResult: handleSelectResult,
    onSelectRecentItem: handleSearchRecentItemSelect,
    onSelectRecentSearch: handleSelectRecentSearch,
    onSelectAction: handleSelectAction,
  }

  const historyProps: ComponentProps<typeof HistoryDialog> = {
    open: historyDialogOpen,
    onOpenChange: setHistoryDialogOpen,
    recentItems,
    onItemSelect: handleHistoryItemSelect,
    onClearHistory: clearRecentItems,
    onRemoveItem: handleRemoveHistoryItem,
    onRestoreHistory: restoreRecentItems,
  }

  const recordDialogs: SearchRecordDialogsState = {
    account: { record: selectedAccount, open: accountDialogOpen, onOpenChange: handleAccountDialogOpenChange },
    center: {
      record: selectedCenter,
      open: centerDialogOpen,
      onOpenChange: handleCenterDialogOpenChange,
      onAccountOpen: (accountName) => openRelatedAccount("center", accountName),
    },
    prospect: {
      record: selectedProspect,
      open: prospectDialogOpen,
      onOpenChange: handleProspectDialogOpenChange,
      onAccountOpen: (accountName) => openRelatedAccount("prospect", accountName),
    },
  }

  return { openSearch: handleSearchOpen, openHistory, addRecentItem, searchProps, historyProps, recordDialogs }
}
