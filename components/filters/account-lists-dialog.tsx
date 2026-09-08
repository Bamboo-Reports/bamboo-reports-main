"use client"

import { useCallback, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronUp, ListChecks, Pencil, Play, RefreshCw, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { AccountListUploadDialog } from "@/components/filters/account-list-upload-dialog"
import { useAccountLists } from "@/contexts/account-lists-context"
import type { AccountList } from "@/lib/accounts/account-lists"

interface AccountListsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Applies the list to the dashboard (adds it to the current filters). */
  onApply: (list: AccountList) => void
}

function formatDate(value: string): string {
  if (!value) return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

/** Manage uploaded account lists: upload, rename, update from a new file, apply, delete. */
export function AccountListsDialog({ open, onOpenChange, onApply }: AccountListsDialogProps) {
  const { lists, loading, updateList, deleteList } = useAccountLists()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<AccountList | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [listToDelete, setListToDelete] = useState<AccountList | null>(null)

  const sorted = useMemo(() => lists, [lists])

  const openUpload = useCallback((target: AccountList | null) => {
    setUploadTarget(target)
    setUploadOpen(true)
  }, [])

  const startRename = useCallback((list: AccountList) => {
    setRenamingId(list.id)
    setRenameValue(list.name)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingId) return
    const name = renameValue.trim()
    if (!name) return
    const updated = await updateList(renamingId, { name })
    if (!updated) toast.error("Could not rename the list.")
    setRenamingId(null)
  }, [renamingId, renameValue, updateList])

  const confirmDelete = useCallback(async () => {
    if (!listToDelete) return
    const ok = await deleteList(listToDelete.id)
    if (ok) toast.success(`Deleted "${listToDelete.name}".`)
    else toast.error("Could not delete the list.")
    setListToDelete(null)
  }, [listToDelete, deleteList])

  const handleApply = useCallback(
    (list: AccountList) => {
      onApply(list)
      onOpenChange(false)
    },
    [onApply, onOpenChange]
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Account Lists
            </DialogTitle>
            <DialogDescription>
              Upload a client account list once, then apply it from the Account List filter in the sidebar or inside any saved filter.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {lists.length === 0 ? "No lists yet." : `${lists.length} list${lists.length === 1 ? "" : "s"}`}
            </p>
            <Button size="sm" onClick={() => openUpload(null)}>
              <Upload className="h-4 w-4" />
              Upload list
            </Button>
          </div>

          {lists.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Upload a CSV, TSV, TXT or XLSX file with company names. We map each name to an account and save the result as a list you can apply any time.
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {sorted.map((list) => {
                const expanded = expandedId === list.id
                const renaming = renamingId === list.id
                return (
                  <li key={list.id} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        {renaming ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitRename()
                                if (e.key === "Escape") setRenamingId(null)
                              }}
                              className="h-8"
                              autoFocus
                              aria-label="List name"
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commitRename} aria-label="Save name" disabled={!renameValue.trim() || loading}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenamingId(null)} aria-label="Cancel rename">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <p className="truncate text-sm font-medium" title={list.name}>
                            {list.name}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {list.accounts.length} account{list.accounts.length === 1 ? "" : "s"}
                          {list.unmatched.length > 0 ? `, ${list.unmatched.length} unmatched` : ""}
                          {list.updated_at ? ` , updated ${formatDate(list.updated_at)}` : ""}
                          {list.source_file ? ` , from ${list.source_file}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleApply(list)} title="Apply this list to the dashboard">
                          <Play className="h-3.5 w-3.5" />
                          Apply
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startRename(list)} aria-label={`Rename ${list.name}`} title="Rename">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openUpload(list)} aria-label={`Update ${list.name} from a file`} title="Update from a new file">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setListToDelete(list)} aria-label={`Delete ${list.name}`} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setExpandedId(expanded ? null : list.id)} aria-label={expanded ? "Hide accounts" : "Show accounts"} aria-expanded={expanded}>
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-2 space-y-2">
                        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                          {list.accounts.map((name) => (
                            <span key={name} className="rounded-full border bg-background px-2 py-0.5 text-xs" title={name}>
                              {name}
                            </span>
                          ))}
                        </div>
                        {list.unmatched.length > 0 && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Unmatched names ({list.unmatched.length})</summary>
                            <p className="mt-1 break-words">{list.unmatched.join(", ")}</p>
                          </details>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AccountListUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} existingList={uploadTarget} onApply={handleApply} />

      <AlertDialog open={Boolean(listToDelete)} onOpenChange={(o) => !o && setListToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account list?</AlertDialogTitle>
            <AlertDialogDescription>
              {listToDelete ? `"${listToDelete.name}" will be removed. Saved filters that use it keep the account names they were saved with.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
