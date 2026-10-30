"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiErrorWarningLine, RiFileList3Line, RiFileUploadLine, RiGroupLine, RiPencilLine, RiSearchLine, RiShareLine, RiSubtractLine, RiUploadLine } from "@remixicon/react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { AccountListUploadPanel } from "@/components/filters/account-list-upload-panel"
import {
  LibraryCountBadge,
  LibraryDialog,
  LibraryEmpty,
  LibraryItem,
  LibraryPaneHeader,
  LibraryPaneTitle,
  LibraryRename,
  type LibraryTab,
} from "@/components/filters/library-dialog"
import { useAccountLists, type AccountListShare } from "@/contexts/account-lists-context"
import { MAX_ACCOUNT_LIST_NAME_LENGTH, type AccountList } from "@/lib/accounts/account-lists"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

interface AccountListsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Applies the list to the dashboard (adds it to the current filters), keeping or removing its accounts. */
  onApply: (list: AccountList, mode: "include" | "exclude") => void
}

function formatDate(value: string): string {
  if (!value) return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`

/** Account lists: browse, search, upload, apply, share, rename, replace from a file, delete. */
export function AccountListsDialog({ open, onOpenChange, onApply }: AccountListsDialogProps) {
  const { lists, loading, userId, updateList, deleteList, shareList, unshareList, getListShares } = useAccountLists()
  const [tab, setTab] = useState<LibraryTab>("mine")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [accountQuery, setAccountQuery] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // Upload runs in the right pane: target is the list being replaced, or null for a new one.
  const [uploading, setUploading] = useState<{ target: AccountList | null } | null>(null)
  const [listToDelete, setListToDelete] = useState<AccountList | null>(null)

  const myLists = useMemo(() => lists.filter((l) => l.user_id === userId), [lists, userId])
  const sharedLists = useMemo(() => lists.filter((l) => l.user_id !== userId), [lists, userId])
  const tabLists = tab === "mine" ? myLists : sharedLists
  const visibleLists = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? tabLists.filter((l) => l.name.toLowerCase().includes(q)) : tabLists
  }, [tabLists, query])
  const selected = visibleLists.find((l) => l.id === selectedId) ?? visibleLists[0] ?? null

  // Each opening starts on your lists with nothing half-done.
  useEffect(() => {
    if (!open) return
    setTab("mine")
    setQuery("")
    setSelectedId(null)
    setRenamingId(null)
    setUploading(null)
  }, [open])

  useEffect(() => {
    setAccountQuery("")
    setRenamingId(null)
  }, [selected?.id])

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
      captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_SHARED, {
        account_list_id: listToShare.id,
        accounts_count: listToShare.accounts.length,
      })
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
      if (ok) {
        captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_UNSHARED, { account_list_id: share.list_id })
        setCurrentShares((prev) => prev.filter((s) => s.id !== share.id))
      }
    },
    [unshareList]
  )

  const openUpload = useCallback((target: AccountList | null) => {
    setRenamingId(null)
    setUploading({ target })
  }, [])

  const commitRename = useCallback(
    async (list: AccountList, name: string) => {
      const updated = await updateList(list.id, { name })
      if (updated) captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_RENAMED, { account_list_id: list.id })
      else toast.error("Could not rename the list.")
      setRenamingId(null)
    },
    [updateList]
  )

  const confirmDelete = useCallback(async () => {
    if (!listToDelete) return
    const ok = await deleteList(listToDelete.id)
    if (ok) {
      captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_DELETED, {
        account_list_id: listToDelete.id,
        accounts_count: listToDelete.accounts.length,
      })
      toast.success(`Deleted "${listToDelete.name}".`)
    } else toast.error("Could not delete the list.")
    setListToDelete(null)
  }, [listToDelete, deleteList])

  const handleApply = useCallback(
    (list: AccountList, mode: "include" | "exclude" = "include") => {
      captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_APPLIED, {
        account_list_id: list.id,
        is_owner: list.user_id === userId,
        accounts_count: list.accounts.length,
        mode,
      })
      onApply(list, mode)
      onOpenChange(false)
    },
    [onApply, onOpenChange, userId]
  )

  const renderItems = () => {
    if (visibleLists.length > 0) {
      return visibleLists.map((list) => (
        <LibraryItem
          key={list.id}
          selected={!uploading && selected?.id === list.id}
          onSelect={() => {
            setUploading(null)
            setSelectedId(list.id)
          }}
          icon={tab === "mine" ? <RiFileList3Line className="h-4 w-4" /> : <RiGroupLine className="h-4 w-4" />}
          name={list.name}
          meta={[plural(list.accounts.length, "account"), tab === "mine" ? (list.updated_at && `updated ${formatDate(list.updated_at)}`) : list.owner_email && `from ${list.owner_email}`].filter(Boolean).join(" · ")}
          badge={list.unmatched.length > 0 ? <LibraryCountBadge count={list.unmatched.length} title={`${plural(list.unmatched.length, "name")} not matched`} /> : undefined}
        />
      ))
    }
    if (query.trim()) return <LibraryEmpty>No lists match &ldquo;{query.trim()}&rdquo;.</LibraryEmpty>
    return <LibraryEmpty>{tab === "mine" ? "You haven't uploaded a list yet." : "No one has shared a list with you yet."}</LibraryEmpty>
  }

  const renderDetail = () => {
    if (uploading) {
      return (
        <AccountListUploadPanel
          key={uploading.target?.id ?? "new"}
          existingList={uploading.target}
          onApply={(list) => handleApply(list, "include")}
          onDone={(saved) => {
            setUploading(null)
            if (saved) {
              setTab("mine")
              setQuery("")
              setSelectedId(saved.id)
            }
          }}
        />
      )
    }
    if (!selected) {
      return (
        <div className="grid flex-1 place-items-center p-8">
          <div className="max-w-sm text-center">
            <RiFileList3Line className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-3 text-sm font-medium">Filter by your own account lists</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Upload a CSV, TSV, TXT or XLSX file with company names. Each name is matched to an account and saved as a list you can apply any time.
            </p>
            <Button className="mt-4" onClick={() => openUpload(null)}>
              <RiUploadLine />
              Upload list
            </Button>
          </div>
        </div>
      )
    }

    const own = selected.user_id === userId
    const q = accountQuery.trim().toLowerCase()
    const accounts = q ? selected.accounts.filter((name) => name.toLowerCase().includes(q)) : selected.accounts
    return (
      <>
        <LibraryPaneHeader
          title={
            renamingId === selected.id ? (
              <LibraryRename
                initial={selected.name}
                maxLength={MAX_ACCOUNT_LIST_NAME_LENGTH}
                saving={loading}
                onSave={(name) => void commitRename(selected, name)}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <LibraryPaneTitle>{selected.name}</LibraryPaneTitle>
            )
          }
          meta={[
            plural(selected.accounts.length, "account"),
            selected.updated_at && `updated ${formatDate(selected.updated_at)}`,
            selected.source_file && `from ${selected.source_file}`,
            !own && selected.owner_email && `shared by ${selected.owner_email}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <>
              <Button variant="outline" size="sm" className="text-include" onClick={() => handleApply(selected, "include")} title="Show only these accounts on the dashboard">
                <RiAddLine />
                Include in filters
              </Button>
              <Button variant="outline" size="sm" className="text-exclude" onClick={() => handleApply(selected, "exclude")} title="Hide these accounts from the dashboard">
                <RiSubtractLine />
                Exclude
              </Button>
              {own && (
                <span className="ml-auto flex items-center gap-0.5">
                  <Button size="icon-sm" variant="ghost" onClick={() => openShare(selected)} aria-label={`Share ${selected.name}`} title="Share">
                    <RiShareLine />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRenamingId(selected.id)} aria-label={`Rename ${selected.name}`} title="Rename">
                    <RiPencilLine />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => openUpload(selected)} aria-label={`Replace ${selected.name} from a file`} title="Replace from a file">
                    <RiFileUploadLine />
                  </Button>
                  <Button size="icon-sm" variant="ghost-destructive" onClick={() => setListToDelete(selected)} aria-label={`Delete ${selected.name}`} title="Delete">
                    <RiDeleteBinLine />
                  </Button>
                </span>
              )}
            </>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selected.unmatched.length > 0 && (
            <div className="mb-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 text-[12.5px]">
              <RiErrorWarningLine className="mt-px h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <p className="min-w-0">
                <span className="font-semibold text-amber-700 dark:text-amber-300">{plural(selected.unmatched.length, "name")} not matched: </span>
                <span className="break-words">{selected.unmatched.join(", ")}</span>
              </p>
            </div>
          )}
          {selected.accounts.length > 8 && (
            <label className="mb-3 flex h-[34px] items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
              <RiSearchLine className="h-4 w-4 shrink-0" />
              <input
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder={`Search ${plural(selected.accounts.length, "account")}`}
                aria-label="Search accounts in this list"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
          )}
          {accounts.length > 0 ? (
            <ul className="gap-x-6 text-[13px] sm:columns-2">
              {accounts.map((name) => (
                <li key={name} className="break-inside-avoid truncate border-b border-border/50 py-1.5" title={name}>
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No accounts match &ldquo;{accountQuery.trim()}&rdquo;.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <LibraryDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Account lists"
        description="Upload, apply and manage account lists."
        searchPlaceholder="Search lists"
        query={query}
        onQueryChange={setQuery}
        tab={tab}
        onTabChange={(next) => {
          setTab(next)
          setSelectedId(null)
          setUploading(null)
        }}
        mineCount={myLists.length}
        sharedCount={sharedLists.length}
        items={renderItems()}
        footer={
          <Button className="w-full" onClick={() => openUpload(null)}>
            <RiUploadLine />
            Upload list
          </Button>
        }
      >
        {renderDetail()}
      </LibraryDialog>

      <Dialog open={Boolean(listToShare)} onOpenChange={(o) => !o && setListToShare(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RiShareLine className="h-5 w-5" />
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
                <Button onClick={handleShare} disabled={!shareEmail.trim() || sharing} size="lg" className="shrink-0">
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
                        variant="ghost-destructive"
                        size="icon-xs"
                        className="shrink-0"
                        onClick={() => handleUnshare(share)}
                        aria-label={`Stop sharing with ${share.shared_with_email}`}
                      >
                        <RiCloseLine className="h-3.5 w-3.5" />
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
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
