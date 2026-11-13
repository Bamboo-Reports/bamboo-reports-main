"use client"

import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import { NO_CENTERS, NO_PROSPECTS, NO_SERVICES, NO_TECH } from "@/lib/dashboard/empty-datasets"
import type { SearchRecordDialogsState } from "@/hooks/use-dashboard-search"

/** The record dialogs opened from global search and history. */
export function SearchRecordDialogs({ dialogs }: { dialogs: SearchRecordDialogsState }) {
  const { account, center, prospect } = dialogs
  return (
    <>
      <AccountDetailsDialog
        account={account.record}
        centers={NO_CENTERS}
        prospects={NO_PROSPECTS}
        services={NO_SERVICES}
        tech={NO_TECH}
        open={account.open}
        onOpenChange={account.onOpenChange}
        fetchRelated
      />
      <CenterDetailsDialog
        center={center.record}
        services={NO_SERVICES}
        tech={NO_TECH}
        open={center.open}
        onOpenChange={center.onOpenChange}
        fetchDetail
        onAccountOpen={center.onAccountOpen}
      />
      <ProspectDetailsDialog
        prospect={prospect.record}
        allProspects={NO_PROSPECTS}
        open={prospect.open}
        onOpenChange={prospect.onOpenChange}
        fetchRelated
        onAccountOpen={prospect.onAccountOpen}
      />
    </>
  )
}
