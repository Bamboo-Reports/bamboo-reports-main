// Carries the dashboard's query string (view and filters) through sign-in, so
// a shared link still opens what it points at for someone who is signed out.
// Only a query string is carried, never a path or host, so the value cannot
// send anyone off the dashboard.
const RETURN_PARAM = "next"

/** The sign-in address that comes back to the dashboard with `search` intact. */
export function signInPath(search: string): string {
  if (!search || search === "?") return "/signin"
  return `/signin?${RETURN_PARAM}=${encodeURIComponent(search)}`
}

/** Where to go after sign-in: the dashboard, with the carried query string if there is one. */
export function returnPathFrom(params: { get(name: string): string | null }): string {
  const search = params.get(RETURN_PARAM)
  return search && search.startsWith("?") ? `/${search}` : "/"
}
