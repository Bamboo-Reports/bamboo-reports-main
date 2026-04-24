"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { TableCell, TableRow } from "@/components/ui/table"
import { Lock, ShieldAlert, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LockedProspectTeaser } from "@/lib/types"

interface LockedProspectTeaserSectionProps {
  teasers: LockedProspectTeaser[]
  title: string
  description: string
  accountContext?: string
  className?: string
}

interface LockedProspectTeaserCardProps {
  teaser: LockedProspectTeaser
  remainingCount: number
  accountContext?: string
  className?: string
}

interface LockedProspectTeaserRowProps {
  teaser: LockedProspectTeaser
  remainingCount: number
  accountContext?: string
}

export function LockedProspectTeaserCard({
  teaser,
  remainingCount,
  accountContext,
  className,
}: LockedProspectTeaserCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const location = [teaser.prospect_city, teaser.prospect_state].filter(Boolean).join(", ") || teaser.prospect_country || ""

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        className={cn(
          "cursor-pointer border-dashed border-border bg-background transition-colors hover:border-muted-foreground/40 hover:bg-muted/20",
          className
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">Locked Contact</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {accountContext ?? teaser.account_global_legal_name}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Location</span>
              <span className="truncate text-right font-medium text-foreground">
                {location || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Department</span>
              <span className="truncate text-right font-medium text-foreground">
                {teaser.prospect_department || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Level</span>
              <span className="truncate text-right font-medium text-foreground">
                {teaser.prospect_level || "-"}
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full justify-between"
          >
            Unlock Contact
            <Lock className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              Not Procured
            </DialogTitle>
            <DialogDescription>
              This contact is part of an expanded prospect package and is currently locked for this deployment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{teaser.account_global_legal_name}</p>
              <p className="text-sm text-muted-foreground">
                {remainingCount > 1
                  ? `${remainingCount} additional contacts are available for this account.`
                  : "1 additional contact is available for this account."}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium text-foreground">{location || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium text-foreground">{teaser.prospect_department || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Level</span>
                <span className="font-medium text-foreground">{teaser.prospect_level || "-"}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LockedProspectTeaserRow({
  teaser,
  remainingCount,
  accountContext,
}: LockedProspectTeaserRowProps) {
  const [isOpen, setIsOpen] = useState(false)
  const location = [teaser.prospect_city, teaser.prospect_state].filter(Boolean).join(", ") || teaser.prospect_country || ""

  return (
    <>
      <TableRow
        className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/70"
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        tabIndex={0}
        aria-label={`View locked contact details for ${accountContext ?? teaser.account_global_legal_name}`}
      >
        <TableCell>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
        </TableCell>
        <TableCell className="font-medium max-w-[220px]">
          <div className="min-w-0">
            <div className="truncate">Locked Contact</div>
            <div
              className="truncate text-xs font-normal text-muted-foreground"
              title={accountContext ?? teaser.account_global_legal_name}
            >
              {accountContext ?? teaser.account_global_legal_name}
            </div>
          </div>
        </TableCell>
        <TableCell className="max-w-[200px]">
          <div className="truncate" title={location || "-"}>
            {location || "-"}
          </div>
        </TableCell>
        <TableCell className="max-w-[180px]">
          <div className="truncate" title="-">
            -
          </div>
        </TableCell>
        <TableCell className="max-w-[180px]">
          <div className="truncate" title={teaser.prospect_department || "-"}>
            {teaser.prospect_department || "-"}
          </div>
        </TableCell>
      </TableRow>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              Not Procured
            </DialogTitle>
            <DialogDescription>
              This contact is part of an expanded prospect package and is currently locked for this deployment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{teaser.account_global_legal_name}</p>
              <p className="text-sm text-muted-foreground">
                {remainingCount > 1
                  ? `${remainingCount} additional contacts are available for this account.`
                  : "1 additional contact is available for this account."}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium text-foreground">{location || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium text-foreground">{teaser.prospect_department || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Level</span>
                <span className="font-medium text-foreground">{teaser.prospect_level || "-"}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LockedProspectTeaserSection({
  teasers,
  title,
  description,
  accountContext,
  className,
}: LockedProspectTeaserSectionProps) {
  const teasersByAccount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const teaser of teasers) {
      counts.set(teaser.account_global_legal_name, (counts.get(teaser.account_global_legal_name) ?? 0) + 1)
    }
    return counts
  }, [teasers])

  if (teasers.length === 0) {
    return null
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-background p-4",
        className
      )}
    >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge
            variant="secondary"
            className="bg-muted text-muted-foreground"
          >
            {teasers.length} locked
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teasers.map((teaser) => (
            <LockedProspectTeaserCard
              key={teaser.id}
              teaser={teaser}
              remainingCount={teasersByAccount.get(teaser.account_global_legal_name) ?? 0}
              accountContext={accountContext}
            />
          ))}
        </div>
      </section>
  )
}
