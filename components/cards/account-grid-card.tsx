import { memo } from "react"
import { ArrowUpRight, CircleCheck, Eye, ExternalLink, Globe } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/company-logo"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Account } from "@/lib/types"
import { ensureAbsoluteUrl } from "@/lib/utils"
interface AccountGridCardProps {
  account: Account
  onClick: () => void
}

export const AccountGridCard = memo(({ account, onClick }: AccountGridCardProps) => {
  const location = [account.account_hq_city, account.account_hq_country]
    .filter(Boolean)
    .join(", ")
  const accountName = account.account_global_legal_name || "Account"
  const isNasscomVerified = account.account_nasscom_status?.toLowerCase() === "yes"
  const visibilityNote =
    account.account_visibility === "exclude" && account.account_visibility_note
      ? account.account_visibility_note
      : null
  const showChipRow = isNasscomVerified || visibilityNote !== null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="h-full animate-stagger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          role="button"
          aria-label={`View details for ${accountName}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
        >
          <CardContent className="p-4 flex flex-col gap-4 h-full">
            <div className="flex items-start gap-3">
              <CompanyLogo
                domain={account.account_hq_website ?? undefined}
                companyName={accountName}
                size="md"
                theme="auto"
              />
              <div className="min-w-0">
                <h3
                  className="min-w-0 truncate text-base font-semibold leading-snug text-foreground"
                  title={accountName}
                >
                  {accountName}
                </h3>
                <p
                  className="text-sm text-muted-foreground mt-1 truncate"
                  title={location || account.account_hq_country || "-"}
                >
                  {location || account.account_hq_country || "-"}
                </p>
                {showChipRow && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isNasscomVerified && (
                      <div
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#C03430]/15 text-[#C03430]"
                        title="NASSCOM listed"
                      >
                        <CircleCheck className="h-3 w-3" aria-hidden="true" />
                        NASSCOM
                      </div>
                    )}
                    {visibilityNote && (
                      <div
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 max-w-[220px]"
                        title={visibilityNote}
                      >
                        <span className="truncate">{visibilityNote}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Industry</span>
                  <span
                    className="font-medium text-foreground text-right truncate max-w-[160px]"
                    title={account.account_hq_industry || "-"}
                  >
                    {account.account_hq_industry || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Revenue</span>
                  <span
                    className="font-medium text-foreground text-right truncate max-w-[160px]"
                    title={account.account_hq_revenue_range || "-"}
                  >
                    {account.account_hq_revenue_range || "-"}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onClick}
                className="w-full justify-between border border-border/70 bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                View Details
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <Eye className="h-4 w-4" />
          View Details
        </ContextMenuItem>
        {account.account_hq_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_website!), "_blank", "noopener,noreferrer")}>
              <Globe className="h-4 w-4" />
              Open Website
            </ContextMenuItem>
          </>
        )}
        {account.account_hq_linkedin_link && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_linkedin_link!), "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

AccountGridCard.displayName = "AccountGridCard"
