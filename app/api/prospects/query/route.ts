import { handleEntityQuery } from "@/lib/dashboard/entity-query-route"

export const dynamic = "force-dynamic"
// Warehouse aggregations can be slow on a cold cache; allow up to 60s on Vercel.
export const maxDuration = 60

export function POST(request: Request) {
  return handleEntityQuery("prospects", request)
}
