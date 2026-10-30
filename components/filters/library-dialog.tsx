"use client"

import React from "react"
import { RiCheckLine, RiCloseLine, RiSearchLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type LibraryTab = "mine" | "shared"

interface LibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  searchPlaceholder: string
  query: string
  onQueryChange: (query: string) => void
  tab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
  mineCount: number
  sharedCount: number
  /** The items in the left column (LibraryItem elements, or an empty message). */
  items: React.ReactNode
  /** Pinned under the items, such as "Upload list". */
  footer?: React.ReactNode
  /** The selected item, or another view such as an upload step. */
  children: React.ReactNode
}

/**
 * A library of named things (account lists, saved filters): search and pick on
 * the left, everything about the selected one on the right.
 */
export function LibraryDialog({
  open,
  onOpenChange,
  title,
  description,
  searchPlaceholder,
  query,
  onQueryChange,
  tab,
  onTabChange,
  mineCount,
  sharedCount,
  items,
  footer,
  children,
}: LibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(620px,88vh)] w-[calc(100%-2rem)] max-w-[920px] flex-col gap-0 overflow-hidden p-0"
        // Escape in a rename box cancels the rename; Radix would otherwise close the window first.
        onEscapeKeyDown={(event) => {
          if ((document.activeElement as HTMLElement | null)?.closest("[data-library-rename]")) event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 space-y-0 px-5 py-3.5 pr-12">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] border-t sm:grid-cols-[288px_minmax(0,1fr)] sm:grid-rows-1">
          <aside className="flex min-h-0 flex-col border-b bg-muted/30 sm:border-b-0 sm:border-r">
            <div className="flex shrink-0 flex-col gap-2 p-3 pb-2">
              <label className="flex h-[34px] items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
                <RiSearchLine className="h-4 w-4 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 rounded-lg bg-muted/80 p-[3px]" role="tablist" aria-label={`${title} owner`}>
                {([
                  ["mine", "Mine", mineCount],
                  ["shared", "Shared with me", sharedCount],
                ] as const).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => onTabChange(value)}
                    className={cn(
                      "h-7 rounded-md text-[12.5px] font-medium transition-colors",
                      tab === value
                        ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--border)/0.6)]"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                    <span className="ml-1 text-[11.5px] tabular-nums text-muted-foreground">{count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{items}</div>
            {footer && <div className="shrink-0 border-t p-3">{footer}</div>}
          </aside>
          <section className="flex min-h-0 flex-col">{children}</section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface LibraryItemProps {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  name: string
  meta: string
  badge?: React.ReactNode
}

export function LibraryItem({ selected, onSelect, icon, name, meta, badge }: LibraryItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_hsl(var(--border))]" : "hover:bg-muted/80"
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" title={name}>{name}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{meta}</span>
      </span>
      {badge}
    </button>
  )
}

export function LibraryEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
}

interface LibraryPaneHeaderProps {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
}

export function LibraryPaneHeader({ title, meta, actions }: LibraryPaneHeaderProps) {
  return (
    <div className="shrink-0 border-b px-5 pb-3.5 pt-4">
      {title}
      {meta && <div className="mt-1 text-[12.5px] text-muted-foreground">{meta}</div>}
      {actions && <div className="mt-3 flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export function LibraryPaneTitle({ children, badge }: { children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h3 className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.01em]">{children}</h3>
      {badge}
    </div>
  )
}

/** Edits a name in place: Enter or the tick saves, Escape or the cross cancels. */
export function LibraryRename({
  initial,
  maxLength,
  saving,
  onSave,
  onCancel,
}: {
  initial: string
  maxLength?: number
  saving?: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = React.useState(initial)
  const save = () => {
    const name = value.trim()
    if (name && name !== initial) onSave(name)
    else onCancel()
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save()
          if (event.key === "Escape") onCancel()
        }}
        maxLength={maxLength}
        autoFocus
        onFocus={(event) => event.target.select()}
        aria-label="Name"
        data-library-rename=""
        className="h-8 min-w-0 flex-1 rounded-md border border-primary/60 bg-background px-2.5 text-[15px] font-semibold outline-none ring-[3px] ring-primary/15"
      />
      <Button size="icon-sm" variant="ghost" onClick={save} disabled={!value.trim() || saving} aria-label="Save name">
        <RiCheckLine />
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancel rename">
        <RiCloseLine />
      </Button>
    </div>
  )
}

export function LibraryCountBadge({ count, title }: { count: number; title: string }) {
  return (
    <span
      className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300"
      title={title}
    >
      {count}
    </span>
  )
}
