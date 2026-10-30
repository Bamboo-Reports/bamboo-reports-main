"use client"

import { useState, useCallback, useEffect, useMemo, memo } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RiAddLine, RiArrowDownSLine, RiBookmarkLine, RiCheckLine, RiDeleteBinLine, RiFileList3Line, RiGroupLine, RiSave3Line, RiSettings4Line, RiShareLine } from "@remixicon/react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot, normalizeTrackedText, toTrackedStringArray } from "@/lib/analytics/tracking"
import type { Filters } from "@/lib/types"
import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import { cn } from "@/lib/utils"
import { SavedFilterCard, type SavedFilter } from "@/components/filters/saved-filter-card"
import { useSavedFilters, type FilterShare } from "@/hooks/use-saved-filters"
import { AccountListsDialog } from "@/components/filters/account-lists-dialog"
import { useAccountLists } from "@/contexts/account-lists-context"
import { withAccountLists, type AccountList } from "@/lib/accounts/account-lists"

interface SavedFiltersManagerProps {
  currentFilters: Filters
  onLoadFilters: (filters: Filters) => void
  totalActiveFilters: number
  /** Opens the saved filters menu whenever this number changes (used by the collapsed rail). */
  openMenuSignal?: number
  /** Opens the account lists dialog whenever this number changes. */
  openAccountListsSignal?: number
  /** How many filters a saved filter sets, counted the same way as the sidebar total. */
  countFilters?: (filters: Filters) => number
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

/** "updated yesterday", "updated 3 weeks ago". */
function formatUpdated(iso: string): string | null {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  const days = Math.round((then - Date.now()) / 86_400_000)
  if (days > -1) return "updated today"
  if (days > -7) return `updated ${RELATIVE_TIME.format(days, "day")}`
  if (days > -60) return `updated ${RELATIVE_TIME.format(Math.round(days / 7), "week")}`
  return `updated ${RELATIVE_TIME.format(Math.round(days / 30), "month")}`
}

export const SavedFiltersManager = memo(function SavedFiltersManager({
  currentFilters,
  onLoadFilters,
  totalActiveFilters,
  openMenuSignal = 0,
  openAccountListsSignal = 0,
  countFilters = calculateActiveFilters,
}: SavedFiltersManagerProps) {
  const {
    savedFilters,
    loading,
    userId,
    saveFilter,
    deleteFilter,
    updateFilter,
    shareFilter,
    unshareFilter,
    getFilterShares,
  } = useSavedFilters()

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [accountListsOpen, setAccountListsOpen] = useState(false)
  // The last loaded saved filter. `snapshot` is the filters it produced, taken
  // on the first render after loading. Its name stays while filters are applied,
  // and `isModified` marks when they no longer match what was saved.
  const [appliedFilter, setAppliedFilter] = useState<{
    id: string
    name: string
    owned: boolean
    baseline: Filters
    snapshot: string | null
  } | null>(null)
  if (appliedFilter && appliedFilter.snapshot === null && currentFilters !== appliedFilter.baseline) {
    setAppliedFilter({ ...appliedFilter, snapshot: JSON.stringify(currentFilters) })
  }
  const activeSavedFilter = appliedFilter?.snapshot != null && totalActiveFilters > 0 ? appliedFilter : null
  const isModified = activeSavedFilter != null && JSON.stringify(currentFilters) !== activeSavedFilter.snapshot
  const { lists: accountLists } = useAccountLists()
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [savedFiltersDropdownOpen, setSavedFiltersDropdownOpen] = useState(false)
  const [filterName, setFilterName] = useState("")

  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [editName, setEditName] = useState("")

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [filterToDelete, setFilterToDelete] = useState<SavedFilter | null>(null)

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [filterToShare, setFilterToShare] = useState<SavedFilter | null>(null)
  const [shareEmail, setShareEmail] = useState("")
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)
  const [currentShares, setCurrentShares] = useState<FilterShare[]>([])

  // Split filters into own and shared
  const myFilters = useMemo(
    () => savedFilters.filter((f) => f.user_id === userId),
    [savedFilters, userId]
  )
  const sharedWithMeFilters = useMemo(
    () => savedFilters.filter((f) => f.user_id !== userId),
    [savedFilters, userId]
  )

  const handleSaveFilter = useCallback(async () => {
    const success = await saveFilter(filterName, currentFilters)
    if (success) {
      setSaveDialogOpen(false)
      setFilterName("")
    }
  }, [currentFilters, filterName, saveFilter])

  // Adds the list to whatever is applied now (it does not reset other filters).
  // Applying a list that is already in the filters switches its mode.
  const handleApplyAccountList = useCallback(
    (list: AccountList, mode: "include" | "exclude") => {
      const already = currentFilters.accountListValues.some((v) => v.value === list.id)
      const selection = already
        ? currentFilters.accountListValues.map((v) => (v.value === list.id ? { ...v, mode } : v))
        : [...currentFilters.accountListValues, { value: list.id, mode }]
      const lists = accountLists.some((l) => l.id === list.id) ? accountLists : [...accountLists, list]
      onLoadFilters(withAccountLists(currentFilters, selection, lists))
    },
    [currentFilters, accountLists, onLoadFilters]
  )

  const handleLoadFilter = useCallback((savedFilter: SavedFilter) => {
    setAppliedFilter({ id: savedFilter.id, name: savedFilter.name, owned: savedFilter.user_id === userId, baseline: currentFilters, snapshot: null })
    onLoadFilters(savedFilter.filters)
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_LOADED, {
      saved_filter_id: savedFilter.id,
      saved_filter_name: normalizeTrackedText(savedFilter.name),
      loaded_active_filters_count: calculateActiveFilters(savedFilter.filters),
      loaded_filters_snapshot: buildTrackedFiltersSnapshot(savedFilter.filters),
    })
  }, [onLoadFilters, currentFilters, userId])

  // Writes the current filters into the applied saved filter.
  const handleUpdateApplied = useCallback(async () => {
    if (!activeSavedFilter) return
    const success = await updateFilter(activeSavedFilter.id, activeSavedFilter.name, currentFilters)
    if (success) setAppliedFilter({ ...activeSavedFilter, snapshot: JSON.stringify(currentFilters) })
  }, [activeSavedFilter, currentFilters, updateFilter])

  useEffect(() => {
    if (openMenuSignal > 0) setSavedFiltersDropdownOpen(true)
  }, [openMenuSignal])

  useEffect(() => {
    if (openAccountListsSignal > 0) setAccountListsOpen(true)
  }, [openAccountListsSignal])

  const handleDeleteFilter = useCallback((filter: SavedFilter) => {
    setFilterToDelete(filter)
    setDeleteConfirmOpen(true)
  }, [])

  const confirmDeleteFilter = useCallback(async () => {
    if (!filterToDelete) return
    const success = await deleteFilter(filterToDelete.id)
    if (success) {
      setDeleteConfirmOpen(false)
      setFilterToDelete(null)
    }
  }, [filterToDelete, deleteFilter])

  const handleUpdateFilter = useCallback(async () => {
    if (!editingFilter || !editName.trim()) return
    const success = await updateFilter(editingFilter.id, editName, editingFilter.filters)
    if (success) {
      setEditingFilter(null)
      setEditName("")
    }
  }, [editingFilter, editName, updateFilter])

  const handleEdit = useCallback((filter: SavedFilter) => {
    setEditingFilter(filter)
    setEditName(filter.name)
  }, [])

  // Share handlers
  const handleOpenShareDialog = useCallback(async (filter: SavedFilter) => {
    setFilterToShare(filter)
    setShareEmail("")
    setShareError(null)
    setShareSuccess(null)
    setCurrentShares([])
    setShareDialogOpen(true)

    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_SHARE_DIALOG_OPENED, {
      saved_filter_id: filter.id,
      saved_filter_name: normalizeTrackedText(filter.name),
    })

    const shares = await getFilterShares(filter.id)
    setCurrentShares(shares)
  }, [getFilterShares])

  const handleShareFilter = useCallback(async () => {
    if (!filterToShare || !shareEmail.trim()) return

    setShareError(null)
    setShareSuccess(null)

    const result = await shareFilter(filterToShare.id, shareEmail)
    if (result.success) {
      setShareSuccess(`Shared with ${shareEmail.trim()}!`)
      setShareEmail("")
      // Refresh shares list
      const shares = await getFilterShares(filterToShare.id)
      setCurrentShares(shares)
    } else {
      setShareError(result.error ?? "Failed to share filter")
    }
  }, [filterToShare, shareEmail, shareFilter, getFilterShares])

  const handleUnshareFilter = useCallback(async (share: FilterShare) => {
    if (!filterToShare) return
    const success = await unshareFilter(share.filter_id, share.shared_with_user_id)
    if (success) {
      setCurrentShares((prev) => prev.filter((s) => s.id !== share.id))
    }
  }, [filterToShare, unshareFilter])

  useEffect(() => {
    if (!savedFiltersDropdownOpen) return
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTERS_DROPDOWN_OPENED, {
      saved_filter_count: savedFilters.length,
      saved_filter_ids: toTrackedStringArray(savedFilters.map((filter) => filter.id)),
      saved_filter_names: toTrackedStringArray(savedFilters.map((filter) => filter.name)),
    })
  }, [savedFiltersDropdownOpen, savedFilters])

  useEffect(() => {
    if (!saveDialogOpen) return
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_SAVE_DIALOG_OPENED, {
      total_active_filters: totalActiveFilters,
      current_filters_snapshot: buildTrackedFiltersSnapshot(currentFilters),
    })
  }, [saveDialogOpen, totalActiveFilters, currentFilters])

  useEffect(() => {
    if (!manageDialogOpen) return
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTERS_MANAGE_OPENED, {
      saved_filter_count: savedFilters.length,
      saved_filter_ids: toTrackedStringArray(savedFilters.map((filter) => filter.id)),
      saved_filter_names: toTrackedStringArray(savedFilters.map((filter) => filter.name)),
    })
  }, [manageDialogOpen, savedFilters])

  useEffect(() => {
    if (!deleteConfirmOpen) return
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_DELETE_CONFIRM_OPENED, {
      saved_filter_id: filterToDelete?.id ?? null,
      saved_filter_name: filterToDelete?.name ? normalizeTrackedText(filterToDelete.name) : null,
      saved_filter_active_filters_count: filterToDelete ? calculateActiveFilters(filterToDelete.filters) : null,
      saved_filter_snapshot: filterToDelete ? buildTrackedFiltersSnapshot(filterToDelete.filters) : null,
    })
  }, [deleteConfirmOpen, filterToDelete])

  const renderSavedItem = (filter: SavedFilter, owned: boolean) => {
    const applied = activeSavedFilter?.id === filter.id
    const updated = formatUpdated(filter.updated_at)
    const count = countFilters(filter.filters)
    const meta = applied
      ? isModified ? "Applied · changed since saving" : "Applied"
      : [`${count} ${count === 1 ? "filter" : "filters"}`, owned ? updated : filter.owner_email ? `from ${filter.owner_email}` : "shared with you"].filter(Boolean).join(" · ")
    const Icon = applied ? RiCheckLine : owned ? RiBookmarkLine : RiGroupLine
    return (
      <DropdownMenuItem
        key={filter.id}
        className={cn("group gap-2.5 py-1.5", applied && "bg-primary/5")}
        onSelect={() => handleLoadFilter(filter)}
        title={filter.name}
      >
        <Icon className={cn("h-4 w-4 shrink-0", applied ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{filter.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
        </span>
        {owned && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleOpenShareDialog(filter)
            }}
            aria-label={`Share saved filter ${filter.name}`}
            title="Share"
          >
            <RiShareLine className="h-3.5 w-3.5" />
          </Button>
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <div className="flex w-full items-center gap-1.5">
        <DropdownMenu open={savedFiltersDropdownOpen} onOpenChange={setSavedFiltersDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 min-w-0 flex-1 justify-start gap-2 px-2.5 font-normal">
              <RiBookmarkLine className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span
                className={cn("min-w-0 flex-1 truncate text-left", !activeSavedFilter && "text-muted-foreground")}
                title={activeSavedFilter ? `Applied: ${activeSavedFilter.name}` : undefined}
              >
                {activeSavedFilter?.name ?? "Saved filters"}
              </span>
              {isModified && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-ring" title="Changed since saving" aria-label="Changed since saving" />
              )}
              <RiArrowDownSLine className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-[280px] p-1" align="start">
            <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>My filters</span>
              {myFilters.length > 0 && <span className="tabular-nums">{myFilters.length}</span>}
            </div>
            {myFilters.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">No saved filters yet</div>
            ) : (
              myFilters.slice(0, 5).map((filter) => renderSavedItem(filter, true))
            )}

            {sharedWithMeFilters.length > 0 && (
              <>
                <div className="flex items-center justify-between px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Shared with me</span>
                  <span className="tabular-nums">{sharedWithMeFilters.length}</span>
                </div>
                {sharedWithMeFilters.slice(0, 5).map((filter) => renderSavedItem(filter, false))}
              </>
            )}

            <DropdownMenuSeparator />
            {isModified && activeSavedFilter?.owned && (
              <DropdownMenuItem className="gap-2.5 font-medium text-primary focus:text-primary" disabled={loading} onSelect={() => void handleUpdateApplied()}>
                <RiSave3Line className="h-4 w-4 shrink-0" />
                <span className="truncate">Update &ldquo;{activeSavedFilter.name}&rdquo;</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="gap-2.5" disabled={totalActiveFilters === 0} onSelect={() => setSaveDialogOpen(true)}>
              <RiAddLine className="h-4 w-4 shrink-0 text-muted-foreground" />
              Save current filters as new…
            </DropdownMenuItem>
            {(myFilters.length > 0 || sharedWithMeFilters.length > 0) && (
              <DropdownMenuItem className="gap-2.5" onSelect={() => setManageDialogOpen(true)}>
                <RiSettings4Line className="h-4 w-4 shrink-0 text-muted-foreground" />
                {myFilters.length > 5 || sharedWithMeFilters.length > 5
                  ? `Manage all filters (${myFilters.length + sharedWithMeFilters.length})`
                  : "Manage all filters"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Filter Configuration</DialogTitle>
              <DialogDescription>
                {totalActiveFilters === 1 ? "Save this filter so you can apply it again later." : `Save these ${totalActiveFilters} filters so you can apply them again later.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="filter-name">Name</Label>
                <Input
                  id="filter-name"
                  placeholder="e.g., Q4 Prospect List, Tech Hiring..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveFilter} disabled={!filterName.trim() || loading}>
                {loading ? "Saving..." : "Save Filter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          title="Account lists: upload a client account list and apply it as a filter"
          aria-label="Account lists"
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.ACCOUNT_LISTS_MANAGE_OPENED)
            setAccountListsOpen(true)
          }}
          data-tour="account-lists-button"
        >
          <RiFileList3Line className="h-4 w-4" />
        </Button>

      <AccountListsDialog open={accountListsOpen} onOpenChange={setAccountListsOpen} onApply={handleApplyAccountList} />

      {/* Manage Saved Filters Dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Saved Filters</DialogTitle>
            <DialogDescription>View, edit, or delete your saved filter sets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {myFilters.length === 0 && sharedWithMeFilters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No saved filters found.</div>
            ) : (
              <>
                {myFilters.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Filters</h3>
                    {myFilters.map((filter) => (
                      <SavedFilterCard
                        key={filter.id}
                        filter={filter}
                        isOwner={true}
                        onLoad={(f) => {
                          handleLoadFilter(f)
                          setManageDialogOpen(false)
                        }}
                        onEdit={handleEdit}
                        onDelete={handleDeleteFilter}
                        onShare={handleOpenShareDialog}
                      />
                    ))}
                  </>
                )}
                {sharedWithMeFilters.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mt-6">
                      <RiGroupLine className="h-3.5 w-3.5" />
                      Shared with me
                    </h3>
                    {sharedWithMeFilters.map((filter) => (
                      <SavedFilterCard
                        key={filter.id}
                        filter={filter}
                        isOwner={false}
                        onLoad={(f) => {
                          handleLoadFilter(f)
                          setManageDialogOpen(false)
                        }}
                        onEdit={handleEdit}
                        onDelete={handleDeleteFilter}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Filter Set</AlertDialogTitle>
            <AlertDialogDescription>
              {`Are you sure you want to delete "${filterToDelete?.name ?? ""}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFilterToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFilter}
              className={buttonVariants({ variant: "destructive" })}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Filter Dialog */}
      <Dialog
        open={!!editingFilter}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFilter(null)
            setEditName("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Filter Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFilter(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateFilter} disabled={!editName.trim() || loading}>
              {loading ? "Updating..." : "Update Name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Filter Dialog */}
      <Dialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShareDialogOpen(false)
            setFilterToShare(null)
            setShareEmail("")
            setShareError(null)
            setShareSuccess(null)
            setCurrentShares([])
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RiShareLine className="h-5 w-5" />
              Share Filter
            </DialogTitle>
            <DialogDescription>
              {filterToShare
                ? `Share "${filterToShare.name}" with a teammate by entering their email address.`
                : "Share this filter with a teammate."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="share-email">Email address</Label>
              <div className="flex gap-2">
                <Input
                  id="share-email"
                  type="email"
                  placeholder="teammate@company.com"
                  value={shareEmail}
                  onChange={(e) => {
                    setShareEmail(e.target.value)
                    setShareError(null)
                    setShareSuccess(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleShareFilter()
                    }
                  }}
                />
                <Button
                  onClick={handleShareFilter}
                  disabled={!shareEmail.trim() || loading}
                  size="lg"
                  className="shrink-0"
                >
                  {loading ? "Sharing..." : "Share"}
                </Button>
              </div>
              {shareError && (
                <p className="text-sm text-destructive">{shareError}</p>
              )}
              {shareSuccess && (
                <p className="text-sm text-green-600 dark:text-green-400">{shareSuccess}</p>
              )}
            </div>

            {/* Current shares list */}
            {currentShares.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Currently shared with</Label>
                <div className="space-y-1.5">
                  {currentShares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm"
                    >
                      <span className="truncate">{share.shared_with_email}</span>
                      <Button
                        type="button"
                        variant="ghost-destructive"
                        size="icon-xs"
                        className="shrink-0"
                        onClick={() => handleUnshareFilter(share)}
                        aria-label={`Revoke access for ${share.shared_with_email}`}
                      >
                        <RiDeleteBinLine className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
