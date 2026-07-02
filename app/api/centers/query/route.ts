import { handleEntityQuery } from "@/lib/dashboard/entity-query-route"

export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handleEntityQuery("centers", request)
}
