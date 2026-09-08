"use client"

import { useCallback, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronUp, ListChecks, Pencil, Play, RefreshCw, Share2, Trash2, Upload, Users, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
import { useAccountLists, type AccountListShare } from "@/contexts/account-lists-context"
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
  const { lists, loading, userId, updateList, deleteList, shareList, unshareList, getListShares } = useAccountLists()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<AccountList | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [listToDelete, setListToDelete] = useState<AccountList | null>(null)

  const myLists = useMemo(() => lists.filter((l) => l.user_id === userId), [lists, userId])
  const sharedLists = useMemo(() => lists.filter((l) => l.user_id !== userId), [lists, userId])

  // Share dialog state
  const [listToShare, setListToShare] = useState<AccountList | null>(null)
  const [shareEmail, setShareEmail] = useState("")
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)
  const [currentShares, setCurrentShares] = useState<AccountListShare[]>([])
  const [sharing, setSharing] = useState(false)

  const openShare = useCallback(
    async (list: AccountList) => {
      setListToShare(list)
      setShareEmail("")
      setShareError(null)
      setShareSuccess(null)
      setCurrentShares([])
      setCurrentShares(await getListShares(list.id))
    },
    [getListShares]
  )

  const handleShare = useCallback(async () => {
    if (!listToShare || !shareEmail.trim()) return
    setSharing(true)
    setShareError(null)
    setShareSuccess(null)
    const result = await shareList(listToShare.id, shareEmail)
    if (result.success) {
      setShareSuccess(`Shared with ${shareEmail.trim()}.`)
      setShareEmail("")
      setCurrentShares(await getListShares(listToShare.id))
    } else {
      setShareError(result.error ?? "Failed to share list")
    }
    setSharing(false)
  }, [listToShare, shareEmail, shareList, getListShares])

  const handleUnshare = useCallback(
    async (share: AccountListShare) => {
      const ok = await unshareList(share.list_id, share.shared_with_user_id)
      if (ok) setCurrentShares((prev) => prev.filter((s) => s.id !== share.id))
    },
    [unshareList]
  )

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

  const renderList = (list: AccountList, own: boolean) => {
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
                          {!own && list.owner_email ? ` , shared by ${list.owner_email}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleApply(list)} title="Apply this list to the dashboard">
                          <Play className="h-3.5 w-3.5" />
                          Apply
                        </Button>
                        {own && (
                          <>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openShare(list)} aria-label={`Share ${list.name}`} title="Share">
                              <Share2 className="h-3.5 w-3.5" />
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
                          </>
                        )}
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
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Account Lists
            </DialogTitle>
            <DialogDescription className="sr-only">Manage uploaded account lists.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {myLists.length === 0 ? "No lists yet." : `${myLists.length} list${myLists.length === 1 ? "" : "s"}`}
            </p>
            <Button size="sm" onClick={() => openUpload(null)}>
              <Upload className="h-4 w-4" />
              Upload list
            </Button>
          </div>

          {myLists.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Upload a CSV, TSV, TXT or XLSX file with company names. We map each name to an account and save the result as a list you can apply any time.
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">{myLists.map((list) => renderList(list, true))}</ul>
          )}

          {sharedLists.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3 w-3" />
                Shared with me
              </p>
              <ul className="divide-y rounded-lg border">{sharedLists.map((list) => renderList(list, false))}</ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AccountListUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} existingList={uploadTarget} onApply={handleApply} />

      <Dialog open={Boolean(listToShare)} onOpenChange={(o) => !o && setListToShare(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share List
            </DialogTitle>
            <DialogDescription>
              {listToShare ? `Share "${listToShare.name}" with a teammate by entering their email address.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="share-list-email">Email address</Label>
              <div className="flex gap-2">
                <Input
                  id="share-list-email"
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
                      void handleShare()
                    }
                  }}
                />
                <Button onClick={handleShare} disabled={!shareEmail.trim() || sharing} size="sm" className="shrink-0">
                  {sharing ? "Sharing..." : "Share"}
                </Button>
              </div>
              {shareError && <p className="text-sm text-destructive">{shareError}</p>}
              {shareSuccess && <p className="text-sm text-green-600 dark:text-green-400">{shareSuccess}</p>}
            </div>
            {currentShares.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Currently shared with</Label>
                <div className="space-y-1.5">
                  {currentShares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <span className="truncate">{share.shared_with_email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleUnshare(share)}
                        aria-label={`Stop sharing with ${share.shared_with_email}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not shared with anyone yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
