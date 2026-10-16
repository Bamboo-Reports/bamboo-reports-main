"use client"

import { useState, useCallback, useEffect, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { RiArrowDownSLine, RiCloseLine, RiDeleteBinLine, RiFileExcel2Line, RiFileTextLine, RiFolderOpenLine, RiLoader4Line, RiLockLine, RiGroupLine, RiSaveLine, RiSettings4Line, RiShareLine, RiShieldFlashLine, RiUploadLine } from "@remixicon/react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot, normalizeTrackedText, toTrackedStringArray } from "@/lib/analytics/tracking"
import type { Filters } from "@/lib/types"
import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import { SavedFilterCard, type SavedFilter } from "@/components/filters/saved-filter-card"
import { useSavedFilters, type FilterShare } from "@/hooks/use-saved-filters"
import { AccountListsDialog } from "@/components/filters/account-lists-dialog"
import { useAccountLists } from "@/contexts/account-lists-context"
import { withAccountLists, type AccountList } from "@/lib/accounts/account-lists"

interface SavedFiltersManagerProps {
  currentFilters: Filters
  onLoadFilters: (filters: Filters) => void
  totalActiveFilters: number
  onReset?: () => void
  onExport?: () => void
  canExport?: boolean
  exportBlockedMessage?: string
  /** Downloads a PDF of the summary counts plus the filters that produced them. */
  onGenerateReport?: () => void
  isGeneratingReport?: boolean
}

export const SavedFiltersManager = memo(function SavedFiltersManager({
  currentFilters,
  onLoadFilters,
  totalActiveFilters,
  onReset,
  onExport,
  canExport = true,
  exportBlockedMessage = "You are not allowed to export data. Please contact an admin.",
  onGenerateReport,
  isGeneratingReport = false,
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
  const { lists: accountLists } = useAccountLists()
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [savedFiltersDropdownOpen, setSavedFiltersDropdownOpen] = useState(false)
  const [filterName, setFilterName] = useState("")

  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [editName, setEditName] = useState("")

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [filterToDelete, setFilterToDelete] = useState<SavedFilter | null>(null)
  const [exportAccessError, setExportAccessError] = useState<string | null>(null)

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

  // The saved filter last loaded, shown in the dropdown trigger while the
  // applied filters still match what loading it produced. `applied` is filled
  // on the first render after the load (loading sanitizes and expands account
  // lists, so the result can differ from the stored filters); any later
  // change to the filters clears it. Uses the "adjust state while rendering"
  // pattern instead of an effect.
  const [activeSaved, setActiveSaved] = useState<{ id: string; before: Filters; applied: Filters | null } | null>(null)
  if (activeSaved) {
    if (activeSaved.applied === null) {
      if (currentFilters !== activeSaved.before) setActiveSaved({ ...activeSaved, applied: currentFilters })
    } else if (
      currentFilters !== activeSaved.applied &&
      JSON.stringify(currentFilters) !== JSON.stringify(activeSaved.applied)
    ) {
      setActiveSaved(null)
    }
  }
  // Looked up by id so a rename shows straight away and a deleted filter drops out.
  const activeSavedName = activeSaved ? savedFilters.find((f) => f.id === activeSaved.id)?.name ?? null : null

  const handleSaveFilter = useCallback(async () => {
    const success = await saveFilter(filterName, currentFilters)
    if (success) {
      setSaveDialogOpen(false)
      setFilterName("")
    }
  }, [currentFilters, filterName, saveFilter])

  // Adds the list to whatever is applied now (it does not reset other filters).
  const handleApplyAccountList = useCallback(
    (list: AccountList) => {
      const already = currentFilters.accountListValues.some((v) => v.value === list.id)
      const selection = already ? currentFilters.accountListValues : [...currentFilters.accountListValues, { value: list.id, mode: "include" as const }]
      const lists = accountLists.some((l) => l.id === list.id) ? accountLists : [...accountLists, list]
      onLoadFilters(withAccountLists(currentFilters, selection, lists))
    },
    [currentFilters, accountLists, onLoadFilters]
  )

  const handleLoadFilter = useCallback((savedFilter: SavedFilter) => {
    setActiveSaved({ id: savedFilter.id, before: currentFilters, applied: null })
    onLoadFilters(savedFilter.filters)
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_LOADED, {
      saved_filter_id: savedFilter.id,
      saved_filter_name: normalizeTrackedText(savedFilter.name),
      loaded_active_filters_count: calculateActiveFilters(savedFilter.filters),
      loaded_filters_snapshot: buildTrackedFiltersSnapshot(savedFilter.filters),
    })
  }, [currentFilters, onLoadFilters])

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

  const handleExportAction = useCallback(() => {
    if (!onExport) {
      return
    }

    if (!canExport) {
      setExportAccessError(exportBlockedMessage)
      return
    }

    setExportAccessError(null)
    onExport()
  }, [onExport, canExport, exportBlockedMessage])

  const handleDismissExportAccessError = useCallback(() => {
    setExportAccessError(null)
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

  useEffect(() => {
    if (canExport && exportAccessError) {
      setExportAccessError(null)
    }
  }, [canExport, exportAccessError])

  return (
    <div className="flex flex-col gap-3 w-full bg-sidebar-accent/5 p-3 rounded-lg border border-sidebar-border/50">
      <div className="flex items-center gap-2 w-full">
        <DropdownMenu open={savedFiltersDropdownOpen} onOpenChange={setSavedFiltersDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-between h-9"
            >
              <div className="flex items-center gap-2 truncate">
                <RiFolderOpenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate" title={activeSavedName ?? undefined}>
                  {activeSavedName ?? "Saved Filters"}
                </span>
              </div>
              <RiArrowDownSLine className="h-3.5 w-3.5 opacity-50 ml-2 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-[220px]" align="start">
            {/* My Filters Section */}
            <div className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              My Saved Filters
            </div>
            <DropdownMenuSeparator />
            {myFilters.length === 0 ? (
              <div className="px-4 py-3 text-sm text-center text-muted-foreground italic">
                No saved filters
              </div>
            ) : (
              myFilters.slice(0, 5).map((filter) => (
                // Load and Share are sibling menu items (not buttons nested in
                // one item) so Enter loads the filter and arrow keys reach Share.
                <div key={filter.id} className="flex items-center gap-1">
                  <DropdownMenuItem
                    className="min-w-0 flex-1 py-2"
                    onSelect={() => handleLoadFilter(filter)}
                    title={filter.name}
                  >
                    <span className="truncate font-medium text-sm">{filter.name}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-8 w-8 shrink-0 justify-center p-0 text-muted-foreground focus:text-foreground"
                    onSelect={() => handleOpenShareDialog(filter)}
                    aria-label={`Share saved filter ${filter.name}`}
                    title="Share"
                  >
                    <RiShareLine className="!size-3.5" />
                  </DropdownMenuItem>
                </div>
              ))
            )}

            {/* Shared with me Section */}
            {sharedWithMeFilters.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <RiGroupLine className="h-3 w-3" />
                  Shared with me
                </div>
                <DropdownMenuSeparator />
                {sharedWithMeFilters.slice(0, 5).map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    className="py-2"
                    onSelect={() => handleLoadFilter(filter)}
                    title={filter.name}
                  >
                    <span className="truncate font-medium text-sm">{filter.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {(myFilters.length > 0 || sharedWithMeFilters.length > 0) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-muted-foreground focus:text-foreground"
                  onSelect={() => setManageDialogOpen(true)}
                >
                  <RiSettings4Line className="!size-3.5" />
                  {myFilters.length > 5 || sharedWithMeFilters.length > 5
                    ? `Manage all filters (${myFilters.length + sharedWithMeFilters.length})…`
                    : "Manage all filters…"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogTrigger asChild>
            {/* aria-disabled rather than disabled, so the button stays focusable
                and its tooltip still explains why it can't be used yet. */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-disabled={totalActiveFilters === 0}
              onClick={(e) => {
                if (totalActiveFilters === 0) e.preventDefault()
              }}
              className="h-9 w-9 rounded-full shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              title={totalActiveFilters === 0 ? "Apply a filter to save" : "Save current filters"}
              aria-label={totalActiveFilters === 0 ? "Save current filters (apply a filter first)" : "Save current filters"}
            >
              <RiSaveLine className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Filter Configuration</DialogTitle>
              <DialogDescription>
                Save your current layout of {totalActiveFilters} active filters to easily access them later.
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
              <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveFilter} disabled={!filterName.trim() || loading}>
                {loading ? "Saving..." : "Save List"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full shrink-0"
          title="Upload Accounts"
          aria-label="Upload Accounts"
          onClick={() => setAccountListsOpen(true)}
          data-tour="account-lists-button"
        >
          <RiUploadLine className="h-4 w-4" />
        </Button>
      </div>

      <AccountListsDialog open={accountListsOpen} onOpenChange={setAccountListsOpen} onApply={handleApplyAccountList} />

      {(onReset || onExport || onGenerateReport) && (
        <div className="grid grid-cols-2 gap-2 w-full">
          {onReset && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="w-full h-8 text-xs font-medium"
            >
              Reset
            </Button>
          )}
          {(onExport || onGenerateReport) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isGeneratingReport}
                  className="w-full h-8 text-xs font-medium"
                  aria-label="Export as Excel or Report"
                  data-tour="export-button"
                >
                  {isGeneratingReport && (
                    <RiLoader4Line className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  )}
                  {isGeneratingReport ? "Preparing..." : "Export"}
                  {!isGeneratingReport && <RiArrowDownSLine className="h-3.5 w-3.5 opacity-80" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[--radix-dropdown-menu-trigger-width] min-w-0">
                {onExport && (
                  <DropdownMenuItem
                    onSelect={handleExportAction}
                    className="gap-2.5"
                    title={canExport ? undefined : "Only admins can export Excel"}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-[5px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                        !canExport && "opacity-60 grayscale"
                      )}
                    >
                      <RiFileExcel2Line className="!size-3.5" />
                    </span>
                    <span className={cn(!canExport && "text-muted-foreground")}>Excel</span>
                    {!canExport && <RiLockLine className="ml-auto !size-3.5 text-muted-foreground" aria-label="Admins only" />}
                  </DropdownMenuItem>
                )}
                {onGenerateReport && (
                  <DropdownMenuItem onSelect={onGenerateReport} className="gap-2.5" data-tour="summary-report-button">
                    <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
                      <RiFileTextLine className="!size-3.5" />
                    </span>
                    Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}


      {exportAccessError ? (
        <div
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-lg border border-amber-400/40 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04))] p-2.5 dark:border-amber-300/30 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.2),rgba(120,53,15,0.28))]"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-amber-500/80" />
          <div className="flex items-start gap-2.5 pl-2">
            <div className="mt-0.5 rounded-md bg-amber-500/15 p-1 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">
              <RiShieldFlashLine className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200">
                Export restricted
              </p>
              <p className="text-xs text-amber-900/90 dark:text-amber-100/95">{exportAccessError}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-amber-800 hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-400/20 dark:hover:text-amber-50"
              onClick={handleDismissExportAccessError}
              aria-label="Dismiss export access warning"
            >
              <RiCloseLine className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

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
              className="bg-destructive hover:bg-destructive/90"
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
            <Button variant="ghost" onClick={() => setEditingFilter(null)}>
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
                  size="sm"
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
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
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
