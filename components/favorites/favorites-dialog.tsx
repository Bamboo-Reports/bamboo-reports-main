"use client"

import { useState } from "react"
import { Briefcase, Building2, Star, Trash2, Users, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { cn } from "@/lib/utils"
import { getPaginatedData } from "@/lib/utils/helpers"
import type { FavoriteEntityType, FavoriteItem } from "@/hooks/use-favorites"

const ITEMS_PER_PAGE = 10

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ""
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
}

const TYPE_META: Record<
  FavoriteEntityType,
  { icon: typeof Building2; iconClass: string; borderClass: string; badgeClass: string; label: string }
> = {
  account: {
    icon: Building2,
    iconClass: "text-primary",
    borderClass: "border-primary/20",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    label: "Account",
  },
  center: {
    icon: Briefcase,
    iconClass: "text-[hsl(var(--chart-2))]",
    borderClass: "border-[hsl(var(--chart-2))]/25",
    badgeClass: "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.25)]",
    label: "Center",
  },
  prospect: {
    icon: Users,
    iconClass: "text-[hsl(var(--chart-3))]",
    borderClass: "border-[hsl(var(--chart-3))]/25",
    badgeClass: "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.25)]",
    label: "Prospect",
  },
}

interface FavoritesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  favorites: FavoriteItem[]
  onOpenFavorite: (item: FavoriteItem) => void
  onRemove: (item: FavoriteItem) => void
  onClearAll: () => void
}

export function FavoritesDialog({ open, onOpenChange, favorites, onOpenFavorite, onRemove, onClearAll }: FavoritesDialogProps) {
  const [page, setPage] = useState(1)
  const paginated = getPaginatedData(favorites, page, ITEMS_PER_PAGE) as FavoriteItem[]

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setPage(1) }}>
      <DialogContent className="h-screen w-screen max-w-none overflow-hidden rounded-none p-0 sm:max-w-none glassmorphism-dialog flex flex-col">
        <DialogHeader className="border-b border-border/60 px-6 py-5 shrink-0">
          <div className="flex items-start justify-between pr-10">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Star className="h-4 w-4" />
                </div>
                Favorites
              </DialogTitle>
              <DialogDescription className="mt-1">
                Records you have starred. Click any item to reopen it, or remove it from the list.
              </DialogDescription>
            </div>
            {favorites.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={onClearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear favorites
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-6">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 py-24 text-center backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
              <Star className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">No favorites yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Right-click any account, center, or prospect and choose &quot;Add to Favorites&quot;.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
              <div className="divide-y divide-border/40">
                {paginated.map((item) => {
                  const meta = TYPE_META[item.entity_type]
                  const Icon = meta.icon
                  return (
                    <div
                      key={item.id}
                      className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false)
                          onOpenFavorite(item)
                        }}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background/60", meta.borderClass)}>
                          <Icon className={cn("h-4 w-4", meta.iconClass)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                          {item.subtitle && (
                            <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{item.subtitle}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-[10px] font-medium", meta.badgeClass)}
                        >
                          {meta.label}
                        </Badge>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground w-16 text-right">
                          {timeAgo(item.created_at)}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${item.title} from favorites`}
                        onClick={() => onRemove(item)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
              <PaginationControls
                currentPage={page}
                totalItems={favorites.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setPage}
                dataLength={paginated.length}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
