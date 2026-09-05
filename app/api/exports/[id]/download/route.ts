import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { getSupabaseServiceRoleClient, USER_EXPORTS_BUCKET } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const logger = createLogger("api/exports/download")

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function authenticateFromHeader(request: Request): Promise<string | Response> {
  const headerToken = extractBearerToken(request.headers.get("authorization"))

  if (!headerToken) return jsonError(401, "Missing authorization token")

  try {
    return await resolveAuthenticatedUserId(headerToken)
  } catch {
    return jsonError(401, "Invalid or expired token")
  }
}

type ExportRow = {
  id: string
  user_id: string
  filename: string
  storage_path: string
}

async function fetchExportRow(id: string): Promise<ExportRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server config missing")

  const url = `${supabaseUrl}/rest/v1/user_exports?select=id,user_id,filename,storage_path&id=eq.${encodeURIComponent(id)}&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Export lookup failed ${res.status}: ${body}`)
  }
  const rows = (await res.json()) as ExportRow[]
  return rows[0] ?? null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authenticateFromHeader(request)
  if (auth instanceof Response) return auth
  const userId = auth

  const limited = await enforceRateLimit({ userId, bucket: "exports:download" })
  if (!limited.ok) return limited.response

  let exportRow: ExportRow | null
  try {
    exportRow = await fetchExportRow(id)
  } catch (err) {
    logger.error("download_lookup_failed", { error: err })
    return jsonError(500, "Failed to look up export")
  }
  if (!exportRow || exportRow.user_id !== userId) {
    return jsonError(404, "Export not found")
  }

  const supabase = getSupabaseServiceRoleClient()
  const { data: signed, error: signedErr } = await supabase.storage
    .from(USER_EXPORTS_BUCKET)
    .createSignedUrl(exportRow.storage_path, 60, {
      download: exportRow.filename,
    })

  if (signedErr || !signed?.signedUrl) {
    logger.error("signed_url_failed", { error: signedErr })
    return jsonError(500, "Failed to generate download URL")
  }

  if (request.headers.get("accept")?.includes("application/json")) {
    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    })
  }

  return Response.redirect(signed.signedUrl, 302)
}
