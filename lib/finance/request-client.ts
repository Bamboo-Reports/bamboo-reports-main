import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AccountFinancialInfoResponse } from "@/lib/types"

/**
 * Client-side fetch of company financials via the authenticated,
 * rate-limited /api/financials route. Replaces the former unauthenticated
 * getAccountFinancialInfo server action.
 */
export async function requestAccountFinancialInfo(
  ticker: string
): Promise<AccountFinancialInfoResponse> {
  const supabase = getSupabaseBrowserClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    return { success: false, error: "Not authenticated. Please sign in.", data: null }
  }

  try {
    const res = await fetch(`/api/financials?ticker=${encodeURIComponent(ticker)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (res.status === 429) {
      return {
        success: false,
        error: "Too many financial lookups. Please wait a moment and try again.",
        data: null,
      }
    }

    if (!res.ok) {
      let detail = ""
      try {
        const errJson = await res.json()
        detail = errJson.error ?? ""
      } catch {
        detail = ""
      }
      return { success: false, error: detail || `Request failed (${res.status})`, data: null }
    }

    return (await res.json()) as AccountFinancialInfoResponse
  } catch {
    return { success: false, error: "Failed to fetch financial data", data: null }
  }
}
