/**
 * Feature flag for the server-backed dashboard data path (#249). When on, the
 * dashboard reads from the paginated/aggregated endpoints instead of the full
 * /api/dashboard payload. NEXT_PUBLIC_ so the client bundle can branch; the
 * value is inlined at build time.
 */
export function isServerDashboardEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DASHBOARD_SERVER_MODE === "1"
}
