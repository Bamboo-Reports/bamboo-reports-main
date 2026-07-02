import { randomUUID } from "node:crypto"
import { z } from "zod"
import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { canExportData, normalizeUserRole, type UserRole } from "@/lib/auth/roles"
import { createLogger } from "@/lib/logger"
import { getSupabaseServiceRoleClient, USER_EXPORTS_BUCKET } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getClientInfo } from "@/lib/request/client-info"
import { getDatasetUnavailableMessage, isDatasetEnabled } from "@/lib/config/dashboard-access"
import {
  buildServerExport,
  type ServerExportDatasetKey,
} from "@/lib/exports/server-builder"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const logger = createLogger("api/exports/generate")

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const MAX_FILTER_VALUES = 5000

// Rolling per-user rate limit, backed by the user_exports audit table.
const EXPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const parsedRateLimit = Number.parseInt(process.env.EXPORT_RATE_LIMIT_PER_HOUR ?? "", 10)
const EXPORT_RATE_LIMIT_MAX =
  Number.isFinite(parsedRateLimit) && parsedRateLimit > 0 ? parsedRateLimit : 20

const exportRequestSchema = z.object({
  datasets: z.array(z.string()).optional(),
  accountNames: z.array(z.string()).max(MAX_FILTER_VALUES).nullish(),
  centerKeys: z.array(z.string()).max(MAX_FILTER_VALUES).nullish(),
  prospectKeys: z.array(z.string()).max(MAX_FILTER_VALUES).nullish(),
  keylessProspectIds: z.array(z.string()).max(MAX_FILTER_VALUES).nullish(),
  // Export-by-filter (#249 Phase 4): dashboard filter state; validated and
  // coerced by parseFilters. Takes precedence over the key lists above.
  filters: z.record(z.string(), z.unknown()).nullish(),
  isFiltered: z.boolean().optional(),
  filtersApplied: z.unknown().optional(),
  clientPublicIp: z.string().nullish(),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isLocalIp(val: string | null) {
  return !val || val === "::1" || val === "127.0.0.1" || val.startsWith("::ffff:127.")
}

// Returns true when the user has hit the export cap. Fails open on lookup
// errors so a transient DB issue never blocks legitimate exports.
async function isRateLimited(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - EXPORT_RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error } = await supabase
    .from("user_exports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since)
  if (error) {
    logger.error("rate_limit_check_failed", { error })
    return false
  }
  return (count ?? 0) >= EXPORT_RATE_LIMIT_MAX
}

async function resolveUserRole(supabase: SupabaseClient, userId: string): Promise<UserRole> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return normalizeUserRole((data as { role?: unknown } | null)?.role)
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

  // Authorize before touching the request body so unauthorized callers get a
  // consistent 403 regardless of body contents (no endpoint behavior leak).
  const supabase = getSupabaseServiceRoleClient()

  let role: UserRole
  try {
    role = await resolveUserRole(supabase, userId)
  } catch (err) {
    logger.error("role_check_failed", { error: err, user_id: userId })
    return json({ error: "Failed to verify export permissions" }, 500)
  }

  if (!canExportData(role)) {
    logger.warn("generate_denied", { user_id: userId, role })
    return json({ error: "Export access denied" }, 403)
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = exportRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return json({ error: "Invalid request body" }, 400)
  }
  const body = parsed.data

  const datasets = (body.datasets ?? []).filter((d): d is ServerExportDatasetKey =>
    VALID_DATASETS.includes(d as ServerExportDatasetKey)
  )
  if (datasets.length === 0) {
    return json({ error: "At least one dataset must be selected" }, 400)
  }
  if (datasets.some((dataset) => !isDatasetEnabled(dataset))) {
    const blockedDataset = datasets.find((dataset) => !isDatasetEnabled(dataset))
    return json({ error: blockedDataset ? getDatasetUnavailableMessage(blockedDataset) : "Dataset unavailable" }, 403)
  }

  if (await isRateLimited(supabase, userId)) {
    return json({ error: "Export rate limit reached. Please wait before generating more exports." }, 429)
  }

  let buildResult
  try {
    buildResult = body.filters
      ? await buildServerExport({
          datasets,
          filters: parseFilters(body.filters),
          access: resolveAccess(),
        })
      : await buildServerExport({
          datasets,
          accountNames: body.accountNames ?? null,
          centerKeys: body.centerKeys ?? null,
          prospectKeys: body.prospectKeys ?? null,
          keylessProspectIds: body.keylessProspectIds ?? null,
        })
  } catch (err) {
    logger.error("build_failed", { error: err })
    return json({ error: "Failed to build export" }, 500)
  }

  const { buffer, rowCounts, totalRows } = buildResult

  const exportId = randomUUID()
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
  const filename = `dashboard-export-${timestamp}.xlsx`
  const storagePath = `${userId}/${exportId}.xlsx`

  const upload = await supabase.storage
    .from(USER_EXPORTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: XLSX_CONTENT_TYPE,
      upsert: false,
  })
  if (upload.error) {
    logger.error("storage_upload_failed", { error: upload.error })
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
    logger.error("insert_failed", { error: insert.error })
    await supabase.storage.from(USER_EXPORTS_BUCKET).remove([storagePath])
    return json({ error: "Failed to record export" }, 500)
  }

  logger.info("generate_succeeded", {
    export_id: exportId,
    user_id: userId,
    total_rows: totalRows,
    bytes: buffer.byteLength,
  })

  return json({
    id: exportId,
    filename,
    totalRows,
    rowCounts: datasetRowCounts,
    downloadPath: `/api/exports/${exportId}/download`,
  }, 201)
}
