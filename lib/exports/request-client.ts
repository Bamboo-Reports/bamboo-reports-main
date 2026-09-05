import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"

export type ServerExportRequest = {
  datasets: ExportDatasetKey[]
  accountNames: string[] | null
  centerKeys: string[] | null
  prospectKeys: string[] | null
  keylessProspectIds?: string[] | null
  /** Export-by-filter (#249): dashboard filter state; takes precedence over the key lists server-side. */
  filters?: unknown
  isFiltered: boolean
  filtersApplied: unknown
}

export type ServerExportResponse = {
  id: string
  filename: string
  totalRows: number
  rowCounts: Record<string, number>
  downloadPath: string
}

async function resolveClientPublicIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.ip === "string" ? data.ip : null
  } catch {
    return null
  }
}

export async function requestServerExport(
  input: ServerExportRequest
): Promise<ServerExportResponse> {
  const supabase = getSupabaseBrowserClient()
  const [{ data: sessionData }, publicIp] = await Promise.all([
    supabase.auth.getSession(),
    resolveClientPublicIp(),
  ])
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error("No active session; cannot start export.")
  }

  const res = await fetch("/api/exports/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      datasets: input.datasets,
      accountNames: input.accountNames,
      centerKeys: input.centerKeys,
      prospectKeys: input.prospectKeys,
      keylessProspectIds: input.keylessProspectIds ?? null,
      filters: input.filters ?? null,
      isFiltered: input.isFiltered,
      filtersApplied: input.filtersApplied,
      clientPublicIp: publicIp,
    }),
  })

  if (!res.ok) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson.error ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text().catch(() => "")
    }
    throw new Error(`Export failed (${res.status}): ${detail || "no detail"}`)
  }

  return (await res.json()) as ServerExportResponse
}

export async function resolveExportDownloadUrl(exportId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error("No active session; cannot download export.")
  }

  const res = await fetch(`/api/exports/${encodeURIComponent(exportId)}/download`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson.error ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text().catch(() => "")
    }
    throw new Error(`Download failed (${res.status}): ${detail || "no detail"}`)
  }

  const payload = (await res.json()) as { url?: string }
  if (!payload.url) {
    throw new Error("Download URL missing from response.")
  }
  return payload.url
}
