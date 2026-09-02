# RBAC and Auth Guards

> **Scope:** Code-level role enforcement and request authentication, distinct from Supabase project setup (see [Supabase Auth Setup](supabase-auth-setup.md) for the `profiles` table, RLS policies, and triggers).

---

## 1. Roles

Two roles exist, defined in `lib/auth/roles.ts`:

| Role | Capabilities |
|------|--------------|
| `viewer` | Read-only dashboard access. Default role for new sign-ups. |
| `admin` | Everything `viewer` has, plus data export (`canExportData()` returns `true`). |

```typescript
export type UserRole = "viewer" | "admin"
export const DEFAULT_USER_ROLE: UserRole = "viewer"
export function normalizeUserRole(role: unknown): UserRole // coerces anything not exactly "admin" to "viewer"
export function canExportData(role: UserRole): boolean // role === "admin"
```

`normalizeUserRole` is the single choke point for role coercion. Any value read from `public.profiles.role` (or from an untrusted source) should pass through it before being used, so a malformed or unexpected value always falls back to `viewer` rather than granting access by accident.

## 2. Client-Side Guard: `useAuthGuard`

`hooks/use-auth-guard.ts` is the hook every authenticated page mounts. On mount it:

1. Calls `supabase.auth.getSession()`. No session → `router.replace("/signin")`.
2. With a session, stores `userId` and `userEmail`, then queries `public.profiles` for `role` and normalizes it via `normalizeUserRole`.
3. Subscribes to `supabase.auth.onAuthStateChange` so a sign-out in another tab redirects immediately.

Returns `{ authReady, userId, userEmail, userRole }`. `authReady` gates rendering so the dashboard doesn't flash before the redirect (or before the role is known) resolves.

This is a **client-side** guard only. It protects the UI from rendering for signed-out users; it does not protect API routes. Route handlers must authenticate independently (see below).

## 3. Server-Side Request Auth: `lib/auth/server.ts`

For API routes (not Server Actions, which run in the authenticated request context automatically), authentication is verified explicitly:

```typescript
extractBearerToken(authHeader: string | null): string | null
resolveAuthenticatedUserId(accessToken: string): Promise<string>
```

`extractBearerToken` parses `Authorization: Bearer <token>` headers. `resolveAuthenticatedUserId` calls `supabase.auth.getUser(token)` with a module-level, non-persisting Supabase client (`persistSession: false`) and returns the verified `user.id`, throwing if the token is missing, malformed, or rejected by Supabase.

Successful validations are cached in-process for 60 seconds (`TOKEN_CACHE_TTL_MS`, max 500 entries with oldest-entry eviction) so warm dashboard requests skip the Supabase auth round trip. The accepted tradeoff: a revoked token keeps working for up to 60 seconds on instances that saw it recently, which is acceptable for read-only dashboard data. Failed validations are never cached.

Route handlers that need to know who's calling (for example, the exports and server-mode data routes) use this pair to turn a raw header into a trusted user ID before doing anything else. There is no separate role check baked into this helper: routes that need `admin` (exports) fetch the caller's `profiles.role` themselves and call `canExportData()`.

## 4. Sign-in / Sign-up Validation: `lib/validators/auth.ts`

Zod schemas used by the auth forms (`components/auth/*`) and any server-side re-validation:

| Schema | Fields | Notes |
|--------|--------|-------|
| `signInSchema` | `email`, `password`, `rememberMe` | Password minimum 6 characters. |
| `signUpSchema` | `firstName`, `lastName`, `email`, `phone`, `password` | Phone required, 7-20 characters. |
| `forgotPasswordSchema` | `email` | |
| `updatePasswordSchema` | `password`, `confirmPassword` | Minimum 8 characters; `.refine()` enforces the two fields match. |

## 5. Where Role Checks Actually Gate Behavior

| Location | Check |
|----------|-------|
| `components/export/*` | Export button disabled unless `canExportData(userRole)`. |
| `app/api/exports/*` route handlers | Re-check role server-side; never trust a client-disabled button as the only guard. |
| `hooks/use-auth-guard.ts` | Redirects unauthenticated sessions before any protected UI mounts. |

The rule for new admin-only features: enforce the check in the route handler or Server Action, not only in the component. The UI check is a convenience, not the security boundary.

---

## Related Files

| File | Purpose |
|------|---------|
| `lib/auth/roles.ts` | Role type, default role, normalization, `canExportData()` |
| `lib/auth/server.ts` | Bearer token extraction and Supabase token verification for route handlers |
| `hooks/use-auth-guard.ts` | Client-side session/role guard used by protected pages |
| `lib/validators/auth.ts` | Zod schemas for sign-in, sign-up, forgot/update password forms |
| `documentation/backend/supabase-auth-setup.md` | `profiles` table schema, RLS policies, auth triggers |
| `tests/unit/auth-server.test.ts` | Tests for `lib/auth/server.ts` |
| `tests/unit/config-auth-request.test.ts` | Tests for auth-related request config |
