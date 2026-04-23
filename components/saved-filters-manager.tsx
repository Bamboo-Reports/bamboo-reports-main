"use client"

import { useState, useCallback, useEffect, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  BookmarkCheck,
  Download,
  Edit2,
  FolderOpen,
  RotateCcw,
  Save,
  Settings2,
  Share2,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot, normalizeTrackedText, toTrackedStringArray } from "@/lib/analytics/tracking"
import type { Filters } from "@/lib/types"
import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import { SavedFilterCard, type SavedFilter } from "@/components/filters/saved-filter-card"
import { useSavedFilters, type FilterShare } from "@/hooks/use-saved-filters"

interface SavedFiltersManagerProps {
  currentFilters: Filters
  onLoadFilters: (filters: Filters) => void
  totalActiveFilters: number
  onReset?: () => void
  onExport?: () => void
  canExport?: boolean
  exportBlockedMessage?: string
}

export const SavedFiltersManager = memo(function SavedFiltersManager({
  currentFilters,
  onLoadFilters,
  totalActiveFilters,
  onReset,
  onExport,
  canExport = true,
  exportBlockedMessage = "You are not allowed to export data. Please contact an admin.",
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
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [filterName, setFilterName] = useState("")

  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [editName, setEditName] = useState("")

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [filterToDelete, setFilterToDelete] = useState<SavedFilter | null>(null)
  const [exportAccessError, setExportAccessError] = useState<string | null>(null)

  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [filterToShare, setFilterToShare] = useState<SavedFilter | null>(null)
  const [shareEmail, setShareEmail] = useState("")
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)
  const [currentShares, setCurrentShares] = useState<FilterShare[]>([])

  const myFilters = useMemo(
    () => savedFilters.filter((f) => f.user_id === userId),
    [savedFilters, userId]
  )
  const sharedWithMeFilters = useMemo(
    () => savedFilters.filter((f) => f.user_id !== userId),
    [savedFilters, userId]
  )

  const totalCount = myFilters.length + sharedWithMeFilters.length

  const handleSaveFilter = useCallback(async () => {
    const success = await saveFilter(filterName, currentFilters)
    if (success) {
      setSaveDialogOpen(false)
      setFilterName("")
    }
  }, [currentFilters, filterName, saveFilter])

  const handleLoadFilter = useCallback((savedFilter: SavedFilter) => {
    onLoadFilters(savedFilter.filters)
    captureEvent(ANALYTICS_EVENTS.SAVED_FILTER_LOADED, {
      saved_filter_id: savedFilter.id,
      saved_filter_name: normalizeTrackedText(savedFilter.name),
      loaded_active_filters_count: calculateActiveFilters(savedFilter.filters),
      loaded_filters_snapshot: buildTrackedFiltersSnapshot(savedFilter.filters),
    })
  }, [onLoadFilters])

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
    if (!onExport) return
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
      setShareSuccess(`Shared with ${shareEmail.trim()}`)
      setShareEmail("")
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
      saved_filter_ids: toTrackedStringArray(savedFilters.map((f) => f.id)),
      saved_filter_names: toTrackedStringArray(savedFilters.map((f) => f.name)),
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
    if (canExport && exportAccessError) setExportAccessError(null)
  }, [canExport, exportAccessError])

  return (
    <div className="w-full overflow-hidden rounded-lg border border-sidebar-border/50 bg-sidebar-accent/5">

      {/* Header: mirrors user info avatar row */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BookmarkCheck className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">Saved Filters</span>
            {totalCount > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {totalCount} saved
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {totalCount === 0 ? "No filters saved yet" : `${myFilters.length} mine, ${sharedWithMeFilters.length} shared`}
          </p>
        </div>
      </div>

      <div className="mx-3 border-t border-border/50" />

      {/* Filter rows */}
      {totalCount === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-muted-foreground italic">
          Save your current filters to reuse them later.
        </div>
      ) : (
        <div className="py-1.5">

          {myFilters.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  My Filters
                </span>
              </div>
              {myFilters.slice(0, 5).map((filter) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  isOwner={true}
                  onLoad={handleLoadFilter}
                  onShare={handleOpenShareDialog}
                  onEdit={handleEdit}
                  onDelete={handleDeleteFilter}
                />
              ))}
            </>
          )}

          {sharedWithMeFilters.length > 0 && (
            <>
              {myFilters.length > 0 && <div className="mx-3 my-1.5 border-t border-border/50" />}
              <div className="px-3 pb-1 pt-1.5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="h-2.5 w-2.5" />
                  Shared with me
                </span>
              </div>
              {sharedWithMeFilters.slice(0, 5).map((filter) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  isOwner={false}
                  onLoad={handleLoadFilter}
                />
              ))}
            </>
          )}
        </div>
      )}

      <div className="mx-3 border-t border-border/50" />

      {/* Export access error */}
      {exportAccessError && (
        <>
          <div
            role="status"
            aria-live="polite"
            className="relative mx-3 mt-2.5 overflow-hidden rounded-md border border-amber-400/40 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04))] p-2 dark:border-amber-300/30 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.2),rgba(120,53,15,0.28))]"
          >
            <div className="absolute inset-y-0 left-0 w-0.5 rounded-l-md bg-amber-500/80" />
            <div className="flex items-start gap-2 pl-2">
              <div className="mt-0.5 rounded bg-amber-500/15 p-0.5 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">
                <ShieldAlert className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200">
                  Export restricted
                </p>
                <p className="text-[11px] leading-tight text-amber-900/90 dark:text-amber-100/95">{exportAccessError}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-amber-800 hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-400/20"
                onClick={handleDismissExportAccessError}
                aria-label="Dismiss export access warning"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="mx-3 mt-2.5 border-t border-border/50" />
        </>
      )}

      {/* Action grid: mirrors header dropdown buttons */}
      <div className="flex items-stretch gap-1 p-1.5">
        <button
          type="button"
          disabled={totalActiveFilters === 0 || loading}
          onClick={() => setSaveDialogOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          title="Save current filters"
          aria-label="Save current filters"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>

        {totalCount > 0 && (
          <button
            type="button"
            onClick={() => setManageDialogOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
            title="Manage all saved filters"
            aria-label="Manage saved filters"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Manage
          </button>
        )}

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
            title="Reset all filters"
            aria-label="Reset all filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}

        {onExport && (
          <button
            type="button"
            onClick={handleExportAction}
            className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-primary/25 bg-primary/5 px-2 py-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
            data-tour="export-button"
            aria-label={canExport ? "Export data" : "Export data (admin only)"}
            title={canExport ? "Export data" : "Only admins can export data"}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        )}
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
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
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveFilter() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFilter} disabled={!filterName.trim() || loading}>
              {loading ? "Saving..." : "Save List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Dialog */}
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
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Filters</p>
                    {myFilters.map((filter) => (
                      <SavedFilterCard
                        key={filter.id}
                        filter={filter}
                        isOwner={true}
                        onLoad={(f) => { handleLoadFilter(f); setManageDialogOpen(false) }}
                        onEdit={handleEdit}
                        onDelete={handleDeleteFilter}
                        onShare={handleOpenShareDialog}
                      />
                    ))}
                  </>
                )}
                {sharedWithMeFilters.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mt-6">
                      <Users className="h-3 w-3" />
                      Shared with me
                    </p>
                    {sharedWithMeFilters.map((filter) => (
                      <SavedFilterCard
                        key={filter.id}
                        filter={filter}
                        isOwner={false}
                        onLoad={(f) => { handleLoadFilter(f); setManageDialogOpen(false) }}
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

      {/* Delete Confirmation */}
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

      {/* Rename Dialog */}
      <Dialog
        open={!!editingFilter}
        onOpenChange={(open) => { if (!open) { setEditingFilter(null); setEditName("") } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Filter Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleUpdateFilter() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFilter(null)}>Cancel</Button>
            <Button onClick={handleUpdateFilter} disabled={!editName.trim() || loading}>
              {loading ? "Updating..." : "Update Name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
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
              <Share2 className="h-5 w-5" />
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
                  onChange={(e) => { setShareEmail(e.target.value); setShareError(null); setShareSuccess(null) }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleShareFilter() } }}
                />
                <Button onClick={handleShareFilter} disabled={!shareEmail.trim() || loading} size="sm" className="shrink-0">
                  {loading ? "Sharing..." : "Share"}
                </Button>
              </div>
              {shareError && <p className="text-sm text-destructive">{shareError}</p>}
              {shareSuccess && <p className="text-sm text-green-600 dark:text-green-400">{shareSuccess}</p>}
            </div>
            {currentShares.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Currently shared with</Label>
                <div className="space-y-1.5">
                  {currentShares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
                      <span className="truncate">{share.shared_with_email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleUnshareFilter(share)}
                        aria-label={`Revoke access for ${share.shared_with_email}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

// Filter row: a single saved filter entry
const FilterRow = memo(({
  filter,
  isOwner,
  onLoad,
  onShare,
  onEdit,
  onDelete,
}: {
  filter: SavedFilter
  isOwner: boolean
  onLoad: (f: SavedFilter) => void
  onShare?: (f: SavedFilter) => void
  onEdit?: (f: SavedFilter) => void
  onDelete?: (f: SavedFilter) => void
}) => {
  const count = calculateActiveFilters(filter.filters)
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onLoad(filter)}
        title={`Load: ${filter.name}`}
      >
        <span className="block truncate text-xs font-medium text-foreground group-hover:text-foreground/90">
          {filter.name}
        </span>
      </button>
      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {isOwner && onShare && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onShare(filter) }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={`Share ${filter.name}`}
            title="Share"
          >
            <Share2 className="h-3 w-3" />
          </button>
        )}
        {isOwner && onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(filter) }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={`Rename ${filter.name}`}
            title="Rename"
          >
            <Edit2 className="h-3 w-3" />
          </button>
        )}
        {isOwner && onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(filter) }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label={`Delete ${filter.name}`}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLoad(filter) }}
          className="flex h-5 items-center gap-0.5 rounded px-1.5 border border-border/60 bg-muted/20 text-[10px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          aria-label={`Load ${filter.name}`}
          title="Load"
        >
          <FolderOpen className="h-2.5 w-2.5" />
          Load
        </button>
      </div>
    </div>
  )
})
FilterRow.displayName = "FilterRow"
