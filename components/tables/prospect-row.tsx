import { memo } from "react"
import { TableRow, TableCell } from "@/components/ui/table"
import type { Prospect } from "@/lib/types"

interface ProspectRowProps {
  prospect: Prospect
  onClick: () => void
}

export const ProspectRow = memo(({ prospect, onClick }: ProspectRowProps) => {
  const fullName =
    prospect.prospect_full_name ||
    [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ")
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:bg-muted/70"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
      tabIndex={0}
      aria-label={`View prospect details for ${fullName || "prospect"}`}
    >
      <TableCell>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">
            {initials}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-medium max-w-[220px]">
        <div className="min-w-0 truncate" title={fullName || "N/A"}>
          {fullName || "N/A"}
        </div>
      </TableCell>
      <TableCell className="max-w-[200px]">
        <div
          className="truncate"
          title={[prospect.prospect_city, prospect.prospect_country].filter(Boolean).join(", ") || "N/A"}
        >
          {[prospect.prospect_city, prospect.prospect_country].filter(Boolean).join(", ") || "N/A"}
        </div>
      </TableCell>
      <TableCell className="max-w-[220px]">
        <div className="truncate" title={prospect.prospect_title || "N/A"}>
          {prospect.prospect_title || "N/A"}
        </div>
      </TableCell>
      <TableCell className="max-w-[180px]">
        <div className="truncate" title={prospect.prospect_department || "N/A"}>
          {prospect.prospect_department || "N/A"}
        </div>
      </TableCell>
    </TableRow>
  )
})
ProspectRow.displayName = "ProspectRow"
