import type { Account, Center, Prospect } from "@/lib/types"
import type { RecordHistoryItem } from "@/contexts/record-history-context"
import { formatCenterLocation } from "@/lib/utils/helpers"
import { getProspectDisplayName, getProspectRecordId } from "@/lib/dashboard/prospect-id"

// History entries for each record type, shared by the detail dialogs that
// record them (#310).

export function accountHistoryItem(account: Account): RecordHistoryItem {
  return {
    type: "account",
    id: account.account_global_legal_name ?? "",
    title: account.account_global_legal_name ?? "Unknown Account",
    subtitle: [account.account_hq_city, account.account_hq_country].filter(Boolean).join(", "),
  }
}

export function centerHistoryItem(center: Center): RecordHistoryItem {
  return {
    type: "center",
    id: center.cn_unique_key ?? "",
    title: center.center_name ?? "Unknown Centre",
    subtitle: formatCenterLocation(center.center_city, center.center_state),
  }
}

export function prospectHistoryItem(prospect: Prospect): RecordHistoryItem {
  return {
    type: "prospect",
    id: getProspectRecordId(prospect),
    title: getProspectDisplayName(prospect),
    subtitle: prospect.prospect_title || prospect.prospect_department || prospect.account_global_legal_name || "",
  }
}
