"use client"

import { Button } from "@/components/ui/button"
import { RiDownloadLine } from "@remixicon/react"
import { getPageInfo, getTotalPages } from "@/lib/utils/helpers"

interface PaginationControlsProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number | ((prev: number) => number)) => void
  dataLength: number
  onExport?: () => void
  exportLabel?: string
}

export function PaginationControls({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  dataLength,
  onExport,
  exportLabel = "Export",
}: PaginationControlsProps) {
  const totalPages = getTotalPages(totalItems, itemsPerPage)
  const pageInfo = getPageInfo(currentPage, totalItems, itemsPerPage)

  if (dataLength === 0) return null

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-t shrink-0 bg-muted/20">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {pageInfo.startItem}-{pageInfo.endItem} of {totalItems}
        </p>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="flex items-center gap-2 h-8"
          >
            <RiDownloadLine className="h-4 w-4" />
            {exportLabel}
          </Button>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="h-8"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {currentPage}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onPageChange((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="h-8"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
