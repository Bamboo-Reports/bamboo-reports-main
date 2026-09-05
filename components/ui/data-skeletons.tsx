import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"

/**
 * Loading placeholders for the entity tables and grids. Each one mirrors the
 * real row or card it stands in for (same logo size, line count, button
 * height) so nothing jumps when data lands.
 */

/** What the first data column of a table holds, after the checkbox column. */
export type TableLeadColumn = "logo" | "avatar"

interface TableSkeletonRowsProps {
  rows?: number
  columns: number
  /**
   * "logo": the name column carries a square company logo plus two text lines
   * (accounts, centres). "avatar": a separate round avatar column precedes a
   * two-line name column (prospects).
   */
  lead?: TableLeadColumn
}

export function TableSkeletonRows({ rows = 8, columns, lead = "logo" }: TableSkeletonRowsProps) {
  const nameColumn = lead === "avatar" ? 2 : 1
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={`skeleton-${i}`}>
          {Array.from({ length: columns }, (_, j) => (
            <TableCell key={j}>
              {j === 0 ? (
                <Skeleton className="h-4 w-4 rounded-sm" />
              ) : j === nameColumn ? (
                <div className="flex items-center gap-3">
                  {lead === "logo" ? <Skeleton className="h-8 w-8 shrink-0 rounded-xl" /> : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ) : lead === "avatar" && j === 1 ? (
                <Skeleton className="h-8 w-8 rounded-full" />
              ) : (
                <Skeleton className="h-4 w-3/4" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

interface GridSkeletonCardsProps {
  cards?: number
  /** Number of label/value stat rows under the title. Accounts show 2, centres and prospects 3. */
  statRows?: number
  /** Round avatar (prospects) instead of the square company logo. */
  avatar?: boolean
}

export function GridSkeletonCards({ cards = 6, statRows = 2, avatar = false }: GridSkeletonCardsProps) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <Card key={`skeleton-card-${i}`} className="h-full">
          <CardContent className="flex h-full flex-col gap-4 p-4">
            <div className="flex items-start gap-3">
              {avatar ? (
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              ) : (
                <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              )}
              <div className="min-w-0 flex-1 pt-0.5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-1.5 h-4 w-1/2" />
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-4">
              <div className="space-y-2">
                {Array.from({ length: statRows }, (_, r) => (
                  <div key={r} className="flex h-5 items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

/** A small floating pill shown over maps while fresh aggregates load. */
export function MapUpdatingPill() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur animate-pulse">
      Updating map
    </div>
  )
}
