import { resolveAuthenticatedUserId, extractBearerToken } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const logger = createLogger("api/exports")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)

  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }

  const limited = await enforceRateLimit({ userId, bucket: "exports:list" })
  if (!limited.ok) return limited.response

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server config missing" }, 500)
  }

  const select =
    "id,created_at,filename,file_size_bytes,datasets,row_counts,total_rows,is_filtered,client_ip,user_agent"
  const url = `${supabaseUrl}/rest/v1/user_exports?select=${encodeURIComponent(select)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`

  const res = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error("list_failed", { status: res.status, body })
    return json({ error: "Failed to list exports" }, 500)
  }

  const data = (await res.json()) as unknown[]
  logger.info("list_succeeded", { user_id: userId, count: data.length })

  return new Response(JSON.stringify({ exports: data }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}
