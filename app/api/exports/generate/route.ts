import { randomUUID } from "node:crypto"
import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { getSupabaseServiceRoleClient, USER_EXPORTS_BUCKET } from "@/lib/supabase/server"
import { getClientInfo } from "@/lib/request/client-info"
import {
  buildServerExport,
  type ServerExportDatasetKey,
} from "@/lib/exports/server-builder"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isLocalIp(val: string | null) {
  return !val || val === "::1" || val === "127.0.0.1" || val.startsWith("::ffff:127.")
}

const VALID_DATASETS: ServerExportDatasetKey[] = ["accounts", "centers", "services", "prospects"]

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)

  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }

  let body: {
    datasets?: string[]
    accountNames?: string[] | null
    centerKeys?: string[] | null
    isFiltered?: boolean
    filtersApplied?: unknown
    clientPublicIp?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const datasets = (body.datasets ?? []).filter((d): d is ServerExportDatasetKey =>
    VALID_DATASETS.includes(d as ServerExportDatasetKey)
  )
  if (datasets.length === 0) {
    return json({ error: "At least one dataset must be selected" }, 400)
  }

  let buildResult
  try {
    buildResult = await buildServerExport({
      datasets,
      accountNames: body.accountNames ?? null,
      centerKeys: body.centerKeys ?? null,
    })
  } catch (err) {
    console.error("[exports/generate] build failed:", err)
    return json({ error: "Failed to build export" }, 500)
  }

  const { buffer, rowCounts, totalRows } = buildResult

  const exportId = randomUUID()
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
  const filename = `dashboard-export-${timestamp}.xlsx`
  const storagePath = `${userId}/${exportId}.xlsx`

  const supabase = getSupabaseServiceRoleClient()
  const upload = await supabase.storage
    .from(USER_EXPORTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: XLSX_CONTENT_TYPE,
      upsert: false,
    })
  if (upload.error) {
    console.error("[exports/generate] storage upload failed:", upload.error)
    return json({ error: "Failed to archive export" }, 500)
  }

  const { ip: headerIp, userAgent } = getClientInfo(request)
  const ip =
    (isLocalIp(headerIp) && body.clientPublicIp) || headerIp || body.clientPublicIp || null

  const datasetRowCounts: Record<string, number> = {}
  for (const d of datasets) datasetRowCounts[d] = rowCounts[d]

  const insert = await supabase
    .from("user_exports")
    .insert({
      id: exportId,
      user_id: userId,
      filename,
      file_size_bytes: buffer.byteLength,
      storage_path: storagePath,
      datasets,
      row_counts: datasetRowCounts,
      total_rows: totalRows,
      filters_applied: body.filtersApplied ?? null,
      is_filtered: Boolean(body.isFiltered),
      client_ip: ip,
      user_agent: userAgent,
    })
    .select("id, filename")
    .single()

  if (insert.error) {
    console.error("[exports/generate] insert failed:", insert.error)
    await supabase.storage.from(USER_EXPORTS_BUCKET).remove([storagePath])
    return json({ error: `Failed to record export: ${insert.error.message}` }, 500)
  }

  console.log(
    `[exports/generate] ok id=${exportId} user=${userId} rows=${totalRows} bytes=${buffer.byteLength}`
  )

  return json({
    id: exportId,
    filename,
    totalRows,
    rowCounts: datasetRowCounts,
    downloadPath: `/api/exports/${exportId}/download`,
  }, 201)
}
