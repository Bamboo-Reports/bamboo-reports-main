"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AccountAISummaryResponse } from "@/lib/ai/account-summary"

export async function requestAccountSummary(accountName: string): Promise<AccountAISummaryResponse> {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error("No active session. Please sign in again.")
  }

  const response = await fetch("/api/accounts/ai-summary", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountName }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `AI summary request failed (${response.status}).`)
  }

  return response.json() as Promise<AccountAISummaryResponse>
}
