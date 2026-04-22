export type ClientInfo = {
  ip: string | null
  userAgent: string | null
}

export function getClientInfo(request: Request): ClientInfo {
  const h = request.headers
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null
  return {
    ip: ip || null,
    userAgent: h.get("user-agent") || null,
  }
}
