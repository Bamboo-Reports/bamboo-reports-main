"use client"

import { useEffect, useMemo, useState } from "react"
import { RiAddLine, RiBookmarkLine, RiBriefcaseLine, RiBuildingLine, RiCheckLine, RiDeleteBinLine, RiFilter3Line, RiGroupLine, RiPencilLine, RiShareLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { FilterValueTag } from "@/components/filters/filter-chip"
import type { DescribedSection } from "@/components/filters/filter-description"
import type { FilterSectionId } from "@/components/filters/filter-fields"
import {
  LibraryDialog,
  LibraryEmpty,
  LibraryItem,
  LibraryPaneHeader,
  LibraryPaneTitle,
  LibraryRename,
  type LibraryTab,
} from "@/components/filters/library-dialog"
import type { SavedFilter } from "@/hooks/use-saved-filters"
import type { Filters } from "@/lib/types"

const SECTION_META: Record<FilterSectionId, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  accounts: { label: "Accounts", icon: RiBuildingLine },
  centers: { label: "Centres", icon: RiBriefcaseLine },
  prospects: { label: "Prospects", icon: RiGroupLine },
}

interface SavedFiltersLibraryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  myFilters: SavedFilter[]
  sharedFilters: SavedFilter[]
  /** The saved filter currently applied, and whether the filters changed since. */
  appliedId: string | null
  appliedModified: boolean
  loading: boolean
  countFilters: (filters: Filters) => number
  describe: (filters: Filters) => DescribedSection[]
  formatUpdated: (iso: string) => string | null
  onApply: (filter: SavedFilter) => void
  onShare: (filter: SavedFilter) => void
  onRename: (filter: SavedFilter, name: string) => Promise<void>
  onDelete: (filter: SavedFilter) => void
  /** Saves the filters applied now; disabled when nothing is applied. */
  onSaveCurrent: () => void
  canSaveCurrent: boolean
}

/** Saved filters: search, see what each one selects, apply, share, rename, delete. */
export function SavedFiltersLibrary({
  open,
  onOpenChange,
  myFilters,
  sharedFilters,
  appliedId,
  appliedModified,
  loading,
  countFilters,
  describe,
  formatUpdated,
  onApply,
  onShare,
  onRename,
  onDelete,
  onSaveCurrent,
  canSaveCurrent,
}: SavedFiltersLibraryProps) {
  const [tab, setTab] = useState<LibraryTab>("mine")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  // Each opening starts on your filters, with the applied one selected.
  useEffect(() => {
    if (!open) return
    const appliedShared = appliedId != null && sharedFilters.some((f) => f.id === appliedId)
    setTab(appliedShared ? "shared" : "mine")
    setQuery("")
    setSelectedId(appliedId)
    setRenamingId(null)
    // Only on opening; later changes to the lists shouldn't reset what the user picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const tabFilters = tab === "mine" ? myFilters : sharedFilters
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? tabFilters.filter((f) => f.name.toLowerCase().includes(q)) : tabFilters
  }, [tabFilters, query])
  const selected = visible.find((f) => f.id === selectedId) ?? visible[0] ?? null

  const metaFor = (filter: SavedFilter, owned: boolean) => {
    const count = countFilters(filter.filters)
    return [
      `${count} ${count === 1 ? "filter" : "filters"}`,
      owned ? formatUpdated(filter.updated_at) : filter.owner_email ? `from ${filter.owner_email}` : "shared with you",
    ]
      .filter(Boolean)
      .join(" · ")
  }

  const renderDetail = () => {
    if (!selected) {
      return (
        <div className="grid flex-1 place-items-center p-8">
          <div className="max-w-sm text-center">
            <RiBookmarkLine className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-3 text-sm font-medium">
              {tab === "mine" ? "Save filters you use often" : "Nothing shared with you yet"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {tab === "mine"
                ? "Set up filters in the sidebar, then save them here to apply them again in one click."
                : "When a teammate shares saved filters with you, they appear here."}
            </p>
          </div>
        </div>
      )
    }

    const owned = myFilters.some((f) => f.id === selected.id)
    const applied = selected.id === appliedId
    const sections = describe(selected.filters)
    return (
      <>
        <LibraryPaneHeader
          title={
            renamingId === selected.id ? (
              <LibraryRename
                initial={selected.name}
                saving={loading}
                onSave={(name) => {
                  void onRename(selected, name).finally(() => setRenamingId(null))
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <LibraryPaneTitle
                badge={
                  applied ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/12 px-2 text-[11px] font-semibold text-primary">
                      {appliedModified ? "Applied · changed" : "Applied"}
                    </span>
                  ) : undefined
                }
              >
                {selected.name}
              </LibraryPaneTitle>
            )
          }
          meta={metaFor(selected, owned)}
          actions={
            <>
              <Button size="sm" onClick={() => onApply(selected)}>
                <RiFilter3Line />
                {applied && !appliedModified ? "Apply again" : "Apply filters"}
              </Button>
              {owned && (
                <span className="ml-auto flex items-center gap-0.5">
                  <Button size="icon-sm" variant="ghost" onClick={() => onShare(selected)} aria-label={`Share ${selected.name}`} title="Share">
                    <RiShareLine />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRenamingId(selected.id)} aria-label={`Rename ${selected.name}`} title="Rename">
                    <RiPencilLine />
                  </Button>
                  <Button size="icon-sm" variant="ghost-destructive" onClick={() => onDelete(selected)} aria-label={`Delete ${selected.name}`} title="Delete">
                    <RiDeleteBinLine />
                  </Button>
                </span>
              )}
            </>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {sections.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No filters set. Applying this shows everything.</p>
          ) : (
            sections.map(({ section, fields }, index) => {
              const { label, icon: Icon } = SECTION_META[section]
              return (
                <div key={section} className={index > 0 ? "mt-4 border-t border-border/70 pt-4" : undefined}>
                  <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold">
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </h4>
                  <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-2">
                    {fields.map((field) => (
                      <div key={field.label} className="contents">
                        <dt className="pt-1 text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="flex min-w-0 flex-wrap gap-1.5">
                          {field.values?.map((item) => <FilterValueTag key={`${item.mode}-${item.value}`} item={item} />)}
                          {field.text && (
                            <span className="inline-flex h-6 items-center rounded-md border bg-background px-2 text-xs font-medium tabular-nums">
                              {field.text}
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })
          )}
        </div>
      </>
    )
  }

  return (
    <LibraryDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Saved filters"
      description="Apply, share, rename or delete saved filters."
      searchPlaceholder="Search saved filters"
      query={query}
      onQueryChange={setQuery}
      tab={tab}
      onTabChange={(next) => {
        setTab(next)
        setSelectedId(null)
      }}
      mineCount={myFilters.length}
      sharedCount={sharedFilters.length}
      items={
        visible.length > 0 ? (
          visible.map((filter) => {
            const applied = filter.id === appliedId
            return (
              <LibraryItem
                key={filter.id}
                selected={selected?.id === filter.id}
                onSelect={() => setSelectedId(filter.id)}
                icon={applied ? <RiCheckLine className="h-4 w-4 text-primary" /> : tab === "mine" ? <RiBookmarkLine className="h-4 w-4" /> : <RiGroupLine className="h-4 w-4" />}
                name={filter.name}
                meta={metaFor(filter, tab === "mine")}
              />
            )
          })
        ) : query.trim() ? (
          <LibraryEmpty>No saved filters match &ldquo;{query.trim()}&rdquo;.</LibraryEmpty>
        ) : (
          <LibraryEmpty>{tab === "mine" ? "You haven't saved any filters yet." : "No one has shared filters with you yet."}</LibraryEmpty>
        )
      }
      footer={
        <Button variant="outline" className="w-full" onClick={onSaveCurrent} disabled={!canSaveCurrent}>
          <RiAddLine />
          Save current filters
        </Button>
      }
    >
      {renderDetail()}
    </LibraryDialog>
  )
}
