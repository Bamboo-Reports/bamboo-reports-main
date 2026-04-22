import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { getSupabaseServiceRoleClient, USER_EXPORTS_BUCKET } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function authenticateFromQueryOrHeader(request: Request): Promise<string | Response> {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get("access_token")
  const headerToken = extractBearerToken(request.headers.get("authorization"))
  const token = headerToken || queryToken

  if (!token) return jsonError(401, "Missing authorization token")

  try {
    return await resolveAuthenticatedUserId(token)
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
  { params }: { params: { id: string } }
) {
  const auth = await authenticateFromQueryOrHeader(request)
  if (auth instanceof Response) return auth
  const userId = auth

  let exportRow: ExportRow | null
  try {
    exportRow = await fetchExportRow(params.id)
  } catch (err) {
    console.error("[exports] download lookup failed:", err)
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
    console.error("[exports] signed url failed:", signedErr)
    return jsonError(500, "Failed to generate download URL")
  }

  return Response.redirect(signed.signedUrl, 302)
}
