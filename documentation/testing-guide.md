# Testing Guide

> **Scope:** Deep reference for the Vitest test suite under `tests/`. Covers runner config, directory conventions, mocking patterns for Prisma/Supabase/fetch, React Testing Library usage, and how to add new tests. See `documentation/developer-workflow.md` for the short pointer to this doc.

## 1. Test Runner Setup

Config lives at `vitest.config.ts` (repo root):

```ts
import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
      // "server-only" throws on import outside a Server Component; stub it so
      // tests can import modules that transitively pull it in (lib/db/warehouse).
      "server-only": resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    env: {
      // Response caching off by default so repeated route calls stay observable;
      // cache-specific tests opt back in explicitly.
      DASHBOARD_CACHE_TTL_MS: "0",
    },
  },
})
```

Key points:

| Setting | Value | Notes |
|---|---|---|
| Default environment | `node` | Most tests (server actions, lib helpers, API routes) run in plain Node. |
| Per-file override | `// @vitest-environment jsdom` | Add as the first line of any file that renders React components (see `tests/unit/card.test.tsx`, `tests/unit/summary-cards.test.tsx`). |
| Alias | `@` -> repo root | Matches `tsconfig.json`, so tests import app code the same way app code does (`@/lib/...`, `@/app/...`, `@/components/...`). |
| `server-only` stub | `tests/stubs/server-only.ts` | The real `server-only` package throws on import to enforce the server/client boundary at build time. The alias replaces it with an empty module so tests can import server-guarded code (e.g. `lib/db/warehouse`). Older tests that predate the alias also `vi.mock("server-only", () => ({}))`; new tests don't need to. |
| Include glob | `tests/**/*.test.ts(x)` | Anything outside `tests/` is not picked up, and files must end in `.test.ts` or `.test.tsx`. |
| `test.env` | `DASHBOARD_CACHE_TTL_MS: "0"` | Disables dashboard response caching for the whole suite so repeated route calls hit the handler; cache-behavior tests set their own TTL explicitly. |
| Coverage | Not wired into `vitest.config.ts` or `package.json` scripts | `@vitest/coverage-v8` is installed as a devDependency, so `npx vitest run --coverage` works ad hoc, but there's no `npm run` shortcut or enforced threshold. |
| setupFiles | None | There is no global setup file. jsdom-specific globals (e.g. `matchMedia`, `ResizeObserver`) are stubbed per-test where needed (see section 4). |

## 2. Directory Conventions

```
tests/
  api/          API route handlers (app/api/**/route.ts)
  fixtures/     Shared fixture builders, no assertions here
  integration/  Multiple internal modules composed together; includes the
                *-realdata.test.ts suites gated on DATABASE_URL (section 6)
  stubs/        Module stand-ins wired via resolve.alias (server-only)
  unit/         Single function/module/component in isolation
```

| Directory | What goes here | Example |
|---|---|---|
| `tests/unit/` | One function, hook, or component tested in isolation with mocked dependencies. Largest folder by count. Includes the pg-mem-backed SQL suites (section 6). | `tests/unit/filter-helpers.test.ts`, `tests/unit/card.test.tsx`, `tests/unit/filtering-sql-parity.test.ts` |
| `tests/integration/` | Several real (unmocked) internal modules exercised together, e.g. filtering + search index + a builder pipeline. External I/O (fetch, Supabase) is still mocked, but internal app logic is not. `*-realdata.test.ts` files additionally hit the live Neon warehouse when `DATABASE_URL` is set (section 6). | `tests/integration/dashboard-filtering.test.ts`, `tests/integration/filtering-sql-realdata.test.ts` |
| `tests/api/` | Next.js route handlers (`GET`/`POST`/etc. exported from `app/api/**/route.ts`), invoked directly with a `Request` object. Mocks auth, rate limiting, the warehouse/data layer, Supabase, and logger. | `tests/api/dashboard-route.test.ts`, `tests/api/dashboard-summary-route.test.ts` |
| `tests/fixtures/` | Reusable builder functions for domain objects. No `describe`/`it` blocks. | `tests/fixtures/domain.ts` |
| `tests/stubs/` | Empty or minimal modules substituted for real packages via `resolve.alias` in `vitest.config.ts`. Not test files. | `tests/stubs/server-only.ts` |

The mapping mirrors the app: `tests/api` mirrors `app/api`, `tests/unit`/`tests/integration` mirror `lib/`, `components/`, `hooks/`, `app/actions/`. When adding a test, put it in the folder matching what you're proving, not where the source file lives on disk.

### `tests/fixtures/domain.ts`

Provides one `make*` builder per core domain entity (`Account`, `Center`, `Function`, `Service`, `Prospect`, `Tech`, `Alias`) plus `makeFilters` and the `fv` helper for building a single `FilterValue`. Each builder returns a fully-populated, realistic default object and accepts a `Partial<T>` of overrides:

```ts
export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    account_global_legal_name: "Acme Corp",
    account_hq_country: "India",
    account_visibility: "include",
    account_hq_revenue: 1000,
    // ...more defaults
    ...overrides,
  } as Account
}
```

`makeFilters(overrides)` wraps `createDefaultFilters` from `lib/dashboard/defaults`, so tests get a real, app-consistent default `Filters` object rather than a hand-rolled partial. Use these builders in any new unit/integration test instead of inlining object literals: it keeps tests resilient to new required fields on the domain types.

## 3. Mocking Server Actions, Prisma, Supabase, Fetch

All mocking uses Vitest's `vi.mock` with **module-level factory functions**, and `vi.hoisted` when the mock needs to be referenced both inside the factory and inside test bodies (hoisting is required because `vi.mock` calls are hoisted to the top of the file by Vitest).

### Prisma (`lib/db/prisma.ts`)

Mock the two exports used everywhere (`getPrismaOrThrow`, `queryWithRetry`) and drive return values per test:

```ts
vi.mock("@/lib/db/prisma", () => ({
  getPrismaOrThrow: vi.fn(),
  queryWithRetry: vi.fn(),
}))

// inside a test:
vi.mocked(dbPrisma.getPrismaOrThrow).mockReturnValueOnce({} as any)
vi.mocked(dbPrisma.queryWithRetry).mockResolvedValueOnce([{ unread_count: 5 }])
```

Source: `tests/unit/actions-notifications.test.ts`.

### Supabase

Two shapes appear depending on client vs. server code:

- **Client-side auth session** (`lib/supabase/client.ts`): mock `getSupabaseBrowserClient` to return an object exposing only the methods under test.
- **Server-side service role client** (`lib/supabase/server.ts`): mock `getSupabaseServiceRoleClient().from(table)` with a hand-built chainable query builder that only implements the chain the code under test actually calls (`.select().eq().maybeSingle()`, etc).

```ts
const getSession = vi.hoisted(() => vi.fn())
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}))
```

Source: `tests/integration/export-request-client.test.ts` (client), `tests/api/exports-routes.test.ts` (server, chainable `.from()` builder).

For raw `@supabase/supabase-js`, mock `createClient` itself and set its return value per test:

```ts
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }))
;(createClient as any).mockReturnValue({ auth: { getUser: mockGetUser } })
```

Source: `tests/unit/auth-server.test.ts`.

### Internal app modules (warehouse/auth/rate limit/logger)

API route tests mock `@/lib/db/warehouse` (`queryWarehouse`), `@/lib/auth/server`, `@/lib/rate-limit/server` and `@/lib/logger` wholesale via `vi.hoisted` objects, then import the route's `GET`/`POST` and call them directly with a real `Request`:

```ts
const warehouseMocks = vi.hoisted(() => ({ queryWarehouse: vi.fn() }))
const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((h: string | null) => (h === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))
vi.mock("@/lib/db/warehouse", () => warehouseMocks)
vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/rate-limit/server", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

const res = await POST(new Request("https://example.com/api/dashboard/summary", {
  method: "POST",
  headers: { authorization: "Bearer token-1", "content-type": "application/json" },
  body: JSON.stringify({ filters: {} }),
}))
expect(res.status).toBe(200)
```

Queue one `mockResolvedValueOnce` result row-set per SQL statement the route issues, in issue order, or use `mockImplementation` keyed on the SQL text when the order is not stable. `vi.clearAllMocks()` in `beforeEach` resets call state between tests. Source: `tests/api/dashboard-summary-route.test.ts`, `tests/api/entity-query-route.test.ts`, `tests/api/search-route.test.ts`, `tests/api/account-related-route.test.ts`.

### `fetch`

Stub the global with `vi.stubGlobal("fetch", ...)`, returning real `Response` objects (or plain objects with `ok`/`status`/`json`/`text` for edge cases like malformed error bodies). Reset with `vi.unstubAllGlobals()` in `beforeEach`:

```ts
beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it("posts the export request", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ip: "203.0.113.20" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "export-1" }), { status: 201 }))
  vi.stubGlobal("fetch", fetchMock)

  await requestServerExport({ /* ... */ })
  expect(fetchMock).toHaveBeenLastCalledWith("/api/exports/generate", expect.objectContaining({ method: "POST" }))
})
```

Source: `tests/integration/export-request-client.test.ts`, including the pattern for simulating a response whose `.json()` and `.text()` both reject (to cover error-formatting fallback branches).

### Fake timers

For cache TTL / stale-while-revalidate logic, use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` / `vi.runAllTimersAsync()` / `vi.useRealTimers()`:

```ts
vi.useFakeTimers()
await GET(request) // populate cache
vi.advanceTimersByTime(3600001) // past 1h TTL
const res = await GET(request) // served STALE, revalidation kicked off in background
await vi.runAllTimersAsync()
vi.useRealTimers()
```

Source: `tests/api/dashboard-route.test.ts`.

## 4. React Component Tests (React Testing Library)

Requirements for any file that renders JSX:

1. First line: `// @vitest-environment jsdom` (config default is `node`).
2. Import `render` (and `fireEvent`, `cleanup` if needed) from `@testing-library/react`.
3. Call `cleanup()` in `afterEach` when a `describe` block renders more than once, to avoid leaking DOM nodes between tests.
4. Stub jsdom-missing browser APIs the component needs (`matchMedia`, `ResizeObserver`) in `beforeEach`, not globally, since only some components need them.

Simple render/structure check (`tests/unit/card.test.tsx`):

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"

it("renders all card subcomponents", () => {
  const { container } = render(
    <Card data-testid="card" className="custom-card">
      <CardHeader className="custom-header">
        <CardTitle className="custom-title">Title</CardTitle>
      </CardHeader>
    </Card>
  )
  expect(container.querySelector(".custom-card")).not.toBeNull()
})
```

Interaction + mocked dependency check (`tests/unit/summary-cards.test.tsx`):

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import * as dashboardAccess from "@/lib/config/dashboard-access"
import { toast } from "sonner"

vi.mock("@/lib/config/dashboard-access", () => ({
  isSectionEnabled: vi.fn(),
  getSectionUnavailableMessage: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((q) => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) })
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})
afterEach(() => cleanup())

it("handles click events on enabled sections", () => {
  vi.mocked(dashboardAccess.isSectionEnabled).mockReturnValue(true)
  const onSelect = vi.fn()
  const { getByText } = render(<SummaryCards /* props */ onSelect={onSelect} />)
  const card = getByText("Accounts").closest(".rounded-xl")
  if (card) fireEvent.click(card)
  expect(onSelect).toHaveBeenCalledWith("accounts")
})
```

Notes on the pattern actually used in this repo:

- Selection is by visible text (`getByText`) plus DOM traversal (`.closest(".rounded-xl")`) rather than `data-testid` or ARIA roles. Match this unless the component under test has no stable text.
- Keyboard interaction is tested with `fireEvent.keyDown(el, { key: "Enter" })` alongside click, when the component supports both.
- There is no `@testing-library/jest-dom` setup file in this repo; assertions use plain `expect(x).not.toBeNull()` / `toBeInTheDocument`-style matchers are not configured, so stick to `container.querySelector(...)` and RTL query results directly.

## 5. Running Tests

| Task | Command |
|---|---|
| Run full suite once | `npm run test` |
| Watch mode | `npm run test:watch` |
| Run a single file | `npx vitest run tests/unit/filter-helpers.test.ts` |
| Run tests matching a name | `npx vitest run -t "handles empty unread count result"` |
| Coverage (ad hoc, not wired to a script) | `npx vitest run --coverage` |
| Real-data suites (see section 6) | Set `DATABASE_URL` in `.env`, then run normally, e.g. `npx vitest run tests/integration/filtering-sql-realdata.test.ts` |

`npm run test` must pass before opening a PR (also stated in `documentation/developer-workflow.md`).

## 6. Real-Data and pg-mem SQL Tests

Two categories exist specifically to prove the SQL filter builders (`lib/dashboard/filtering-sql.ts` and friends) match the reference client-side engine (`lib/dashboard/filtering.ts`).

### pg-mem-backed suites (always run)

`pg-mem` (devDependency) provides an in-memory Postgres, so generated SQL executes for real without a database:

- `tests/unit/pgmem-smoke.test.ts`: proves the pg-mem adapter handles the SQL primitives the builders emit (`= ANY($1::text[])`, exclude-with-null passthrough, `LIKE` on `lower(coalesce(...))`, range buckets, chained CTE + `IN`).
- `tests/unit/filtering-sql-parity.test.ts`: the parity suite. Seeds a fixed fixture set (nulls, exclude visibility, keyless rows), runs a list of named filter scenarios plus a seeded-LCG fuzz loop of random filter combinations, and asserts the SQL result equals the client engine's result for each. Deterministic: the fuzz seed is fixed, so failures reproduce.

Pattern: `newDb()` from `pg-mem`, `db.adapters.createPg()` for a `Pool`, create tables and insert fixtures with plain SQL, then execute the builder output. No mocking, no network, runs in the normal `npm run test` pass.

### Real-data suites (gated on `DATABASE_URL`)

`tests/integration/*-realdata*.test.ts` run the same parity checks against the live Neon warehouse. Gating is a describe-level switch, not an env flag:

```ts
loadEnv() // dotenv: vitest does not read .env automatically
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

gated("filtering-sql parity against the real Neon warehouse", () => { ... })
```

With no `DATABASE_URL` in `.env` (or the environment) the whole file reports as skipped; with one set, `npm run test` includes them automatically. There is no separate script or `--` flag. Current files: `filtering-sql-realdata.test.ts`, `export-workbook-realdata.test.ts` (full xlsx build via `buildServerExport` with per-sheet row-count parity), `export-workbook-realdata-more.test.ts`, `export-filters-realdata.test.ts`, `centers-map-realdata.test.ts`. They read the warehouse only (selects), derive scenario values (most common country, industry, etc.) from live data, and compare SQL results against the client engine over the same rows. Expect them to be slower; run one file at a time while iterating.

## 7. Naming and Organization Conventions

- File name: `kebab-case`, `<subject>.test.ts` or `.test.tsx`, mirroring the source module's name where reasonable (`chart-helpers.test.ts` for `lib/utils/chart-helpers.ts`, `auth-server.test.ts` for `lib/auth/server.ts`).
- One `describe` block per module/route/component, named after the subject in plain English (`"dashboard API route"`, `"dashboard filtering"`, `"summary-cards"`).
- Nested `describe` per exported function when a module exports several (see `tests/unit/actions-notifications.test.ts`: `describe("getUnreadCount")`, `describe("markAllAsRead")`, etc.).
- `it` descriptions are full sentences describing behavior, not implementation (`"rejects with 401 if token is invalid or expires"`, not `"calls resolveAuthenticatedUserId"`).
- Group happy-path and edge-case tests explicitly when a module has many of each, e.g. a trailing `describe("happy paths for query functions")` after several error-path `describe` blocks.
- Reset mock state in `beforeEach` with `vi.clearAllMocks()` (or `vi.resetAllMocks()` when return-value implementations must also be cleared) rather than relying on default behavior across tests.
- Route/component test files place all `vi.mock(...)` calls at the top of the file, above the `describe` block, using `vi.hoisted` for any mock object referenced by both the factory and the test bodies.

## 8. Adding a New Test: Walkthrough

Example: you added `lib/utils/discount.ts` exporting `applyDiscount(amount, pct)`.

1. Decide the folder: pure function, no I/O, tested alone -> `tests/unit/`.
2. Create `tests/unit/discount.test.ts`.
3. Import from the module under test using the `@/` alias, plus fixtures if the function takes domain objects:
   ```ts
   import { describe, expect, it } from "vitest"
   import { applyDiscount } from "@/lib/utils/discount"
   ```
4. If the function depends on another internal module (e.g. a config lookup), mock it at the top of the file with `vi.mock("@/lib/config/...", () => ({ ... }))`.
5. Write a `describe("applyDiscount")` block with one `it` per behavior, including edge cases (zero, negative, over 100%).
6. If the function renders anything (it won't here, but for a component): add `// @vitest-environment jsdom` as line 1 and use `render`/`fireEvent` from `@testing-library/react`.
7. Run just this file while iterating: `npx vitest run tests/unit/discount.test.ts` or `npx vitest tests/unit/discount.test.ts` for watch mode.
8. Run the full suite (`npm run test`) before committing to check for regressions elsewhere.

## Related Files

| File | Purpose |
|---|---|
| `vitest.config.ts` | Vitest configuration: environment, `@` alias, `server-only` stub, test file glob, `DASHBOARD_CACHE_TTL_MS=0`. |
| `tests/stubs/server-only.ts` | Empty stand-in for the `server-only` package (wired via `resolve.alias`). |
| `tests/fixtures/domain.ts` | Shared domain object builders (`makeAccount`, `makeCenter`, `makeFilters`, etc.). |
| `tests/unit/` | Isolated function/hook/component tests, including the pg-mem SQL suites. |
| `tests/integration/` | Multi-module tests, including the `DATABASE_URL`-gated real-data suites. |
| `tests/api/` | Next.js route handler tests. |
| `documentation/developer-workflow.md` | Setup, scripts, coding standards; links here for testing detail. |
| `package.json` | `test` / `test:watch` scripts; `pg-mem` devDependency. |
