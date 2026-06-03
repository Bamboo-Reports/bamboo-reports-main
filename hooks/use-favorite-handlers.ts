"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { Account, Center, Prospect } from "@/lib/types"
import type { FavoriteItem, FavoriteInput } from "@/hooks/use-favorites"
import { getProspectRecordId } from "@/lib/dashboard/prospect-id"

interface FavoriteHandlersContext {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  favorites: FavoriteItem[]
  toggleFavorite: (item: FavoriteInput) => Promise<{ ok: boolean; added: boolean } | null>
  addFavorites: (items: FavoriteInput[]) => Promise<boolean>
  removeFavorite: (entityType: "account" | "center" | "prospect", entityId: string) => Promise<boolean>
  removeFavorites: (items: FavoriteInput[]) => Promise<boolean>
  clearFavorites: () => Promise<boolean>
  setFavoritesDialogOpen: (open: boolean) => void
  setSearchSelectedAccount: (account: Account | null) => void
  setSearchAccountDialogOpen: (open: boolean) => void
  setSearchSelectedCenter: (center: Center | null) => void
  setSearchCenterDialogOpen: (open: boolean) => void
  setSearchSelectedProspect: (prospect: Prospect | null) => void
  setSearchProspectDialogOpen: (open: boolean) => void
}

export function useFavoriteHandlers(ctx: FavoriteHandlersContext) {
  const {
    accounts,
    centers,
    prospects,
    favorites,
    toggleFavorite,
    addFavorites,
    removeFavorite,
    removeFavorites,
    clearFavorites,
    setFavoritesDialogOpen,
    setSearchSelectedAccount,
    setSearchAccountDialogOpen,
    setSearchSelectedCenter,
    setSearchCenterDialogOpen,
    setSearchSelectedProspect,
    setSearchProspectDialogOpen,
  } = ctx

  const handleOpenFavorites = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.FAVORITES_VIEW_OPENED, { count: favorites.length })
    setFavoritesDialogOpen(true)
  }, [favorites.length, setFavoritesDialogOpen])

  const handleToggleFavorite = useCallback(
    async (item: FavoriteInput) => {
      const result = await toggleFavorite(item)
      if (!result) return
      if (!result.ok) {
        toast.error("Could not update favorites. Please try again.")
        return
      }
      toast.success(result.added ? "Added to favorites" : "Removed from favorites")
    },
    [toggleFavorite]
  )

  const handleFavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await addFavorites(items)
      if (!ok) {
        toast.error("Could not add to favorites. Please try again.")
        return
      }
      toast.success(`Added ${items.length} ${items.length === 1 ? "item" : "items"} to favorites`)
    },
    [addFavorites]
  )

  const handleRemoveFavorite = useCallback(
    async (item: FavoriteItem) => {
      const ok = await removeFavorite(item.entity_type, item.entity_id)
      toast[ok ? "success" : "error"](ok ? "Removed from favorites" : "Could not remove favorite. Please try again.")
    },
    [removeFavorite]
  )

  const handleUnfavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await removeFavorites(items)
      if (!ok) {
        toast.error("Could not remove from favorites. Please try again.")
        return
      }
      toast.success(`Removed ${items.length} ${items.length === 1 ? "item" : "items"} from favorites`)
    },
    [removeFavorites]
  )

  const handleClearFavorites = useCallback(async () => {
    const ok = await clearFavorites()
    toast[ok ? "success" : "error"](ok ? "Cleared all favorites" : "Could not clear favorites. Please try again.")
  }, [clearFavorites])

  const handleOpenFavorite = useCallback(
    (item: FavoriteItem) => {
      setFavoritesDialogOpen(false)
      if (item.entity_type === "account") {
        const account = accounts.find((a) => a.account_global_legal_name === item.entity_id)
        if (!account) return toast.info("This account is not available in the current dataset.")
        setSearchSelectedAccount(account)
        setSearchAccountDialogOpen(true)
      } else if (item.entity_type === "center") {
        const center = centers.find((c) => c.cn_unique_key === item.entity_id)
        if (!center) return toast.info("This center is not available in the current dataset.")
        setSearchSelectedCenter(center)
        setSearchCenterDialogOpen(true)
      } else {
        const prospect = prospects.find((p) => getProspectRecordId(p) === item.entity_id)
        if (!prospect) return toast.info("This prospect is not available in the current dataset.")
        setSearchSelectedProspect(prospect)
        setSearchProspectDialogOpen(true)
      }
    },
    [
      accounts,
      centers,
      prospects,
      setFavoritesDialogOpen,
      setSearchSelectedAccount,
      setSearchAccountDialogOpen,
      setSearchSelectedCenter,
      setSearchCenterDialogOpen,
      setSearchSelectedProspect,
      setSearchProspectDialogOpen,
    ]
  )

  return {
    handleOpenFavorites,
    handleToggleFavorite,
    handleFavoriteMany,
    handleRemoveFavorite,
    handleUnfavoriteMany,
    handleClearFavorites,
    handleOpenFavorite,
  }
}
