import { memo } from "react"
import { RiArrowRightUpLine, RiCheckboxCircleLine, RiExternalLinkLine, RiEyeLine, RiGlobalLine } from "@remixicon/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/company-logo"
import { TruncatedText } from "@/components/ui/truncated-text"
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
          className="h-full cursor-pointer select-none transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onClick}
          tabIndex={0}
          role="button"
          aria-label={`View details for ${accountName}`}
          onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
        >
          <CardContent className="p-4 flex flex-col gap-4 h-full">
            <div className="flex items-start gap-3">
              <CompanyLogo
                domain={account.account_hq_website ?? undefined}
                companyName={accountName}
                size="md"
                theme="auto"
                zoom
              />
              <div className="min-w-0">
                <h3 className="min-w-0 text-base font-medium leading-snug text-foreground">
                  <TruncatedText text={accountName} />
                </h3>
                <TruncatedText
                  text={location || account.account_hq_country || "-"}
                  className="text-sm text-muted-foreground mt-1"
                />
                {showChipRow && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isNasscomVerified && (
                      <div className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <RiCheckboxCircleLine className="h-3 w-3" aria-hidden="true" />
                        NASSCOM
                      </div>
                    )}
                    {visibilityNote && (
                      <div className="inline-flex h-5 max-w-[220px] items-center gap-1 rounded-md bg-amber-500/10 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
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
                  <span className="text-muted-foreground">Sub industry</span>
                  <TruncatedText
                    text={account.account_hq_industry || "-"}
                    className="font-medium text-foreground text-right max-w-[160px]"
                    align="end"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground">Revenue</span>
                  <TruncatedText
                    text={account.account_hq_revenue_range || "-"}
                    className="font-medium text-foreground text-right max-w-[160px]"
                    align="end"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  // The card opens on click too; open once.
                  e.stopPropagation()
                  onClick()
                }}
                className="w-full justify-between"
              >
                View details
                <RiArrowRightUpLine className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <RiEyeLine className="h-4 w-4" />
          View details
        </ContextMenuItem>
        {account.account_hq_website && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_website!), "_blank", "noopener,noreferrer")}>
              <RiGlobalLine className="h-4 w-4" />
              Open website
            </ContextMenuItem>
          </>
        )}
        {account.account_hq_linkedin_link && (
          <ContextMenuItem onClick={() => window.open(ensureAbsoluteUrl(account.account_hq_linkedin_link!), "_blank", "noopener,noreferrer")}>
            <RiExternalLinkLine className="h-4 w-4" />
            Open LinkedIn
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

AccountGridCard.displayName = "AccountGridCard"
