import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Checks the request's Bearer token. Returns the signed-in user, or the 401
 * response to send back as is:
 *
 *   const auth = await authenticateRequest(request)
 *   if (auth instanceof Response) return auth
 *   const { userId } = auth
 */
export async function authenticateRequest(request: Request): Promise<{ userId: string } | Response> {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return unauthorized("Missing authorization token")
  try {
    return { userId: await resolveAuthenticatedUserId(token) }
  } catch {
    return unauthorized("Invalid or expired token")
  }
}
